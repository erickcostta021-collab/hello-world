import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Metrics logger (fire-and-forget)
let _metricsSupabase: any = null;
function logMetric(functionName: string, statusCode: number, errorType: string | null, processingTimeMs?: number) {
  try {
    if (!_metricsSupabase) {
      _metricsSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    }
    _metricsSupabase.from("webhook_metrics").insert({
      function_name: functionName,
      status_code: statusCode,
      error_type: errorType,
      processing_time_ms: processingTimeMs || null,
    }).then(() => {}).catch(() => {});
  } catch { /* ignore */ }
}

// Retry wrapper for GHL API calls with exponential backoff
async function fetchGHL(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error | null = null;
  const start = Date.now();
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        logMetric("webhook-inbound", 429, "429", Date.now() - start);
        const retryAfter = response.headers.get("retry-after");
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[GHL] Rate limited (429), retry ${attempt + 1}/${maxRetries} in ${waitMs}ms: ${url}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }
      if (response.status >= 500 && attempt < maxRetries) {
        logMetric("webhook-inbound", response.status, "5xx", Date.now() - start);
        const waitMs = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[GHL] Server error (${response.status}), retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (response.ok) logMetric("webhook-inbound", response.status, "success", Date.now() - start);
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logMetric("webhook-inbound", 0, "network", Date.now() - start);
      if (attempt < maxRetries) {
        const waitMs = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[GHL] Network error, retry ${attempt + 1}/${maxRetries} in ${waitMs}ms:`, lastError.message);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastError || new Error("fetchGHL: all retries exhausted");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Helper to download media from UAZAPI and get public URL
// Based on n8n workflow: POST /message/download with { "id": messageId }
async function getPublicMediaUrl(
  baseUrl: string, 
  instanceToken: string, 
  messageId: string
): Promise<string | null> {
  const downloadUrl = `${baseUrl}/message/download`;
  console.log("Trying UAZAPI media download:", { downloadUrl, messageId });

  try {
    const res = await fetch(downloadUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "token": instanceToken, // lowercase as per n8n
      },
      body: JSON.stringify({ id: messageId }),
    });

    const responseText = await res.text();
    console.log("UAZAPI download response:", { status: res.status, body: responseText.substring(0, 500) });

    if (res.ok) {
      try {
        const data = JSON.parse(responseText);
        // n8n uses $json.fileURL
        const fileUrl = data.fileURL || data.fileUrl || data.url || data.URL || 
                       data.file || data.File || data.data?.fileURL || null;
        if (fileUrl) {
          console.log("Got public media URL:", fileUrl);
          return fileUrl;
        }
      } catch {
        // Response might be the URL directly
        if (responseText.startsWith("http")) {
          console.log("Got public media URL (direct):", responseText.substring(0, 100));
          return responseText.trim();
        }
      }
    }
  } catch (e) {
    console.error("Media download attempt failed:", e);
  }

  return null;
}

// Helper to get valid access token (refresh if needed)
async function getValidToken(supabase: any, integration: any, settings: any): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(integration.ghl_token_expires_at);
  const expiresIn1Hour = (expiresAt.getTime() - now.getTime()) < 3600000;

  if (now >= expiresAt || expiresIn1Hour) {
    // Refresh token
    const tokenParams = new URLSearchParams({
      client_id: settings.ghl_client_id,
      client_secret: settings.ghl_client_secret,
      grant_type: "refresh_token",
      refresh_token: integration.ghl_refresh_token,
      user_type: "Location",
    });

    const tokenResponse = await fetchGHL("https://services.leadconnectorhq.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error("Token refresh failed:", { 
        status: tokenResponse.status, 
        body: errorBody,
        hasClientId: !!settings.ghl_client_id,
        hasClientSecret: !!settings.ghl_client_secret,
        hasRefreshToken: !!integration.ghl_refresh_token,
      });
      throw new Error(`Failed to refresh token: ${tokenResponse.status} - ${errorBody.substring(0, 200)}`);
    }

    const tokenData = await tokenResponse.json();
    const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    await supabase
      .from("ghl_subaccounts")
      .update({
        ghl_access_token: tokenData.access_token,
        ghl_refresh_token: tokenData.refresh_token,
        ghl_token_expires_at: newExpiresAt.toISOString(),
        ghl_subaccount_token: tokenData.access_token,
        oauth_last_refresh: new Date().toISOString(),
      })
      .eq("id", integration.id);

    return tokenData.access_token;
  }

  return integration.ghl_access_token;
}

// Helper to add tag to a contact in GHL
async function addTagToContact(contactId: string, tag: string, token: string): Promise<void> {
  if (!tag) return;
  
  console.log("Adding tag to contact:", { contactId, tag });
  
  // First get current tags
  const getResponse = await fetchGHL(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Version": "2021-07-28",
      "Accept": "application/json",
    },
  });

  let currentTags: string[] = [];
  if (getResponse.ok) {
    const contactData = await getResponse.json();
    currentTags = contactData.contact?.tags || [];
  }

  // Check if tag already exists
  if (currentTags.includes(tag)) {
    console.log("Tag already exists on contact:", tag);
    return;
  }

  // Add new tag to existing tags
  const updatedTags = [...currentTags, tag];

  const response = await fetchGHL(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Version": "2021-07-28",
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      tags: updatedTags,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to add tag to contact:", errorText);
    // Don't throw - tag update is not critical
  } else {
    console.log("Tag added successfully:", tag);
  }
}

// Helper to get the PRIMARY contact_id from GHL for a phone number
// This searches ALL contacts with this phone and returns the first one (oldest/primary)
async function getPrimaryContactId(
  phone: string,
  locationId: string,
  token: string
): Promise<string | null> {
  try {
    // Clean phone number - remove all non-digits
    const cleanPhone = phone.replace(/\D/g, "");
    
    // Try with full phone first
    let searchResponse = await fetchGHL(
      `https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&query=${cleanPhone}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Version": "2021-07-28",
          "Accept": "application/json",
        },
      }
    );

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      if (searchData.contacts && searchData.contacts.length > 0) {
        // Return the FIRST contact found (oldest/primary)
        const primaryId = searchData.contacts[0].id;
        console.log("[getPrimaryContactId] Found primary contact:", { 
          phone: cleanPhone, 
          primaryId,
          totalContacts: searchData.contacts.length 
        });
        return primaryId;
      }
    }

    // Try with last 10 digits as fallback
    if (cleanPhone.length > 10) {
      const last10 = cleanPhone.slice(-10);
      searchResponse = await fetchGHL(
        `https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&query=${last10}`,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Version": "2021-07-28",
            "Accept": "application/json",
          },
        }
      );

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.contacts && searchData.contacts.length > 0) {
          const primaryId = searchData.contacts[0].id;
          console.log("[getPrimaryContactId] Found primary contact (last10):", { 
            phone: last10, 
            primaryId,
            totalContacts: searchData.contacts.length 
          });
          return primaryId;
        }
      }
    }

    console.log("[getPrimaryContactId] No existing contact found for phone:", cleanPhone);
    return null;
  } catch (e) {
    console.error("[getPrimaryContactId] Error searching for contact:", e);
    return null;
  }
}

// Helper to search/create contact in GHL
async function findOrCreateContact(
  phone: string,
  name: string,
  locationId: string,
  token: string,
  email?: string
): Promise<any> {
  // Search for existing contact
  const searchResponse = await fetchGHL(
    `https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&query=${phone}`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Version": "2021-07-28",
        "Accept": "application/json",
      },
    }
  );

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    if (searchData.contacts && searchData.contacts.length > 0) {
      const existingContact = searchData.contacts[0];
      
      // If email is provided (group chat) and contact doesn't have it, update the contact
      if (email && !existingContact.email) {
        try {
          await fetchGHL(`https://services.leadconnectorhq.com/contacts/${existingContact.id}`, {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Version": "2021-07-28",
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify({ email }),
          });
          console.log("Updated contact email with group ID:", email);
        } catch (e) {
          console.error("Failed to update contact email:", e);
        }
      }
      
      return existingContact;
    }
  }

  // Create new contact - include email if provided
  const contactPayload: Record<string, unknown> = {
    firstName: name || "WhatsApp Contact",
    phone: `+${phone}`,
    locationId,
    source: "WhatsApp Integration",
  };
  
  if (email) {
    contactPayload.email = email;
  }

  const createResponse = await fetchGHL("https://services.leadconnectorhq.com/contacts/", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Version": "2021-07-28",
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(contactPayload),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error("Failed to create contact:", errorText);

    // Some locations disallow duplicates and return an existing contactId in meta.
    // Example: { statusCode: 400, message: "This location does not allow duplicated contacts.", meta: { contactId: "..." } }
    try {
      const parsed = JSON.parse(errorText);
      const maybeExistingId = parsed?.meta?.contactId;
      const msg = String(parsed?.message || "");

      if (createResponse.status === 400 && maybeExistingId && msg.toLowerCase().includes("duplicated")) {
        console.log("Duplicate contact detected, reusing existing contactId:", maybeExistingId);
        return { id: maybeExistingId };
      }
    } catch {
      // ignore JSON parse errors
    }

    throw new Error("Failed to create contact in GHL");
  }

  const createData = await createResponse.json();
  return createData.contact;
}

// Helper to update contact profile photo in GHL
async function updateContactPhoto(contactId: string, photoUrl: string, token: string): Promise<void> {
  if (!photoUrl) return;
  
  console.log("Updating contact photo:", { contactId, photoUrl: photoUrl.substring(0, 50) });
  
  const response = await fetchGHL(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Version": "2021-07-28",
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      profilePhoto: photoUrl,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to update contact photo:", errorText);
    // Don't throw - photo update is not critical
  } else {
    console.log("Contact photo updated successfully");
  }
}

// Helper to assign contact to a GHL user
async function assignContactToUser(contactId: string, userId: string, token: string): Promise<void> {
  if (!userId) return;
  
  console.log("Assigning contact to user:", { contactId, userId });
  
  const response = await fetchGHL(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Version": "2021-07-28",
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      assignedTo: userId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to assign contact to user:", errorText);
    // Don't throw - assignment is not critical for message flow
  } else {
    console.log("Contact assigned to user successfully:", userId);
  }
}

// Helper to send text message to GHL (inbound = from lead)
// Returns the GHL messageId if available
async function sendMessageToGHL(contactId: string, message: string, token: string, channelType: string = "SMS"): Promise<string | null> {
  const response = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages/inbound", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Version": "2021-04-15",
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      type: channelType,
      contactId,
      message,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("Failed to send message to GHL:", responseText);
    throw new Error("Failed to send message to GHL");
  }

  // Extract messageId from response
  try {
    const parsed = JSON.parse(responseText);
    return parsed?.messageId || parsed?.id || null;
  } catch {
    return null;
  }
}

// Helper to send outbound text message to GHL (render what WE sent)
// Uses the INBOUND endpoint with direction=outbound to avoid triggering GHL webhooks
// This matches the n8n workflow approach that doesn't cause webhook loops
async function sendOutboundMessageToGHL(contactId: string, message: string, token: string): Promise<void> {
  const payload: Record<string, unknown> = {
    type: "SMS",
    contactId,
    message,
    status: "delivered",
    direction: "outbound",
  };

  console.log("Sending outbound message to GHL API (inbound endpoint):", {
    contactId,
    messagePreview: message?.substring(0, 30),
  });

  // Use /inbound endpoint with direction=outbound - this renders the message without triggering webhooks
  const response = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages/inbound", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Version": "2021-04-15",
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("Failed to send outbound message to GHL:", responseText);
    throw new Error("Failed to send outbound message to GHL");
  }

  console.log("✅ Outbound message sent successfully to GHL (no webhook triggered):", responseText.substring(0, 300));
}

// Helper to get or create conversation for a contact
async function getOrCreateConversation(contactId: string, locationId: string, token: string): Promise<string> {
  // First try to get existing conversation
  const searchResponse = await fetchGHL(
    `https://services.leadconnectorhq.com/conversations/search?locationId=${locationId}&contactId=${contactId}`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Version": "2021-04-15",
        "Accept": "application/json",
      },
    }
  );

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    if (searchData.conversations && searchData.conversations.length > 0) {
      return searchData.conversations[0].id;
    }
  }

  // Create new conversation if not found
  const createResponse = await fetchGHL("https://services.leadconnectorhq.com/conversations/", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Version": "2021-04-15",
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      locationId,
      contactId,
    }),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error("Failed to create conversation:", errorText);
    throw new Error("Failed to create conversation in GHL");
  }

  const createData = await createResponse.json();
  return createData.conversation?.id || createData.id;
}

// Helper to send media message to GHL with attachments (inbound = from lead)
// Returns the GHL messageId if available
async function sendMediaToGHL(contactId: string, attachmentUrls: string[], token: string, caption?: string, channelType: string = "SMS"): Promise<string | null> {
  const response = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages/inbound", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Version": "2021-04-15",
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      type: channelType,
      contactId,
      message: caption || "",
      attachments: attachmentUrls,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("Failed to send media to GHL:", responseText);
    throw new Error("Failed to send media to GHL");
  }

  // Extract messageId from response
  try {
    const parsed = JSON.parse(responseText);
    return parsed?.messageId || parsed?.id || null;
  } catch {
    return null;
  }
}

// Helper to send outbound media message to GHL (render what WE sent)
async function sendOutboundMediaToGHL(contactId: string, attachmentUrls: string[], token: string, caption?: string): Promise<void> {
  const payload: Record<string, unknown> = {
    type: "SMS",
    contactId,
    message: caption || "",
    attachments: attachmentUrls,
    status: "delivered",
  };

  console.log("Sending outbound media to GHL API:", {
    contactId,
    attachments: attachmentUrls.length,
  });

  const response = await fetchGHL(`https://services.leadconnectorhq.com/conversations/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Version": "2021-04-15",
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("Failed to send outbound media to GHL:", responseText);
    throw new Error("Failed to send outbound media to GHL");
  }

  console.log("✅ Outbound media sent successfully to GHL:", responseText.substring(0, 300));
}

// Dedup helper using public.ghl_processed_messages (unique message_id)
async function markIfNew(supabase: any, messageId: string): Promise<boolean> {
  if (!messageId) return true;
  try {
    const { error } = await supabase.from("ghl_processed_messages").insert({ message_id: messageId });
    if (error) {
      if (error.code === "23505") return false; // duplicate
      console.error("Dedup insert error (allowing processing):", error);
      return true;
    }
    return true;
  } catch (e) {
    console.error("Dedup insert exception (allowing processing):", e);
    return true;
  }
}

function toEpochMs(ts: unknown): number {
  const n = Number(ts ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // If it's in seconds (10 digits-ish), convert to ms
  if (n < 1_000_000_000_000) return Math.floor(n * 1000);
  return Math.floor(n);
}

// Opportunistic cleanup: 1% chance to run cleanup on each request
async function maybeCleanupOldMappings(supabase: any): Promise<void> {
  // 1% chance to run cleanup
  if (Math.random() > 0.01) return;
  
  try {
    console.log("Running opportunistic cleanup of old phone mappings...");
    
    // Delete phone mappings older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: mappingError } = await supabase
      .from("ghl_contact_phone_mapping")
      .delete()
      .lt("updated_at", thirtyDaysAgo);
    
    if (mappingError) {
      console.error("Failed to cleanup old phone mappings:", mappingError);
    } else {
      console.log("✅ Old phone mappings cleanup completed");
    }
    
    // Also cleanup old processed messages (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { error: msgError } = await supabase
      .from("ghl_processed_messages")
      .delete()
      .lt("created_at", oneHourAgo);
    
    if (msgError) {
      console.error("Failed to cleanup old processed messages:", msgError);
    } else {
      console.log("✅ Old processed messages cleanup completed");
    }
  } catch (e) {
    console.error("Cleanup error (non-critical):", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("UAZAPI Webhook received:", JSON.stringify(body, null, 2));

    // Handle different event types from UAZAPI
    // EventType is a string, but event can be an object
    const eventType = body.EventType || body.type || "";

    // ==============================================================
    // EARLY IGNORE: delivery/read receipts
    // UAZAPI sends these as EventType=messages_update + type=ReadReceipt
    // They contain MessageIDs but no message content. If we process them,
    // they can cause noisy logs and (depending on payload variants) may
    // interfere with dedup or downstream logic.
    // ==============================================================
    const rootType = String(body.type || "");
    const updateState = String(body.state || body.event?.Type || "");
    const isReceipt =
      rootType.toLowerCase() === "readreceipt" ||
      (String(eventType).toLowerCase() === "messages_update" &&
        ["delivered", "read", "seen"].includes(updateState.toLowerCase()));

    if (isReceipt) {
      return new Response(
        JSON.stringify({ received: true, ignored: true, reason: "receipt_event", eventType, state: updateState }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==============================================================
    // HANDLE FILE DOWNLOADED EVENTS
    // UAZAPI sends media in two steps:
    //   1. A "messages" event (may lack content.URL for the media)
    //   2. A "messages_update" event with type "FileDownloadedMessage"
    //      that contains the actual public file URL
    // This handler processes step 2 so media renders correctly in GHL.
    // ==============================================================
    const isFileDownloaded =
      rootType.toLowerCase() === "filedownloadedmessage" ||
      updateState.toLowerCase() === "filedownloaded";

    if (isFileDownloaded) {
      const eventInfo = body.event || {};
      const fileUrl = eventInfo.FileURL || eventInfo.fileURL || eventInfo.fileUrl || "";
      const messageIds = eventInfo.MessageIDs || eventInfo.messageIDs || eventInfo.messageIds || [];
      const fdMessageId = messageIds[0] || "";
      const fdChatId = eventInfo.Chat || eventInfo.chatid || (body.chat?.wa_chatid) || "";
      const fdIsFromMe = eventInfo.IsFromMe === true;
      const fdIsGroup = eventInfo.IsGroup === true || fdChatId.endsWith("@g.us");
      const fdMimeType = eventInfo.MimeType || eventInfo.mimetype || "";
      const fdInstanceToken = body.token || body.instanceToken || "";

      console.log("📁 Processing FileDownloaded event:", {
        fileUrl: fileUrl?.substring(0, 80),
        messageId: fdMessageId,
        chatId: fdChatId,
        isFromMe: fdIsFromMe,
        isGroup: fdIsGroup,
        mimeType: fdMimeType,
      });

      if (!fileUrl || !fdChatId || !fdInstanceToken) {
        console.log("FileDownloaded missing required data, skipping");
        return new Response(
          JSON.stringify({ received: true, ignored: true, reason: "file_downloaded_missing_data" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const fdSupabase = createClient(supabaseUrl, supabaseKey);

      // Dedup using messageId
      if (fdMessageId) {
        const dedupKey = `uazapi:${fdInstanceToken}:${fdMessageId}`;
        const isNew = await markIfNew(fdSupabase, dedupKey);
        if (!isNew) {
          console.log("FileDownloaded duplicate ignored:", fdMessageId);
          return new Response(
            JSON.stringify({ received: true, ignored: true, reason: "duplicate_file_downloaded" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Find instance by token
      const { data: fdInstance, error: fdInstanceError } = await fdSupabase
        .from("instances")
        .select("*, ghl_subaccounts!inner(*)")
        .eq("uazapi_instance_token", fdInstanceToken)
        .single();

      if (fdInstanceError || !fdInstance) {
        console.log("FileDownloaded: instance not found for token:", fdInstanceToken?.substring(0, 8));
        return new Response(
          JSON.stringify({ received: true, ignored: true, reason: "instance_not_found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if groups should be ignored
      if (fdIsGroup && fdInstance.ignore_groups) {
        console.log("FileDownloaded: ignoring group media");
        return new Response(
          JSON.stringify({ received: true, ignored: true, reason: "group_ignored" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fdSubaccount = fdInstance.ghl_subaccounts as any;

      // Get user settings for OAuth credentials
      const { data: fdSettings } = await fdSupabase
        .from("user_settings")
        .select("*")
        .eq("user_id", fdSubaccount.user_id)
        .single();

      if (!fdSettings?.ghl_client_id || !fdSubaccount.ghl_access_token) {
        console.log("FileDownloaded: missing GHL credentials");
        return new Response(
          JSON.stringify({ received: true, ignored: true, reason: "missing_credentials" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get valid OAuth token (refresh if needed)
      const fdToken = await getValidToken(fdSupabase, fdSubaccount, fdSettings);

      // Extract phone number from chat ID
      const fdRawJid = fdChatId.split("@")[0];
      const fdRawDigits = fdRawJid.replace(/\D/g, "");
      const fdPhoneNumber = fdIsGroup ? fdRawDigits.slice(0, 11) : fdRawJid;

      // Get chat data for naming
      const fdChatData = body.chat || {};
      const fdGroupName = fdIsGroup
        ? (fdChatData.wa_name || fdChatData.name || "Grupo")
        : "";
      const fdContactName = fdIsGroup
        ? `👥 ${fdGroupName}`
        : (fdChatData.wa_contactName || fdChatData.name || "WhatsApp Contact");

      // Group email (JID for routing)
      const fdGroupEmail = fdIsGroup ? fdChatId : undefined;

      // Find or create contact in GHL
      const fdContact = await findOrCreateContact(
        fdPhoneNumber,
        fdContactName,
        fdSubaccount.location_id,
        fdToken,
        fdGroupEmail
      );

      // Try to get caption/transcription from UAZAPI download response
      let fdCaption = "";
      const fdBaseUrl = fdInstance.uazapi_base_url?.replace(/\/$/, "") || fdSettings.uazapi_base_url?.replace(/\/$/, "") || body.BaseUrl?.replace(/\/$/, "") || "";
      if (fdBaseUrl && fdMessageId) {
        try {
          const dlRes = await fetch(`${fdBaseUrl}/message/download`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "token": fdInstanceToken },
            body: JSON.stringify({ id: fdMessageId }),
          });
          if (dlRes.ok) {
            const dlData = await dlRes.json();
            fdCaption = dlData.transcription || dlData.caption || dlData.text || "";
          }
        } catch (e) {
          console.error("FileDownloaded: failed to get caption:", e);
        }
      }

      // Format caption for groups with member prefix
      const fdSenderPn = (eventInfo.sender_pn || "").replace(/@.*$/, "").replace(/\D/g, "");
      let fdFormattedCaption = fdCaption;
      if (fdIsGroup && fdSenderPn && !fdIsFromMe) {
        const memberPrefix = `(${fdSenderPn})-👤:\n`;
        fdFormattedCaption = memberPrefix + (fdCaption || "");
      }

      // Send media to GHL
      if (fdIsFromMe) {
        // Outbound media - use inbound endpoint with direction=outbound to avoid webhook loops
        const fdRes = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages/inbound", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${fdToken}`,
            "Version": "2021-04-15",
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            type: "SMS",
            contactId: fdContact.id,
            message: fdFormattedCaption || "",
            attachments: [fileUrl],
            status: "delivered",
            direction: "outbound",
            ...(fdInstance.ghl_user_id && { userId: fdInstance.ghl_user_id }),
          }),
        });
        const fdBodyText = await fdRes.text();
        console.log("FileDownloaded GHL outbound response:", { status: fdRes.status, body: fdBodyText.substring(0, 300) });

        // Save mapping
        try {
          const parsed = JSON.parse(fdBodyText);
          const ghlMsgId = parsed?.messageId || "";
          if (ghlMsgId) {
            await markIfNew(fdSupabase, `ghl:${ghlMsgId}`);
            await fdSupabase.from("message_map").upsert({
              ghl_message_id: ghlMsgId,
              uazapi_message_id: fdMessageId || null,
              location_id: fdSubaccount.location_id,
              contact_id: fdContact.id,
              message_text: fdCaption || "",
              message_type: fdMimeType.startsWith("audio") ? "media:audio" : fdMimeType.startsWith("image") ? "media:image" : fdMimeType.startsWith("video") ? "media:video" : fdMimeType.startsWith("application") ? "media:document" : "media",
              from_me: true,
              original_timestamp: new Date().toISOString(),
            }, { onConflict: "ghl_message_id" });
            console.log("FileDownloaded mapping saved:", { ghl: ghlMsgId, uazapi: fdMessageId });
          }
        } catch { /* ignore */ }
      } else {
        // Inbound media from lead
        // If official API mode is active, skip forwarding - the official provider already delivers inbound messages
        if (fdInstance.is_official_api) {
          console.log("⏭️ Skipping inbound media forwarding (official API mode active):", { messageId: fdMessageId });
        } else {
          const ghlMsgId = await sendMediaToGHL(fdContact.id, [fileUrl], fdToken, fdFormattedCaption || undefined);

          if (ghlMsgId && fdMessageId) {
            await fdSupabase.from("message_map").upsert({
              ghl_message_id: ghlMsgId,
              uazapi_message_id: fdMessageId,
              location_id: fdSubaccount.location_id,
              contact_id: fdContact.id,
              message_text: fdCaption || "",
              message_type: fdMimeType.startsWith("audio") ? "media:audio" : fdMimeType.startsWith("image") ? "media:image" : fdMimeType.startsWith("video") ? "media:video" : fdMimeType.startsWith("application") ? "media:document" : "media",
              from_me: false,
              original_timestamp: new Date().toISOString(),
            }, { onConflict: "ghl_message_id" });
            console.log("FileDownloaded inbound mapping saved:", { ghl: ghlMsgId, uazapi: fdMessageId });
          }
        }
      }

      // Update contact photo and assign user (same as main flow)
      const fdProfilePhoto = fdChatData.imagePreview || fdChatData.image || "";
      if (fdProfilePhoto && fdContact.id) {
        await updateContactPhoto(fdContact.id, fdProfilePhoto, fdToken);
      }
      if (fdInstance.ghl_user_id && fdContact.id) {
        await assignContactToUser(fdContact.id, fdInstance.ghl_user_id, fdToken);
      }

      console.log(`✅ FileDownloaded media processed: ${fdChatId} -> ${fdContact.id} (${fdIsFromMe ? "outbound" : "inbound"})`);

      return new Response(
        JSON.stringify({ success: true, type: "file_downloaded", contactId: fdContact.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Extract message data early for special event handling
    const messageDataForEvents = body.message || body.data || {};
    
    // === HANDLE MESSAGE REACTION EVENTS ===
    // UAZAPI sends reactions with:
    // - messageType: "ReactionMessage"
    // - type: "reaction"
    // - reaction: "MESSAGE_ID" (ID of the message being reacted to)
    // - text: "😂" (the emoji)
    // - content.key.ID: "MESSAGE_ID" (alternative location for target message ID)
    const reactionMsgType = (messageDataForEvents.messageType || "").toLowerCase();
    const messageTypeField = (messageDataForEvents.type || "").toLowerCase();
    const isReactionMessage = reactionMsgType === "reactionmessage" || messageTypeField === "reaction";
    const hasReactionField = typeof messageDataForEvents.reaction === "string" && messageDataForEvents.reaction !== "";
    
    if (isReactionMessage || hasReactionField) {
      console.log("Processing message REACTION event:", { 
        eventType, 
        reactionMsgType,
        messageTypeField,
        reaction: messageDataForEvents.reaction,
        text: messageDataForEvents.text,
        contentKey: messageDataForEvents.content?.key
      });
      
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Extract target message ID (the message being reacted to)
      // UAZAPI format: reaction field contains the message ID, OR content.key.ID
      const targetMsgId = messageDataForEvents.reaction || 
                          messageDataForEvents.content?.key?.ID ||
                          messageDataForEvents.content?.key?.id || "";
      
      // Extract emoji from text field
      const emoji = messageDataForEvents.text || 
                    messageDataForEvents.content?.text || "";
      
      const fromMe = messageDataForEvents.fromMe ?? false;
      
      console.log("Reaction extracted:", { targetMsgId, emoji, fromMe });
      
      if (targetMsgId && emoji) {
        // Find mapping by UAZAPI ID - use order + limit to handle duplicates
        const { data: mapping } = await supabase
          .from("message_map")
          .select("*")
          .eq("uazapi_message_id", targetMsgId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (mapping) {
          // Update reactions in database
          const currentReactions = (mapping.reactions as string[]) || [];
          const updatedReactions = [...currentReactions, emoji];
          
          await supabase
            .from("message_map")
            .update({ reactions: updatedReactions })
            .eq("id", mapping.id);
          
          // Broadcast to frontend
          await supabase.channel("ghl_updates").send({
            type: "broadcast",
            event: "msg_update",
            payload: {
              ghl_id: mapping.ghl_message_id,
              type: "react",
              emoji,
              fromMe,
              location_id: mapping.location_id,
            },
          });
          
          console.log("✅ Reaction event broadcasted:", { ghl_id: mapping.ghl_message_id, emoji, fromMe });
        } else {
          console.log("⚠️ No mapping found for reaction target message:", targetMsgId);
        }
      }
      
      return new Response(
        JSON.stringify({ received: true, processed: true, type: "reaction" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // === HANDLE MESSAGE EDIT EVENTS ===
    // UAZAPI sends edits in different formats:
    // 1. Event type "messages.edit" / "message.edit"
    // 2. protocolMessage.type === 14
    // 3. The "edited" field contains a MESSAGE ID (the original message being edited)
    //    and the new text is in the "text" or "content" fields
    const isEditEventType = eventType === "messages.edit" || eventType === "message.edit";
    const isProtocolEdit = messageDataForEvents.protocolMessage?.type === 14;
    // CRITICAL: "edited" field contains the ORIGINAL MESSAGE ID being edited
    const editedOriginalMsgId = messageDataForEvents.edited || "";
    const isEditedFieldPresent = typeof editedOriginalMsgId === "string" && editedOriginalMsgId.length > 10;
    
    if (isEditEventType || isProtocolEdit || isEditedFieldPresent) {
      console.log("Processing message EDIT event:", { 
        eventType, 
        messageId: messageDataForEvents.messageid || messageDataForEvents.id,
        editedOriginalMsgId,
        protocolMessage: messageDataForEvents.protocolMessage,
        isEditEventType,
        isProtocolEdit,
        isEditedFieldPresent
      });
      
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // === DEDUPLICATION FOR EDITS ===
      // Multiple instances may receive the same edit event - deduplicate by original message ID
      const editDedupeKey = `edit:${editedOriginalMsgId || messageDataForEvents.messageid || messageDataForEvents.id}`;
      
      // Use INSERT with ON CONFLICT to atomically claim this edit event
      // Only the first insert succeeds - others get count=0
      const { data: insertResult, error: insertError } = await supabase
        .from("ghl_processed_messages")
        .insert({ message_id: editDedupeKey })
        .select("id");
      
      // If insert failed due to unique constraint, another instance already claimed it
      if (insertError?.code === "23505" || !insertResult || insertResult.length === 0) {
        console.log("⏭️ Edit already claimed by another instance, skipping:", editDedupeKey);
        return new Response(
          JSON.stringify({ received: true, processed: false, reason: "edit_already_processed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log("✅ Edit claimed for processing:", editDedupeKey);
      
      // Extract the ORIGINAL message ID that was edited
      // - For "edited" field format: the "edited" field IS the original message ID
      // - For protocolMessage format: key.id contains the original ID
      const uazapiMsgId = editedOriginalMsgId ||
                          messageDataForEvents.protocolMessage?.key?.id || 
                          messageDataForEvents.key?.id ||
                          messageDataForEvents.messageid || 
                          messageDataForEvents.id || "";
      
      // Extract the NEW text content
      // For "edited" field format: new text is in "text" or "content" at root level
      const newText = messageDataForEvents.text ||
                      (typeof messageDataForEvents.content === "string" ? messageDataForEvents.content : null) ||
                      messageDataForEvents.content?.text ||
                      messageDataForEvents.protocolMessage?.editedMessage?.conversation ||
                      messageDataForEvents.protocolMessage?.editedMessage?.extendedTextMessage?.text ||
                      "";
      
      console.log("Edit extracted:", { uazapiMsgId, newText: newText?.substring(0, 50) });
      
      if (uazapiMsgId && newText) {
        // Find mapping by UAZAPI ID - use limit(1) to handle potential duplicates
        const { data: mapping, error: mappingError } = await supabase
          .from("message_map")
          .select("*")
          .eq("uazapi_message_id", uazapiMsgId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (mappingError) {
          console.log("⚠️ Error finding mapping:", mappingError.message);
        }
        
        if (mapping) {
          // Store original text before updating
          const originalText = mapping.message_text || "";
          
          // Update in database
          await supabase
            .from("message_map")
            .update({ message_text: newText, is_edited: true })
            .eq("id", mapping.id);
          
          // === SEND EDIT AS FORMATTED INBOUND MESSAGE TO GHL ===
          // Only send formatted message for lead edits (not our own outbound edits)
          if (!mapping.from_me && mapping.contact_id && mapping.location_id) {
            // Get instance and token for this location to send message to GHL
            const { data: instanceData } = await supabase
              .from("instances")
              .select("*, ghl_subaccounts!inner(*)")
              .eq("ghl_subaccounts.location_id", mapping.location_id)
              .eq("instance_status", "connected")
              .limit(1)
              .maybeSingle();
            
            if (instanceData?.ghl_subaccounts) {
              const subaccount = instanceData.ghl_subaccounts;
              
              // Get user settings for OAuth credentials
              const { data: settings } = await supabase
                .from("user_settings")
                .select("ghl_client_id, ghl_client_secret")
                .eq("user_id", subaccount.user_id)
                .single();
              
              if (settings?.ghl_client_id && subaccount.ghl_access_token) {
                // Get valid token (refresh if needed)
                const token = await getValidToken(supabase, subaccount, settings);
                
                // Format the edit message:
                // ✏️ Editado: "texto original"
                //
                // texto editado
                const formattedEditMessage = `✏️ Editado: "${originalText}"\n\n${newText}`;
                
                console.log("📝 Sending formatted edit message to GHL:", {
                  contactId: mapping.contact_id,
                  originalText: originalText?.substring(0, 30),
                  newText: newText?.substring(0, 30),
                });
                
                // Send as inbound message (from lead)
                const response = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages/inbound", {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${token}`,
                    "Version": "2021-04-15",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                  },
                  body: JSON.stringify({
                    type: "SMS",
                    contactId: mapping.contact_id,
                    message: formattedEditMessage,
                  }),
                });
                
                const responseText = await response.text();
                if (!response.ok) {
                  console.error("Failed to send edit message to GHL:", responseText);
                } else {
                  console.log("✅ Edit message sent to GHL successfully:", responseText.substring(0, 200));
                  
                  // Map the new formatted message to the same UAZAPI message ID
                  // so replies to the edited message work correctly
                  try {
                    const responseData = JSON.parse(responseText);
                    const newGhlMessageId = responseData.messageId || responseData.id;
                    
                    if (newGhlMessageId && mapping.uazapi_message_id) {
                      console.log("📝 Mapping formatted edit message:", { newGhlMessageId, uazapiId: mapping.uazapi_message_id });
                      
                      await supabase
                        .from("message_map")
                        .upsert({
                          ghl_message_id: newGhlMessageId,
                          uazapi_message_id: mapping.uazapi_message_id,
                          location_id: mapping.location_id,
                          contact_id: mapping.contact_id,
                          message_text: formattedEditMessage,
                          message_type: "text",
                          from_me: false,
                          original_timestamp: new Date().toISOString(),
                        }, { onConflict: "ghl_message_id" });
                      
                      console.log("✅ Formatted edit message mapped successfully");
                    }
                  } catch (e) {
                    console.error("Failed to map formatted edit message:", e);
                  }
                }
              }
            }
          }
          
          // If this was an OUTBOUND edit (agent edited on mobile), mirror the action in GHL using InternalComment
          // (same UX as when the edit is made inside GHL via the Toolkit)
          // BUT: skip if map-messages already handled this edit (Bridge Toolkit flow)
          // to prevent duplicate InternalComments.
          let editAlreadyHandled = false;
          if (mapping.from_me && mapping.uazapi_message_id) {
            const editIcKey = `edit-ic:${mapping.uazapi_message_id}`;
            const { data: existing } = await supabase
              .from("ghl_processed_messages")
              .select("id")
              .eq("message_id", editIcKey)
              .maybeSingle();
            if (existing) {
              editAlreadyHandled = true;
              console.log("⏭️ Edit InternalComment already sent by map-messages, skipping duplicate:", editIcKey);
            }
          }

          if (mapping.from_me && mapping.contact_id && mapping.location_id && !editAlreadyHandled) {
            try {
              const { data: instanceData } = await supabase
                .from("instances")
                .select("ghl_user_id, ghl_subaccounts!inner(*)")
                .eq("ghl_subaccounts.location_id", mapping.location_id)
                .eq("instance_status", "connected")
                .limit(1)
                .maybeSingle();

              if (instanceData?.ghl_subaccounts) {
                const subaccount = instanceData.ghl_subaccounts;
                const { data: settings } = await supabase
                  .from("user_settings")
                  .select("ghl_client_id, ghl_client_secret")
                  .eq("user_id", subaccount.user_id)
                  .maybeSingle();

                if (settings?.ghl_client_id && subaccount.ghl_access_token) {
                  const token = await getValidToken(supabase, subaccount, settings);
                  const formattedEditComment = `✏️ Editado: "${originalText}"\n\n${newText}`;

                  const icRes = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages", {
                    method: "POST",
                    headers: {
                      "Authorization": `Bearer ${token}`,
                      "Version": "2021-04-15",
                      "Content-Type": "application/json",
                      "Accept": "application/json",
                    },
                    body: JSON.stringify({
                      type: "InternalComment",
                      contactId: mapping.contact_id,
                      message: formattedEditComment,
                      ...(instanceData.ghl_user_id && { userId: instanceData.ghl_user_id }),
                    }),
                  });

                  const icText = await icRes.text();
                  if (!icRes.ok) {
                    console.error("Failed to send edit InternalComment (mobile) to GHL:", icText.substring(0, 300));
                  } else {
                    console.log("✅ Edit InternalComment mirrored (mobile):", icText.substring(0, 200));
                  }
                }
              }
            } catch (e) {
              console.error("Error mirroring mobile edit as InternalComment:", e);
            }
          }

          // Also broadcast for any UI that uses realtime overlays
          if (mapping.from_me) {
            await supabase.channel("ghl_updates").send({
              type: "broadcast",
              event: "msg_update",
              payload: {
                ghl_id: mapping.ghl_message_id,
                type: "edit",
                new_text: newText,
                original_text: originalText,
                location_id: mapping.location_id,
                fromMe: mapping.from_me,
              },
            });
          } else {
            console.log("📝 Inbound edit handled via formatted message, no overlay broadcast");
          }
        } else {
          console.log("⚠️ No mapping found for edited message:", uazapiMsgId);
          console.log("⚠️ Available in payload: messageid=" + messageDataForEvents.messageid + ", id=" + messageDataForEvents.id + ", edited=" + editedOriginalMsgId);
        }
      }
      
      return new Response(
        JSON.stringify({ received: true, processed: true, type: "edit" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // === HANDLE MESSAGE DELETE/REVOKE EVENTS ===
    // Delete events can come in different formats: protocolMessage.type === 0, deleted field, or specific event types
    const hasDeletedFlag = messageDataForEvents.deleted === true || messageDataForEvents.revoked === true;
    const isDeleteEventType = eventType === "messages.delete" || eventType === "message.delete" || 
                              eventType === "messages.revoke" || eventType === "message.revoke" ||
                              eventType === "messages.update";
    const isProtocolDelete = messageDataForEvents.protocolMessage?.type === 0;
    
    if (hasDeletedFlag || isDeleteEventType || isProtocolDelete) {
      console.log("Processing message DELETE/REVOKE event:", { 
        eventType, 
        messageId: messageDataForEvents.messageid || messageDataForEvents.id,
        hasDeletedFlag,
        isDeleteEventType,
        isProtocolDelete
      });
      
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Extract message ID - can come from different places
      const uazapiMsgId = messageDataForEvents.protocolMessage?.key?.id ||
                          messageDataForEvents.key?.id ||
                          messageDataForEvents.messageid || 
                          messageDataForEvents.id || "";
      
      const fromMe = messageDataForEvents.protocolMessage?.key?.fromMe ??
                     messageDataForEvents.key?.fromMe ??
                     messageDataForEvents.fromMe ?? false;
      
      console.log("Delete extracted:", { uazapiMsgId, fromMe });
      
      if (uazapiMsgId) {
        // Find mapping by UAZAPI ID
        const { data: mapping } = await supabase
          .from("message_map")
          .select("*")
          .eq("uazapi_message_id", uazapiMsgId)
          .maybeSingle();
        
        if (mapping) {
          // Store original text before marking as deleted
          const originalText = mapping.message_text || "";
          
          // Mark as deleted in database
          await supabase
            .from("message_map")
            .update({ is_deleted: true })
            .eq("id", mapping.id);
          
          // Broadcast to frontend - include original_text for overlay
          await supabase.channel("ghl_updates").send({
            type: "broadcast",
            event: "msg_update",
            payload: {
              ghl_id: mapping.ghl_message_id,
              type: "delete",
              fromMe,
              original_text: originalText,
              location_id: mapping.location_id,
            },
          });
          
          console.log("Delete event broadcasted:", { ghl_id: mapping.ghl_message_id, fromMe, hasOriginalText: !!originalText });
        } else {
          console.log("No mapping found for deleted message:", uazapiMsgId);
        }
      }
      
      return new Response(
        JSON.stringify({ received: true, processed: true, type: "delete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Check if it's a message event (string check)
    const isMessageEvent = typeof eventType === "string" && eventType.toLowerCase().includes("message");
    
    if (!isMessageEvent) {
      // Not a message event, acknowledge
      console.log("Not a message event, ignoring:", eventType);
      return new Response(
        JSON.stringify({ received: true, ignored: true, eventType }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract message data from UAZAPI payload (new structure)
    const messageData = body.message || body.data || {};
    const chatData = body.chat || {};
    const eventData = body.event || {};
    
    // Check if message was sent by the connected WhatsApp instance (fromMe)
    // If fromMe is true, this is a message WE sent - we'll sync it as outbound message in GHL
    const isFromMe = messageData.fromMe === true;
    
    // Check if message was sent by API (agente_ia) - should be rendered as outbound in GHL
    // Note: wasSentByApi may come at root level or inside message object
    const wasSentByApi = body.wasSentByApi === true || messageData.wasSentByApi === true;
    const trackId = String(body.track_id || messageData.track_id || "").trim();
    
    console.log("API Agent check:", { wasSentByApi, trackId, isFromMe });

    // IMPORTANT:
    // If UAZAPI marks the message as API-sent but there's no track_id,
    // we must discard it to avoid infinite loops (e.g., messages mirrored from GHL -> UAZAPI).
    // The track_id validation against user's configured track_id happens later after we fetch the instance.
    if (wasSentByApi && !trackId) {
      console.log("Discarding API-sent message without track_id:", {
        wasSentByApi,
        trackId,
        isFromMe,
        messageid: messageData.messageid || messageData.id,
      });

      return new Response(
        JSON.stringify({
          received: true,
          ignored: true,
          reason: "discard_api_message_no_track_id",
          wasSentByApi,
          trackId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Get sender info - PRIORITY: chatid/wa_chatid contains the real phone number
    // The "sender" field often contains internal LID (linked ID) which is NOT a valid phone
    const from = chatData.wa_chatid || messageData.chatid || eventData.Chat || messageData.sender || "";
    const instanceToken = body.token || body.instanceToken || messageData.instanceToken || "";
    
    // Check if message was sent by the connected WhatsApp instance (fromMe)
    const isFromMeCheck = messageData.fromMe === true;
    
    // For groups, check if it's a group chat and use group name
    const isGroupChat = from.endsWith("@g.us") || messageData.isGroup === true || chatData.wa_isGroup === true;
    
    // Extract names correctly:
    // - senderName: the person who sent the message (from messageData.senderName)
    // - wa_contactName / wa_name / name from chatData: the name of the contact/chat (the lead)
    const senderName = messageData.senderName || "";
    
    // CRITICAL FIX: When isFromMe=true, we are sending TO the lead, so we need the LEAD's name (wa_contactName/name)
    // NOT the sender's name (which would be the instance's WhatsApp profile name)
    // chatData.wa_contactName or chatData.name contains the lead's saved name in the WhatsApp contact list
    const leadName = chatData.wa_contactName || chatData.name || "";
    
    // For group name, prioritize messageData.groupName, then fallback to chat data
    // Only use chat.wa_name/name for groups - these contain the group name, not sender name
    let groupName = "";
    if (isGroupChat) {
      groupName = (messageData.groupName && messageData.groupName !== "Unknown") 
        ? messageData.groupName 
        : (chatData.wa_name || chatData.name || "");
    }
    
    // For individual chats:
    // - If isFromMe (we sent the message): use leadName (the contact we're messaging)
    // - If not isFromMe (lead sent the message): PRIORITIZE leadName (wa_contactName = saved contact name)
    //   over senderName (WhatsApp profile name) - the saved name is more meaningful for the user
    const individualName = isFromMeCheck ? leadName : (leadName || senderName || "");
    
    // Use group name for contact creation with 👥 emoji prefix for groups
    const pushName = isGroupChat ? `👥 ${groupName || "Grupo"}` : individualName;
    // Store member name and phone for group message formatting
    const memberName = isGroupChat ? (senderName || "") : "";
    // Extract member phone from sender_pn field (contains the phone number of the actual sender in group)
    const memberPhone = isGroupChat ? (messageData.sender_pn || "").replace(/\D/g, "") : "";
    
    // Detect media vs text message - including stickers
    const contentRaw = messageData.content;
    const messageType = (messageData.messageType || messageData.mediaType || "").toLowerCase();
    const isSticker = messageType === "stickermessage" || messageType === "sticker";
    const isMediaMessage = (contentRaw && typeof contentRaw === "object" && (contentRaw.URL || contentRaw.url)) || isSticker;
    const mediaUrl = isMediaMessage ? (contentRaw?.URL || contentRaw?.url || null) : null;
    const mediaType = messageData.mediaType || messageData.messageType || "";
    
    // Extract text message - handle both string and object content
    let textMessage = "";
    if (typeof contentRaw === "string") {
      textMessage = contentRaw;
    } else if (typeof contentRaw === "object" && contentRaw?.text) {
      // Content can be an object with a text field (e.g., ExtendedTextMessage)
      textMessage = contentRaw.text;
    } else if (messageData.text) {
      textMessage = messageData.text;
    } else if (messageData.conversation) {
      textMessage = messageData.conversation;
    }

    // Extract quoted message data (for replies)
    // UAZAPI format: 
    // - message.quoted: string with the original message ID (e.g., "3EB0C64A08A1609D776B55")
    // - message.content.contextInfo.stanzaID: same ID
    // - message.content.contextInfo.quotedMessage.conversation: the quoted text
    let quotedText = "";
    let quotedMessageId = "";
    
    // Method 1: UAZAPI puts the quoted message ID as a string in message.quoted
    const quotedIdFromField = typeof messageData.quoted === "string" && messageData.quoted.length > 10 
      ? messageData.quoted 
      : "";
    
    // Method 2: Full context info is in content.contextInfo
    const contextInfo = typeof contentRaw === "object" ? contentRaw?.contextInfo : null;
    
    if (contextInfo) {
      quotedMessageId = contextInfo.stanzaID || contextInfo.stanzaId || quotedIdFromField || "";
      const qm = contextInfo.quotedMessage;
      if (qm) {
        // Try text first
        quotedText = qm.conversation || qm.extendedTextMessage?.text || qm.text || "";
        // If no text, detect media type and generate friendly label
        if (!quotedText) {
          if (qm.audioMessage) {
            const secs = qm.audioMessage.seconds || 0;
            const mins = Math.floor(secs / 60);
            const remSecs = secs % 60;
            quotedText = `Áudio ${mins}:${String(remSecs).padStart(2, "0")}`;
          } else if (qm.imageMessage) {
            quotedText = qm.imageMessage.caption || "Imagem";
          } else if (qm.videoMessage) {
            quotedText = qm.videoMessage.caption || "Vídeo";
          } else if (qm.documentMessage) {
            quotedText = qm.documentMessage.fileName || qm.documentMessage.title || "Documento";
          } else if (qm.stickerMessage) {
            quotedText = "Figurinha";
          } else if (qm.contactMessage || qm.contactsArrayMessage) {
            quotedText = "Contato";
          } else if (qm.locationMessage || qm.liveLocationMessage) {
            quotedText = "Localização";
          } else {
            quotedText = "Mídia";
          }
        }
      }
    } else if (quotedIdFromField) {
      // Fallback: only have the ID, not the text
      quotedMessageId = quotedIdFromField;
    }
    
    // Alternative formats for other UAZAPI versions
    if (!quotedMessageId && messageData.quotedMessage) {
      quotedText = messageData.quotedMessage.text || messageData.quotedMessage.content || messageData.quotedMessage.conversation || "";
      quotedMessageId = messageData.quotedMessage.id || messageData.quotedMessage.messageid || messageData.quotedMessage.stanzaId || "";
    }
    
    const hasQuotedMessage = !!quotedMessageId;
    if (hasQuotedMessage) {
      console.log("Message is a REPLY to:", { quotedText: quotedText?.substring(0, 50), quotedMessageId });
    }

    console.log("Extracted data:", { 
      from, 
      textMessage: textMessage?.substring(0, 50), 
      isMediaMessage, 
      mediaUrl: mediaUrl?.substring(0, 50),
      mediaType,
      pushName,
      isFromMe,
      trackId,
      isSticker,
      hasQuoted: hasQuotedMessage,
      instanceToken: instanceToken?.substring(0, 20) + "..." 
    });

    // Need either text or media
    if (!from || (!textMessage && !mediaUrl)) {
      console.log("Missing from or content in payload");
      return new Response(
        JSON.stringify({ received: true, ignored: true, reason: "missing data", from, textMessage, mediaUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if from a group
    const isGroup = from.endsWith("@g.us");

    // Extract phone number
    // For groups: use ONLY 11 digits as "simulated phone" to satisfy GHL phone validation,
    // while the full original group JID continues to be stored in the contact email field.
    const rawJid = from.split("@")[0];
    const rawDigits = rawJid.replace(/\D/g, "");
    const phoneNumber = isGroup ? rawDigits.slice(0, 11) : rawJid;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Opportunistic cleanup (1% chance) - runs in background without blocking
    maybeCleanupOldMappings(supabase);

    // UAZAPI may fire the same 'fromMe' message multiple times; dedupe by instance + UAZAPI messageid.
    // IMPORTANT: Include instanceToken in the key so that different instances can each process
    // the same physical WhatsApp message independently. Example: message "1" is sent from phone A
    // to phone B. Both Teste-CK (phone A's instance) and teste2323 (phone B's instance) receive
    // a webhook with the same messageid. Without the token in the key, the first to arrive would
    // block the second, causing message loss in the CRM.
    // This prevents creating the same outbound message repeatedly in GHL (which then triggers outbound webhooks and loops).
    const uazapiMessageId = String(messageData.messageid || messageData.id || "");
    if (uazapiMessageId) {
      const dedupKey = `uazapi:${instanceToken}:${uazapiMessageId}`;
      const isNew = await markIfNew(supabase, dedupKey);
      if (!isNew) {
        console.log("Duplicate UAZAPI message ignored:", { uazapiMessageId, instanceToken: instanceToken?.substring(0, 8) });
        return new Response(
          JSON.stringify({ received: true, ignored: true, reason: "duplicate_uazapi_message", uazapiMessageId, instanceToken: instanceToken?.substring(0, 8) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Secondary dedupe: sometimes the provider replays the same message with a different ID (or no ID).
    // We compute a content signature bucketed by minute to avoid blocking legitimate repeated messages later.
    // CRITICAL: Only apply signature-based dedup when there's no message ID - if we have a unique ID, trust it.
    if (!uazapiMessageId) {
    try {
      const tsMs =
        toEpochMs((messageData as any)?.timestamp) ||
        toEpochMs((messageData as any)?.ts) ||
        toEpochMs((body as any)?.event?.Timestamp) ||
        Date.now();
      const minuteBucket = Math.floor(tsMs / 60000);

      const signaturePayload = {
        instanceToken: String(instanceToken ?? ""),
        from: String(from ?? ""),
        isFromMe: Boolean(isFromMe),
        isGroup: Boolean(isGroup),
        phoneNumber: String(phoneNumber ?? ""),
        textMessage: String(textMessage ?? ""),
        mediaUrl: String(mediaUrl ?? ""),
        mediaType: String(mediaType ?? ""),
        minuteBucket,
      };

      const sig = await sha256Hex(JSON.stringify(signaturePayload));
      const sigKey = `uazapi_sig:${sig.slice(0, 32)}`;

      const isNewSig = await markIfNew(supabase, sigKey);
      if (!isNewSig) {
        console.log("Duplicate UAZAPI message ignored (signature):", { sigKey, minuteBucket });
        return new Response(
          JSON.stringify({ received: true, ignored: true, reason: "duplicate_uazapi_signature", sigKey }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (e) {
      console.error("Secondary dedupe (signature) failed (allowing processing):", e);
      // fail-open
    }
    }

    // Find the instance by token
    const { data: instance, error: instanceError } = await supabase
      .from("instances")
      .select("*, ghl_subaccounts!inner(*)")
      .eq("uazapi_instance_token", instanceToken)
      .single();

    if (instanceError || !instance) {
      console.log("Instance not found for token:", instanceToken);
      return new Response(
        JSON.stringify({ received: true, ignored: true, reason: "instance not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if should ignore groups
    if (isGroup && instance.ignore_groups) {
      console.log("Ignoring group message");
      return new Response(
        JSON.stringify({ received: true, ignored: true, reason: "group ignored" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subaccount = instance.ghl_subaccounts;

    // Check if OAuth is configured
    if (!subaccount.ghl_access_token || !subaccount.ghl_refresh_token) {
      console.log("OAuth not configured for this subaccount");
      return new Response(
        JSON.stringify({ received: true, ignored: true, reason: "oauth not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user settings for OAuth credentials AND uazapi_base_url AND track_id
    const { data: settings } = await supabase
      .from("user_settings")
      .select("ghl_client_id, ghl_client_secret, uazapi_base_url, track_id")
      .eq("user_id", subaccount.user_id)
      .single();

    // Fallback to admin OAuth credentials if user doesn't have their own
    if (!settings?.ghl_client_id || !settings?.ghl_client_secret) {
      console.log("User OAuth credentials not found, trying admin credentials...");
      const { data: adminCreds } = await supabase.rpc("get_admin_oauth_credentials");
      if (adminCreds?.[0]?.ghl_client_id && adminCreds?.[0]?.ghl_client_secret) {
        if (settings) {
          settings.ghl_client_id = adminCreds[0].ghl_client_id;
          settings.ghl_client_secret = adminCreds[0].ghl_client_secret;
        }
        console.log("Using admin OAuth credentials as fallback");
      } else {
        console.log("OAuth credentials not found in user or admin settings");
        return new Response(
          JSON.stringify({ received: true, ignored: true, reason: "oauth credentials missing" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate track_id: if message was sent by API but doesn't match user's configured track_id, discard it
    // This prevents loops from other systems while allowing authorized AI agent messages through
    const userTrackId = settings.track_id || "";
    const isAgentIaMessage = wasSentByApi && trackId && trackId === userTrackId;
    
    if (wasSentByApi && trackId && trackId !== userTrackId) {
      console.log("Discarding API-sent message with mismatched track_id:", {
        wasSentByApi,
        incomingTrackId: trackId,
        expectedTrackId: userTrackId,
        messageid: messageData.messageid || messageData.id,
      });

      return new Response(
        JSON.stringify({
          received: true,
          ignored: true,
          reason: "discard_mismatched_track_id",
          incomingTrackId: trackId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Track ID validation:", { incomingTrackId: trackId, userTrackId, isAgentIaMessage });

    // Get valid token
    const token = await getValidToken(supabase, subaccount, settings);

    // Find or create contact
    // For groups, pass the group JID (e.g., 120363426159277315@g.us) as email field
    const groupEmailId = isGroupChat ? from : undefined;
    const contact = await findOrCreateContact(
      phoneNumber,
      pushName,
      subaccount.location_id,
      token,
      groupEmailId
    );

    // Save the normalized phone for all contacts (groups and individuals)
    // This allows bridge-switcher to find preferences when GHL creates new contactIds for the same phone
    if (contact.id && from) {
      try {
        // Normalize phone: remove @s.whatsapp.net, @g.us, and any non-digit characters
        const normalizedPhoneForMapping = from.split("@")[0].replace(/\D/g, "");
        
        await supabase
          .from("ghl_contact_phone_mapping")
          .upsert({
            contact_id: contact.id,
            location_id: subaccount.location_id,
            original_phone: normalizedPhoneForMapping, // Normalized phone (digits only)
          }, { onConflict: "contact_id,location_id" });
        console.log("[Inbound] Mapeamento de telefone salvo:", { contactId: contact.id.substring(0, 10), phone: normalizedPhoneForMapping, isGroup });
      } catch (e) {
        console.error("[Inbound] Falha ao salvar mapeamento:", e);
        // Don't fail the message processing
      }
    }

    // Upsert contact_instance_preferences to track the last instance used by this lead
    // NOVA LÓGICA: Buscar o contact_id PRIMÁRIO (real) do GHL usando o telefone
    // Isso evita duplicidade quando diferentes instâncias criam contatos com IDs diferentes
    if (contact.id && instance.id && from) {
      try {
        // LIMPEZA TOTAL DO TELEFONE: remove @s.whatsapp.net, @g.us, e TODOS caracteres não-numéricos
        const rawPhone = from.split("@")[0].replace(/\D/g, "");
        
        // Remover prefixo 55 (Brasil) se existir para normalização consistente
        const normalizedPhone = rawPhone.startsWith("55") ? rawPhone.slice(2) : rawPhone;
        
        // Extrair últimos 8 dígitos para matching sem o nono dígito (problema clássico BR)
        const last8Digits = normalizedPhone.slice(-8);
        
        // === BUSCAR O CONTACT_ID PRIMÁRIO DO GHL ===
        // Isso garante que sempre usamos o ID "oficial" da URL do GHL
        console.log("=== [INBOUND] BUSCANDO CONTACT_ID PRIMÁRIO DO GHL ===");
        console.log("[Inbound] 📞 Telefone do lead:", rawPhone);
        
        const primaryContactId = await getPrimaryContactId(rawPhone, subaccount.location_id, token);
        
        // Usar o ID primário se encontrado, senão usar o ID retornado por findOrCreateContact
        const contactIdToUse = primaryContactId || contact.id;
        
        console.log("[Inbound] 📞 Contact ID a ser usado:", { 
          primaryFromGHL: primaryContactId,
          fromFindOrCreate: contact.id,
          final: contactIdToUse
        });
        console.log("[Inbound] 📞 Instância que processou:", { id: instance.id, name: instance.instance_name });
        console.log("[Inbound] 📞 Location ID:", subaccount.location_id);
        
        // === ESTRATÉGIA DE UPSERT INTELIGENTE ===
        // PRIORIDADE 1: Buscar registro existente por telefone (mais confiável)
        console.log("[Inbound] 🔍 Buscando registro existente por telefone:", last8Digits);
        
        const { data: existingByPhone } = await supabase
          .from("contact_instance_preferences")
          .select("id, contact_id, lead_phone, instance_id")
          .eq("location_id", subaccount.location_id)
          .like("lead_phone", `%${last8Digits}`)
          .limit(1);
        
        // === DETECT INSTANCE CHANGE FOR NOTIFICATION ===
        let previousInstanceId: string | null = null;
        let previousInstanceName: string | null = null;
        let instanceChanged = false;
        
        if (existingByPhone && existingByPhone.length > 0) {
          previousInstanceId = existingByPhone[0].instance_id;
          instanceChanged = previousInstanceId !== instance.id;
          
          if (instanceChanged) {
            // Fetch the previous instance name for the notification
            const { data: prevInst } = await supabase
              .from("instances")
              .select("instance_name")
              .eq("id", previousInstanceId)
              .limit(1);
            previousInstanceName = prevInst?.[0]?.instance_name || null;
            console.log("[Inbound] 🔄 INSTANCE CHANGE DETECTED!", {
              previousInstanceId,
              previousInstanceName,
              newInstanceId: instance.id,
              newInstanceName: instance.instance_name,
            });
          }
        }
        
        if (existingByPhone && existingByPhone.length > 0) {
          // ENCONTRADO POR TELEFONE - Atualizar o registro existente
          // Também atualiza o contact_id para o ID primário/real
          console.log("[Inbound] ✅ Encontrado registro existente por telefone:", { 
            id: existingByPhone[0].id, 
            oldContactId: existingByPhone[0].contact_id,
            newContactId: contactIdToUse,
            storedPhone: existingByPhone[0].lead_phone
          });
          
          const { error: updateError } = await supabase
            .from("contact_instance_preferences")
            .update({
              contact_id: contactIdToUse, // Usa o ID primário real
              instance_id: instance.id,
              lead_phone: normalizedPhone,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingByPhone[0].id);
          
          if (updateError) {
            console.error("[Inbound] ❌ Erro ao atualizar por telefone:", updateError.message);
          } else {
            console.log(`[Inbound] 📌 Atualizado por telefone: ${normalizedPhone} → Instância ${instance.instance_name}`);
            console.log(`[Inbound] 📌 Contact ID atualizado: ${existingByPhone[0].contact_id} → ${contactIdToUse}`);
          }
        } else {
          // PRIORIDADE 2: Buscar por contact_id primário
          console.log("[Inbound] 🔍 Não encontrou por telefone, buscando por contact_id:", contactIdToUse);
          
          const { data: existingByContactId } = await supabase
            .from("contact_instance_preferences")
            .select("id, lead_phone")
            .eq("contact_id", contactIdToUse)
            .eq("location_id", subaccount.location_id)
            .limit(1);
          
          if (existingByContactId && existingByContactId.length > 0) {
            // Encontrado por contact_id - atualizar
            console.log("[Inbound] ✅ Encontrado registro existente por contact_id:", existingByContactId[0].id);
            
            const { error: updateError } = await supabase
              .from("contact_instance_preferences")
              .update({
                instance_id: instance.id,
                lead_phone: normalizedPhone,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingByContactId[0].id);
            
            if (updateError) {
              console.error("[Inbound] ❌ Erro ao atualizar por contact_id:", updateError.message);
            } else {
              console.log(`[Inbound] 📌 Atualizado por contact_id: ${normalizedPhone} → Instância ${instance.instance_name}`);
            }
          } else {
            // PRIORIDADE 3: Não encontrado - inserir novo registro com o ID primário
            console.log("[Inbound] 🆕 Inserindo novo registro com contact_id primário:", contactIdToUse);
            
            const { error: insertError } = await supabase
              .from("contact_instance_preferences")
              .insert({
                contact_id: contactIdToUse, // USA O ID PRIMÁRIO REAL
                location_id: subaccount.location_id,
                instance_id: instance.id,
                lead_phone: normalizedPhone,
                updated_at: new Date().toISOString(),
              });
            
            if (insertError) {
              // Se falhar por conflito, tentar upsert como fallback
              if (insertError.code === "23505") {
                console.log("[Inbound] ⚠️ Conflito detectado, tentando upsert...");
                const { error: upsertError } = await supabase
                  .from("contact_instance_preferences")
                  .upsert({
                    contact_id: contactIdToUse,
                    location_id: subaccount.location_id,
                    instance_id: instance.id,
                    lead_phone: normalizedPhone,
                    updated_at: new Date().toISOString(),
                  }, { onConflict: "contact_id,location_id" });
                
                if (upsertError) {
                  console.error("[Inbound] ❌ Erro no upsert fallback:", upsertError.message);
                } else {
                  console.log(`[Inbound] 📌 Inserido via upsert: ${normalizedPhone} → Instância ${instance.instance_name}`);
                }
              } else {
                console.error("[Inbound] ❌ Erro ao inserir:", insertError.message);
              }
            } else {
              console.log(`[Inbound] 📌 Novo registro criado: ${normalizedPhone} → Instância ${instance.instance_name}`);
            }
          }
        }
        
        // === LIMPEZA DE DUPLICADOS ===
        // Se existirem múltiplos registros para o mesmo telefone, deletar os extras
        const { data: allRecordsForPhone } = await supabase
          .from("contact_instance_preferences")
          .select("id, contact_id, created_at")
          .eq("location_id", subaccount.location_id)
          .like("lead_phone", `%${last8Digits}`)
          .order("created_at", { ascending: true });
        
        if (allRecordsForPhone && allRecordsForPhone.length > 1) {
          console.log("[Inbound] 🧹 Encontrados múltiplos registros para o mesmo telefone:", allRecordsForPhone.length);
          // Manter apenas o primeiro (mais antigo) e deletar os outros
          const toDelete = allRecordsForPhone.slice(1).map(r => r.id);
          
          const { error: deleteError } = await supabase
            .from("contact_instance_preferences")
            .delete()
            .in("id", toDelete);
          
          if (deleteError) {
            console.error("[Inbound] ❌ Erro ao limpar duplicados:", deleteError.message);
          } else {
            console.log("[Inbound] 🧹 Duplicados removidos:", toDelete.length);
          }
        }
        
        // === INSTANCE CHANGE NOTIFICATION (InternalComment + Broadcast) ===
        if (instanceChanged && previousInstanceName && instance.instance_name) {
          console.log("[Inbound] 🔔 Creating instance change notification...");
          
          // 1) Create InternalComment in GHL conversation
          const commentContent = `🔄 Instância alterada: ${previousInstanceName} → ${instance.instance_name}`;
          
          try {
            // Search for conversation by contact
            const conversationSearchRes = await fetch(
              `https://services.leadconnectorhq.com/conversations/search?locationId=${subaccount.location_id}&contactId=${contactIdToUse}`,
              {
                headers: {
                  "Authorization": `Bearer ${token}`,
                  "Version": "2021-04-15",
                  "Accept": "application/json",
                },
              }
            );
            
            if (conversationSearchRes.ok) {
              const conversationData = await conversationSearchRes.json();
              const conversationId = conversationData?.conversations?.[0]?.id;
              
              if (conversationId) {
                const icRes = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages", {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${token}`,
                    "Version": "2021-04-15",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                  },
                  body: JSON.stringify({
                    type: "InternalComment",
                    conversationId: conversationId,
                    contactId: contactIdToUse,
                    message: commentContent,
                  }),
                });
                
                if (icRes.ok) {
                  console.log("[Inbound] ✅ Instance change InternalComment created");
                } else {
                  const icError = await icRes.text();
                  console.error("[Inbound] ❌ Failed to create InternalComment:", icError.substring(0, 200));
                }
              } else {
                console.log("[Inbound] ⚠️ No conversation found for InternalComment");
              }
            }
          } catch (icErr) {
            console.error("[Inbound] ❌ Error creating InternalComment:", icErr);
          }
          
          // 2) Broadcast to frontend for real-time dropdown update
          try {
            await supabase.channel("ghl_updates").send({
              type: "broadcast",
              event: "instance_switch",
              payload: {
                location_id: subaccount.location_id,
                lead_phone: rawPhone,
                new_instance_id: instance.id,
                new_instance_name: instance.instance_name,
                previous_instance_name: previousInstanceName,
              },
            });
            console.log("[Inbound] ✅ Instance switch broadcasted to frontend");
          } catch (broadcastErr) {
            console.error("[Inbound] ❌ Error broadcasting instance switch:", broadcastErr);
          }
        }
        
        console.log(`[Inbound] ✅ Processamento de preferência concluído para: ${normalizedPhone}`);
      } catch (e) {
        console.error("[Inbound] ❌ Erro crítico ao atualizar preferências:", e);
        // Don't fail the message processing
      }
    }

    // Update contact photo from WhatsApp profile
    const profilePhoto = chatData.imagePreview || chatData.image || "";
    if (profilePhoto && contact.id) {
      await updateContactPhoto(contact.id, profilePhoto, token);
    }

    // Update contact source with the connected instance phone number
    if (contact.id && instance.phone) {
      const formattedPhone = instance.phone.replace(/\D/g, '');
      let phoneSource = `WA: +${formattedPhone}`;
      if (formattedPhone.length >= 12) {
        phoneSource = `WA: +${formattedPhone.slice(0, 2)} ${formattedPhone.slice(2, 4)} ${formattedPhone.slice(4, 9)}-${formattedPhone.slice(9)}`;
      } else if (formattedPhone.length >= 10) {
        phoneSource = `WA: +${formattedPhone.slice(0, 2)} ${formattedPhone.slice(2)}`;
      }
      
      console.log("Updating contact source with instance phone:", { contactId: contact.id, phoneSource });
      try {
        const sourceResp = await fetchGHL(`https://services.leadconnectorhq.com/contacts/${contact.id}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Version": "2021-07-28",
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ source: phoneSource }),
        });
        if (!sourceResp.ok) {
          console.error("Failed to update contact source:", await sourceResp.text());
        } else {
          console.log("Contact source updated successfully:", phoneSource);
        }
      } catch (e) {
        console.error("Error updating contact source:", e);
      }
    }

    // Auto-assign contact to GHL user if configured on this instance
    if (instance.ghl_user_id && contact.id) {
      console.log("Auto-assigning contact to GHL user:", instance.ghl_user_id);
      await assignContactToUser(contact.id, instance.ghl_user_id, token);
    }
    // Prepare media URL if needed
    let publicMediaUrl = mediaUrl;
    if (isMediaMessage && mediaUrl) {
      const baseUrl = instance.uazapi_base_url?.replace(/\/$/, "") || settings.uazapi_base_url?.replace(/\/$/, "") || body.BaseUrl?.replace(/\/$/, "") || "";
      const messageId = messageData.messageid || messageData.id || "";
      
      // Try to get public URL via UAZAPI download endpoint (POST /message/download)
      if (baseUrl && messageId) {
        console.log("Attempting to get public media URL via UAZAPI download:", { baseUrl, messageId });
        const downloadedUrl = await getPublicMediaUrl(baseUrl, instanceToken, messageId);
        if (downloadedUrl) {
          publicMediaUrl = downloadedUrl;
        } else {
          console.log("Could not get public URL, using original encrypted URL");
        }
      }
    }

    // =====================================================================
    // INTERACTIVE COMMANDS FROM MOBILE WHATSAPP
    // When user sends #botoes, #pix, #lista, #enquete from their phone,
    // intercept and process the command instead of syncing as regular message.
    // =====================================================================
    const interactiveCommands = ["#pix", "#botoes", "#lista", "#enquete"];
    const trimmedText = (textMessage || "").trim();
    const isInteractiveCommand = isFromMe && trimmedText.startsWith("#") && 
      interactiveCommands.some(cmd => trimmedText.toLowerCase().startsWith(cmd));

    if (isInteractiveCommand) {
      const baseUrl = (instance.uazapi_base_url || settings.uazapi_base_url || "").replace(/\/$/, "");
      
      if (!baseUrl) {
        console.log("Interactive command from mobile but no UAZAPI base URL configured");
        return new Response(
          JSON.stringify({ received: true, ignored: true, reason: "no_uazapi_base_url_for_command" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parse command and params (split by | with first word as command)
      const firstWS = trimmedText.search(/[\s\t]/);
      let cmdName: string;
      let cmdParams: string[];
      if (firstWS === -1) {
        cmdName = trimmedText.toLowerCase();
        cmdParams = [];
      } else {
        cmdName = trimmedText.substring(0, firstWS).toLowerCase();
        const paramsStr = trimmedText.substring(firstWS).trim();
        cmdParams = paramsStr.split("|").map(p => p.trim()).filter(p => p.length > 0);
      }

      // The target phone is the lead (the chat we're in)
      const cmdTargetPhone = from.split("@")[0].replace(/\D/g, "");
      
      console.log("📱 Interactive command from mobile WhatsApp:", { cmdName, params: cmdParams.length, targetPhone: cmdTargetPhone });

      let cmdResult = { success: false, message: "" };

      switch (cmdName) {
        case "#pix": {
          if (cmdParams.length < 3) {
            cmdResult = { success: false, message: "Formato: #pix tipo|chave|nome\nTipos: EVP, CPF, CNPJ, PHONE, EMAIL" };
            break;
          }
          const pixType = cmdParams[0].toUpperCase().trim();
          const pixKey = cmdParams[1].trim();
          const pixName = cmdParams[2].trim();
          const validPixTypes = ["EVP", "CPF", "CNPJ", "PHONE", "EMAIL"];
          if (!validPixTypes.includes(pixType)) {
            cmdResult = { success: false, message: "Tipo PIX inválido: \"" + pixType + "\". Use: " + validPixTypes.join(", ") };
            break;
          }
          try {
            const pixRes = await fetch(baseUrl + "/send/pix-button", {
              method: "POST",
              headers: { "Content-Type": "application/json", "token": instanceToken },
              body: JSON.stringify({ number: cmdTargetPhone, pixType, pixKey, pixName }),
            });
            const pixText = await pixRes.text();
            console.log("PIX button response (mobile):", { status: pixRes.status, body: pixText.substring(0, 300) });
            cmdResult = pixRes.ok
              ? { success: true, message: "Botão PIX enviado para " + cmdTargetPhone + " (" + pixName + ")" }
              : { success: false, message: "Falha ao enviar PIX (" + pixRes.status + "): " + pixText.substring(0, 100) };
          } catch (e) {
            cmdResult = { success: false, message: "Erro ao enviar PIX: " + (e instanceof Error ? e.message : "Falha") };
          }
          break;
        }

        case "#botoes": {
          if (cmdParams.length < 2) {
            cmdResult = { success: false, message: "Formato: #botoes texto|botão1,botão2,botão3" };
            break;
          }
          let btnText: string;
          let btnFooter = "";
          let btnChoicesRaw: string;
          if (cmdParams.length >= 3) {
            btnText = cmdParams[0].trim();
            btnFooter = cmdParams[1].trim();
            btnChoicesRaw = cmdParams[2];
          } else {
            btnText = cmdParams[0].trim();
            btnChoicesRaw = cmdParams[1];
          }
          const btnChoices = btnChoicesRaw.split(",").map(b => b.trim()).filter(b => b.length > 0).slice(0, 3);
          const btnPayload: Record<string, unknown> = {
            number: cmdTargetPhone,
            type: "button",
            text: btnText,
            choices: btnChoices,
            readchat: true,
          };
          if (btnFooter) btnPayload.footerText = btnFooter;
          console.log("Sending buttons from mobile:", JSON.stringify(btnPayload));
          try {
            const btnRes = await fetch(baseUrl + "/send/menu", {
              method: "POST",
              headers: { "Content-Type": "application/json", token: instanceToken },
              body: JSON.stringify(btnPayload),
            });
            const btnBody = await btnRes.text();
            console.log("Buttons response (mobile):", { status: btnRes.status, body: btnBody.substring(0, 300) });
            cmdResult = btnRes.ok
              ? { success: true, message: "Botões enviados para " + cmdTargetPhone }
              : { success: false, message: "Falha ao enviar botões (" + btnRes.status + "): " + btnBody.substring(0, 100) };
          } catch (e) {
            cmdResult = { success: false, message: "Erro ao enviar botões: " + (e instanceof Error ? e.message : "Falha") };
          }
          break;
        }

        case "#lista": {
          if (cmdParams.length < 3) {
            cmdResult = { success: false, message: "Formato: #lista texto|textoBotão|[Seção],item1,item2" };
            break;
          }
          const listText = cmdParams[0].trim();
          const listButton = cmdParams[1].trim();
          const listChoices: string[] = [];
          for (let li = 2; li < cmdParams.length; li++) {
            const part = cmdParams[li].trim();
            const subItems = part.split(",").map(s => s.trim()).filter(s => s.length > 0);
            for (const si of subItems) {
              listChoices.push(si);
            }
          }
          const listPayload: Record<string, unknown> = {
            number: cmdTargetPhone,
            type: "list",
            text: listText,
            listButton,
            choices: listChoices,
            readchat: true,
          };
          console.log("Sending list from mobile:", JSON.stringify(listPayload));
          try {
            const listRes = await fetch(baseUrl + "/send/menu", {
              method: "POST",
              headers: { "Content-Type": "application/json", token: instanceToken },
              body: JSON.stringify(listPayload),
            });
            const listBody = await listRes.text();
            console.log("List response (mobile):", { status: listRes.status, body: listBody.substring(0, 300) });
            cmdResult = listRes.ok
              ? { success: true, message: "Lista enviada para " + cmdTargetPhone }
              : { success: false, message: "Falha ao enviar lista (" + listRes.status + "): " + listBody.substring(0, 100) };
          } catch (e) {
            cmdResult = { success: false, message: "Erro ao enviar lista: " + (e instanceof Error ? e.message : "Falha") };
          }
          break;
        }

        case "#enquete": {
          if (cmdParams.length < 3) {
            cmdResult = { success: false, message: "Formato: #enquete pergunta|opção1|opção2|opção3... (mín. 2 opções)" };
            break;
          }
          const pollText = cmdParams[0].trim();
          const pollChoices = cmdParams.slice(1).map(o => o.trim());
          const pollPayload = {
            number: cmdTargetPhone,
            type: "poll",
            text: pollText,
            choices: pollChoices,
            selectableCount: 1,
            readchat: true,
          };
          console.log("Sending poll from mobile:", JSON.stringify(pollPayload));
          try {
            const pollRes = await fetch(baseUrl + "/send/menu", {
              method: "POST",
              headers: { "Content-Type": "application/json", token: instanceToken },
              body: JSON.stringify(pollPayload),
            });
            const pollBody = await pollRes.text();
            console.log("Poll response (mobile):", { status: pollRes.status, body: pollBody.substring(0, 300) });
            cmdResult = pollRes.ok
              ? { success: true, message: "Enquete enviada para " + cmdTargetPhone }
              : { success: false, message: "Falha ao enviar enquete (" + pollRes.status + "): " + pollBody.substring(0, 100) };
          } catch (e) {
            cmdResult = { success: false, message: "Erro ao enviar enquete: " + (e instanceof Error ? e.message : "Falha") };
          }
          break;
        }
      }

      // Log result as InternalComment in GHL so user sees feedback
      const emoji = cmdResult.success ? "✅" : "❌";
      const commentMsg = emoji + " " + cmdName + ": " + cmdResult.message;
      
      try {
        const convSearchRes = await fetch(
          "https://services.leadconnectorhq.com/conversations/search?locationId=" + subaccount.location_id + "&contactId=" + contact.id,
          {
            headers: {
              "Authorization": "Bearer " + token,
              "Version": "2021-04-15",
              "Accept": "application/json",
            },
          }
        );
        if (convSearchRes.ok) {
          const convData = await convSearchRes.json();
          const convId = convData?.conversations?.[0]?.id;
          if (convId) {
            await fetchGHL("https://services.leadconnectorhq.com/conversations/messages", {
              method: "POST",
              headers: {
                "Authorization": "Bearer " + token,
                "Version": "2021-04-15",
                "Content-Type": "application/json",
                "Accept": "application/json",
              },
              body: JSON.stringify({
                type: "InternalComment",
                conversationId: convId,
                contactId: contact.id,
                message: commentMsg,
                ...(instance.ghl_user_id && { userId: instance.ghl_user_id }),
              }),
            });
            console.log("📱 Command feedback InternalComment sent:", commentMsg);
          }
        }
      } catch (icErr) {
        console.error("Failed to send command feedback InternalComment:", icErr);
      }

      console.log("📱 Interactive command processed from mobile:", { cmdName, success: cmdResult.success, message: cmdResult.message });

      return new Response(
        JSON.stringify({
          success: cmdResult.success,
          command: cmdName,
          message: cmdResult.message,
          source: "mobile_whatsapp",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send message to GHL - differentiate between inbound (from lead) and outbound (from us/agent)
    // isAgentIaMessage: message sent by API with track_id="agente_ia" - render as outbound (attendant message)
    const shouldSyncAsOutbound = isFromMe || isAgentIaMessage;
    
    if (shouldSyncAsOutbound) {
      // This is a message WE sent via WhatsApp OR from AI agent - render as outbound in GHL
      // NOTE: GHL's /conversations/messages supports userId only for InternalComment.
      // For SMS, attribution should be handled by contact assignment (already done above).

      console.log("Syncing outbound message:", {
        isFromMe,
        isAgentIaMessage,
        wasSentByApi,
        instanceAssignedUserId: instance.ghl_user_id || null,
        textMessage: textMessage?.substring(0, 50),
        isMedia: isMediaMessage,
      });

      if (isMediaMessage && publicMediaUrl) {
        console.log("Sending outbound media to GHL (inbound endpoint):", { publicMediaUrl, textMessage });
        const before = Date.now();
        // Use /inbound endpoint with direction=outbound to avoid triggering GHL webhooks
        const res = await fetchGHL(`https://services.leadconnectorhq.com/conversations/messages/inbound`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Version": "2021-04-15",
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            type: "SMS",
            contactId: contact.id,
            message: textMessage || "",
            attachments: [publicMediaUrl],
            status: "delivered",
            direction: "outbound", // Critical: marks as outbound but won't trigger webhooks
            ...(instance.ghl_user_id && { userId: instance.ghl_user_id }), // Show message as sent by assigned user
          }),
        });
        const bodyText = await res.text();
        console.log("GHL outbound-media response (no webhook):", { status: res.status, ms: Date.now() - before, body: bodyText.substring(0, 500) });
        if (!res.ok) throw new Error("Failed to send outbound media to GHL");
        try {
          const parsed = JSON.parse(bodyText);
          const ghlMessageId = String(parsed?.messageId || "");
          if (ghlMessageId) {
            await markIfNew(supabase, `ghl:${ghlMessageId}`);
            // Save message mapping for edit/react/delete functionality
            const uazapiMsgId = messageData.messageid || messageData.id || "";
            await supabase.from("message_map").upsert({
              ghl_message_id: ghlMessageId,
              uazapi_message_id: uazapiMsgId || null,
              location_id: subaccount.location_id,
              contact_id: contact.id,
              message_text: textMessage || "",
              message_type: `media:${(mediaType || "").toLowerCase().replace("message", "")}` || "media",
              from_me: true,
              original_timestamp: new Date().toISOString(),
            }, { onConflict: "ghl_message_id" });
            console.log("Message mapping saved:", { ghl: ghlMessageId, uazapi: uazapiMsgId });
          }
        } catch {
          // ignore
        }
      } else if (textMessage) {
        const uazapiMsgId = messageData.messageid || messageData.id || "";

        // If this outbound message is a WhatsApp Reply (has quoted context),
        // send ONLY the InternalComment (which already contains the full text + reply context).
        // This avoids creating a duplicate: the normal text message AND the InternalComment.
        if ((quotedMessageId || quotedText) && contact?.id) {
          console.log("Outbound reply detected – sending only InternalComment (no duplicate text):", {
            textMessage: textMessage?.substring(0, 50),
            quotedMessageId,
            quotedText: quotedText?.substring(0, 50),
          });

          try {
            let originalText = quotedText || "";

            if (!originalText && quotedMessageId) {
              const { data: originalMapping } = await supabase
                .from("message_map")
                .select("message_text")
                .eq("uazapi_message_id", quotedMessageId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (originalMapping?.message_text) originalText = originalMapping.message_text;
            }

            const formattedReplyComment = originalText
              ? `↩️ Respondendo a: "${originalText.substring(0, 100)}${originalText.length > 100 ? '...' : ''}"\n\n${textMessage}`
              : textMessage;

            const icRes = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${token}`,
                "Version": "2021-04-15",
                "Content-Type": "application/json",
                "Accept": "application/json",
              },
              body: JSON.stringify({
                type: "InternalComment",
                contactId: contact.id,
                message: formattedReplyComment,
                ...(instance.ghl_user_id && { userId: instance.ghl_user_id }),
              }),
            });

            const icText = await icRes.text();
            if (!icRes.ok) {
              console.error("Failed to send reply InternalComment (mobile) to GHL:", icText.substring(0, 300));
            } else {
              console.log("✅ Reply InternalComment mirrored (mobile):", icText.substring(0, 200));

              // Save mapping from InternalComment response
              try {
                const parsed = JSON.parse(icText);
                const ghlMessageId = String(parsed?.messageId || "");
                if (ghlMessageId) {
                  await markIfNew(supabase, `ghl:${ghlMessageId}`);
                  await supabase.from("message_map").upsert({
                    ghl_message_id: ghlMessageId,
                    uazapi_message_id: uazapiMsgId || null,
                    location_id: subaccount.location_id,
                    contact_id: contact.id,
                    message_text: textMessage,
                    message_type: "text",
                    from_me: true,
                    original_timestamp: new Date().toISOString(),
                  }, { onConflict: "ghl_message_id" });
                  console.log("Reply mapping saved:", { ghl: ghlMessageId, uazapi: uazapiMsgId });
                }
              } catch {
                // ignore parse errors
              }
            }
          } catch (e) {
            console.error("Error creating reply InternalComment:", e);
          }
        } else {
          // Normal outbound text (no reply context) – send as regular outbound message
          console.log("Sending outbound text to GHL (inbound endpoint):", { textMessage: textMessage?.substring(0, 50) });
          const before = Date.now();
          const res = await fetchGHL(`https://services.leadconnectorhq.com/conversations/messages/inbound`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Version": "2021-04-15",
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify({
              type: "SMS",
              contactId: contact.id,
              message: textMessage,
              status: "delivered",
              direction: "outbound",
              ...(instance.ghl_user_id && { userId: instance.ghl_user_id }),
            }),
          });
          const bodyText = await res.text();
          console.log("GHL outbound-text response (no webhook):", { status: res.status, ms: Date.now() - before, body: bodyText.substring(0, 500) });
          if (!res.ok) throw new Error("Failed to send outbound message to GHL");

          try {
            const parsed = JSON.parse(bodyText);
            const ghlMessageId = String(parsed?.messageId || "");
            if (ghlMessageId) {
              await markIfNew(supabase, `ghl:${ghlMessageId}`);
              await supabase.from("message_map").upsert({
                ghl_message_id: ghlMessageId,
                uazapi_message_id: uazapiMsgId || null,
                location_id: subaccount.location_id,
                contact_id: contact.id,
                message_text: textMessage,
                message_type: "text",
                from_me: true,
                original_timestamp: new Date().toISOString(),
              }, { onConflict: "ghl_message_id" });
              console.log("Message mapping saved:", { ghl: ghlMessageId, uazapi: uazapiMsgId });
            }
          } catch {
            // ignore
          }
        }
      }

      const source = isAgentIaMessage ? "agent_ia" : (wasSentByApi ? "api" : "manual");
      console.log(`✅ Outbound message synced to GHL (${source}): ${phoneNumber} -> ${contact.id}`);
    } else {
      // This is a message FROM the lead - send as inbound
      
      // === OFFICIAL API MODE: Skip inbound forwarding ===
      // When is_official_api is active, the official WhatsApp provider in GHL already delivers
      // inbound messages. Forwarding them again would create duplicates.
      if (instance.is_official_api) {
        console.log(`⏭️ Skipping inbound forwarding (official API mode): ${phoneNumber} -> ${contact.id}`);
      } else {
        // For group messages, format with member identification prefix with line break for clear reading
        // Format: (5521980014713)-👤[ Érick ]:
        const memberPrefix = isGroupChat && memberName ? `(${memberPhone})-👤[ ${memberName} ]:\n` : "";
        
        let formattedMessage = textMessage;
        let formattedCaption = textMessage || undefined;
        
        // If this is a REPLY, try to get the original message from database and add context
        if (quotedMessageId || quotedText) {
          let originalText = quotedText;
          let originalGhlId = "";
          
          // Try to find the original message in our mapping for richer context
          if (quotedMessageId) {
            const { data: originalMapping } = await supabase
              .from("message_map")
              .select("message_text, ghl_message_id")
              .eq("uazapi_message_id", quotedMessageId)
              .maybeSingle();
            
            if (originalMapping?.message_text) {
              originalText = originalMapping.message_text;
            }
            if (originalMapping?.ghl_message_id) {
              originalGhlId = originalMapping.ghl_message_id;
            }
          }
          
          // Add reply context prefix
          if (originalText) {
            const replyPrefix = `↩️ Respondendo a: "${originalText.substring(0, 100)}${originalText.length > 100 ? '...' : ''}"\n\n`;
            formattedMessage = replyPrefix + (formattedMessage || "");
            if (formattedCaption) {
              formattedCaption = replyPrefix + formattedCaption;
            }
            
            // Broadcast reply event for UI update - include the GHL ID of the original message
            if (originalGhlId) {
              await supabase.channel("ghl_updates").send({
                type: "broadcast",
                event: "msg_update",
                payload: {
                  type: "reply",
                  ghl_id: originalGhlId,  // ID of the message being replied to
                  replyData: { text: originalText.substring(0, 200) },
                  location_id: subaccount.location_id,
                },
              });
              console.log("✅ Reply event broadcasted:", { originalGhlId, quotedText: originalText?.substring(0, 30) });
            } else {
              console.log("⚠️ Reply detected but original message not mapped:", { quotedMessageId, quotedText: quotedText?.substring(0, 30) });
            }
          }
        }
        
        // Apply member prefix to text messages
        if (memberPrefix && formattedMessage) {
          formattedMessage = `${memberPrefix}${formattedMessage}`;
        }
        
        // Apply member prefix to captions
        if (memberPrefix && formattedCaption) {
          formattedCaption = `${memberPrefix}${formattedCaption}`;
        }
        
        // For group media without caption, still add member identification
        // Also capture and save message mapping for edit/react/delete
        const uazapiMsgId = messageData.messageid || messageData.id || "";
        
        if (isMediaMessage && publicMediaUrl) {
          const mediaCaption = formattedCaption || (memberPrefix ? memberPrefix.trim() : undefined);
          console.log("Sending inbound media to GHL:", { publicMediaUrl, mediaCaption, memberName, memberPhone });
          const ghlMessageId = await sendMediaToGHL(contact.id, [publicMediaUrl], token, mediaCaption);
          
          // Save message mapping for inbound media
          if (ghlMessageId && uazapiMsgId) {
            await supabase.from("message_map").upsert({
              ghl_message_id: ghlMessageId,
              uazapi_message_id: uazapiMsgId,
              location_id: subaccount.location_id,
              contact_id: contact.id,
              message_text: mediaCaption || "",
              message_type: `media:${(mediaType || "").toLowerCase().replace("message", "")}` || "media",
              from_me: false,
              original_timestamp: new Date().toISOString(),
            }, { onConflict: "ghl_message_id" });
            console.log("Inbound message mapping saved:", { ghl: ghlMessageId, uazapi: uazapiMsgId });
          }
        } else {
          console.log("Sending inbound text to GHL:", { formattedMessage: formattedMessage?.substring(0, 50) });
          const ghlMessageId = await sendMessageToGHL(contact.id, formattedMessage, token);
          
          // Save message mapping for inbound text
          if (ghlMessageId && uazapiMsgId) {
            await supabase.from("message_map").upsert({
              ghl_message_id: ghlMessageId,
              uazapi_message_id: uazapiMsgId,
              location_id: subaccount.location_id,
              contact_id: contact.id,
              message_text: textMessage || "",
              message_type: "text",
              from_me: false,
              original_timestamp: new Date().toISOString(),
            }, { onConflict: "ghl_message_id" });
            console.log("Inbound message mapping saved:", { ghl: ghlMessageId, uazapi: uazapiMsgId });
          }
        }
        
        console.log(`✅ Inbound message forwarded to GHL: ${phoneNumber} -> ${contact.id}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        contactId: contact.id,
        direction: shouldSyncAsOutbound ? "outbound" : "inbound",
        source: isAgentIaMessage ? "agent_ia" : (isFromMe ? "manual" : "lead"),
        message: shouldSyncAsOutbound ? "Outbound message synced to GHL" : "Inbound message forwarded to GHL"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
