import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Retry wrapper for GHL API calls
async function fetchGHL(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 && attempt < maxRetries) {
        const waitMs = Math.min(1000 * Math.pow(2, attempt), 4000);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw lastError || new Error("fetchGHL: all retries exhausted");
}

// Get valid GHL access token, refreshing if needed
async function getValidToken(supabase: any, subaccount: any, settings: any): Promise<string> {
  const accessToken = subaccount.ghl_access_token;
  const refreshToken = subaccount.ghl_refresh_token;
  const expiresAtIso = subaccount.ghl_token_expires_at;

  if (!accessToken || !refreshToken || !expiresAtIso) return accessToken || "";

  const now = new Date();
  const expiresAt = new Date(expiresAtIso);
  const expiresIn1Hour = expiresAt.getTime() - now.getTime() < 3600000;

  if (now >= expiresAt || expiresIn1Hour) {
    const tokenParams = new URLSearchParams({
      client_id: settings.ghl_client_id,
      client_secret: settings.ghl_client_secret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      user_type: "Location",
    });

    const tokenResponse = await fetchGHL("https://services.leadconnectorhq.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      console.error("[ghost-audio] Token refresh failed:", await tokenResponse.text());
      return accessToken;
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
      .eq("id", subaccount.id);

    return tokenData.access_token;
  }

  return accessToken;
}

// Look up contact ID from local preferences table first, then fallback to GHL API
async function resolveContactId(
  supabase: any, phone: string, locationId: string, ghlToken: string
): Promise<string | null> {
  const last10 = phone.replace(/\D/g, "").slice(-10);

  // 1. Try contact_instance_preferences (local DB - fast)
  const { data: pref } = await supabase
    .from("contact_instance_preferences")
    .select("contact_id")
    .eq("location_id", locationId)
    .ilike("lead_phone", `%${last10}`)
    .limit(1);

  if (pref?.length && pref[0].contact_id) {
    console.log("[ghost-audio] Contact resolved from preferences:", pref[0].contact_id);
    return pref[0].contact_id;
  }

  // 2. Try ghl_contact_phone_mapping (local DB)
  const { data: mapping } = await supabase
    .from("ghl_contact_phone_mapping")
    .select("contact_id")
    .eq("location_id", locationId)
    .ilike("original_phone", `%${last10}`)
    .limit(1);

  if (mapping?.length && mapping[0].contact_id) {
    console.log("[ghost-audio] Contact resolved from phone mapping:", mapping[0].contact_id);
    return mapping[0].contact_id;
  }

  // 3. Fallback: search GHL API
  const cleanPhone = phone.replace(/\D/g, "");
  let res = await fetchGHL(
    `https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&query=${cleanPhone}`,
    { headers: { "Authorization": `Bearer ${ghlToken}`, "Version": "2021-07-28", "Accept": "application/json" } }
  );

  if (res.ok) {
    const data = await res.json();
    if (data.contacts?.length > 0) {
      console.log("[ghost-audio] Contact resolved from GHL API:", data.contacts[0].id);
      return data.contacts[0].id;
    }
  }

  // Try last 10 digits on GHL API
  if (cleanPhone.length > 10) {
    res = await fetchGHL(
      `https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&query=${last10}`,
      { headers: { "Authorization": `Bearer ${ghlToken}`, "Version": "2021-07-28", "Accept": "application/json" } }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.contacts?.length > 0) {
        console.log("[ghost-audio] Contact resolved from GHL API (last10):", data.contacts[0].id);
        return data.contacts[0].id;
      }
    }
  }

  return null;
}

// Download media from UAZAPI to get public URL
async function getPublicMediaUrl(baseUrl: string, instanceToken: string, messageId: string): Promise<string | null> {
  const downloadUrl = `${baseUrl}/message/download`;
  console.log("[ghost-audio] Downloading media URL:", { downloadUrl, messageId });

  try {
    const res = await fetch(downloadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({ id: messageId }),
    });

    const responseText = await res.text();
    console.log("[ghost-audio] Download response:", { status: res.status, body: responseText.substring(0, 300) });

    if (res.ok) {
      try {
        const data = JSON.parse(responseText);
        const fileUrl = data.fileURL || data.fileUrl || data.url || data.URL || data.file || null;
        if (fileUrl) {
          console.log("[ghost-audio] Got public media URL:", fileUrl);
          return fileUrl;
        }
      } catch {
        if (responseText.startsWith("http")) {
          return responseText.trim();
        }
      }
    }
  } catch (err) {
    console.error("[ghost-audio] Media download error:", err);
  }
  return null;
}

// Mirror the audio as an outbound message in GHL conversation
async function mirrorAudioInGHL(contactId: string, ghlToken: string, audioUrl: string | null): Promise<string | null> {
  const payload: any = {
    type: "SMS",
    contactId,
    status: "delivered",
    direction: "outbound",
  };

  if (audioUrl) {
    payload.attachments = [audioUrl];
    payload.message = "🎙️";
  } else {
    payload.message = "🎙️ Áudio enviado via WhatsApp";
  }

  console.log("[ghost-audio] Mirroring audio in GHL:", { contactId, hasAudioUrl: !!audioUrl });

  const response = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages/inbound", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ghlToken}`,
      "Version": "2021-04-15",
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("[ghost-audio] Failed to mirror in GHL:", responseText);
    return null;
  }
  
  console.log("[ghost-audio] ✅ Audio mirrored in GHL as outbound:", responseText.substring(0, 200));
  try {
    const data = JSON.parse(responseText);
    return data.messageId || null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { audio, format, locationId, conversationId, phone } = await req.json();

    if (!audio || !locationId || !phone) {
      return new Response(JSON.stringify({ error: "audio, locationId and phone are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[ghost-audio] Received:", { format, locationId, conversationId, phone, audioSize: audio?.length });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Find the subaccount for this locationId (prioritize most recently OAuth-installed)
    const { data: subaccount, error: subErr } = await supabase
      .from("ghl_subaccounts")
      .select("id, user_id, ghl_access_token, ghl_refresh_token, ghl_token_expires_at")
      .eq("location_id", locationId)
      .order("oauth_installed_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (subErr || !subaccount?.length) {
      console.error("[ghost-audio] Subaccount not found for location:", locationId);
      return new Response(JSON.stringify({ error: "Subaccount not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sub = subaccount[0];

    // 2. Clean phone number
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 8) {
      return new Response(JSON.stringify({ error: "Invalid phone number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("[ghost-audio] Target phone:", cleanPhone);

    // 3. Resolve the correct instance for this contact
    let instance: any = null;

    const last10 = cleanPhone.slice(-10);
    const { data: prefByPhone } = await supabase
      .from("contact_instance_preferences")
      .select("instance_id")
      .eq("location_id", locationId)
      .ilike("lead_phone", `%${last10}`)
      .limit(1);

    if (prefByPhone?.length) {
      const { data: inst } = await supabase
        .from("instances")
        .select("id, uazapi_instance_token, uazapi_base_url, user_id")
        .eq("id", prefByPhone[0].instance_id)
        .eq("instance_status", "connected")
        .limit(1);
      if (inst?.length) instance = inst[0];
    }

    // Fallback: any connected instance for this subaccount
    if (!instance) {
      const { data: inst } = await supabase
        .from("instances")
        .select("id, uazapi_instance_token, uazapi_base_url, user_id")
        .eq("subaccount_id", sub.id)
        .eq("instance_status", "connected")
        .limit(1);
      if (inst?.length) instance = inst[0];
    }

    if (!instance) {
      console.error("[ghost-audio] No connected instance found");
      return new Response(JSON.stringify({ error: "No connected instance found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[ghost-audio] Using instance:", instance.id);

    // 4. Resolve base URL
    let baseUrl = instance.uazapi_base_url;
    if (!baseUrl) {
      const { data: settings } = await supabase
        .from("user_settings")
        .select("uazapi_base_url")
        .eq("user_id", instance.user_id)
        .limit(1);
      baseUrl = settings?.[0]?.uazapi_base_url;
    }

    if (!baseUrl) {
      console.error("[ghost-audio] No UAZAPI base URL configured");
      return new Response(JSON.stringify({ error: "No UAZAPI server configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Send audio via UAZAPI
    const token = instance.uazapi_instance_token;
    const mimeType = format || "audio/ogg";
    const dataUri = "data:" + mimeType + ";base64," + audio;

    const attempts = [
      {
        path: "/send/media",
        headers: { "Content-Type": "application/json", token: token },
        body: { number: cleanPhone, type: "myaudio", file: dataUri },
      },
      {
        path: "/send/audio",
        headers: { "Content-Type": "application/json", token: token },
        body: { number: cleanPhone, file: dataUri },
      },
    ];

    let lastStatus = 0;
    let lastBody = "";
    let audioSent = false;
    let uazapiMessageId: string | null = null;

    for (const attempt of attempts) {
      const url = baseUrl + attempt.path;
      console.log("[ghost-audio] Trying:", { url, bodyKeys: Object.keys(attempt.body) });

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: attempt.headers,
          body: JSON.stringify(attempt.body),
        });

        lastStatus = res.status;
        lastBody = await res.text();
        console.log("[ghost-audio] Response:", { status: lastStatus, body: lastBody.substring(0, 500) });

        if (res.ok) {
          console.log("[ghost-audio] ✅ Audio sent successfully via", attempt.path);
          audioSent = true;
          // Extract messageid from response
          try {
            const parsed = JSON.parse(lastBody);
            uazapiMessageId = parsed.messageid || parsed.messageId || parsed.id?.split(":")?.[1] || null;
            console.log("[ghost-audio] Extracted messageid:", uazapiMessageId);
          } catch { /* ignore */ }
          break;
        }
      } catch (e) {
        console.error("[ghost-audio] Fetch error for", attempt.path, ":", e);
      }
    }

    if (!audioSent) {
      console.error("[ghost-audio] All attempts failed. Last:", { status: lastStatus, body: lastBody.substring(0, 300) });
      return new Response(JSON.stringify({ error: "Failed to send audio", lastStatus, lastBody: lastBody.substring(0, 300) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Register UAZAPI message for dedup (prevent webhook-inbound FileDownloaded from re-mirroring)
    if (uazapiMessageId) {
      // Match webhook-inbound dedup format: uazapi:{instanceToken}:{messageId}
      await supabase.from("ghl_processed_messages").upsert(
        { message_id: `uazapi:${token}:${uazapiMessageId}` },
        { onConflict: "message_id" }
      );
      console.log("[ghost-audio] Registered UAZAPI dedup:", `uazapi:${token}:${uazapiMessageId}`);
    }

    // 7. Get public URL from UAZAPI and mirror in GHL
    try {
      let audioUrl: string | null = null;
      if (uazapiMessageId) {
        audioUrl = await getPublicMediaUrl(baseUrl, token, uazapiMessageId);
      }

      // Get user_settings for OAuth credentials
      let { data: settings } = await supabase
        .from("user_settings")
        .select("ghl_client_id, ghl_client_secret")
        .eq("user_id", sub.user_id)
        .limit(1);

      // Fallback to admin OAuth credentials if user doesn't have them
      if (!settings?.[0]?.ghl_client_id) {
        console.log("[ghost-audio] User OAuth credentials not found, trying admin credentials...");
        const { data: adminCreds } = await supabase.rpc("get_admin_oauth_credentials");
        if (adminCreds?.length) {
          settings = [{ ghl_client_id: adminCreds[0].ghl_client_id, ghl_client_secret: adminCreds[0].ghl_client_secret }];
          console.log("[ghost-audio] Using admin OAuth credentials as fallback");
        }
      }

      if (settings?.[0]?.ghl_client_id && sub.ghl_access_token) {
        const ghlToken = await getValidToken(supabase, sub, settings[0]);
        const contactId = await resolveContactId(supabase, cleanPhone, locationId, ghlToken);

        if (contactId) {
          const ghlMessageId = await mirrorAudioInGHL(contactId, ghlToken, audioUrl);

          // Register GHL messageId for dedup (prevent webhook-outbound from re-sending via UAZAPI)
          if (ghlMessageId) {
            await supabase.from("ghl_processed_messages").upsert(
              { message_id: `ghl:${ghlMessageId}` },
              { onConflict: "message_id" }
            );
            console.log("[ghost-audio] Registered GHL dedup:", ghlMessageId);
          }
        } else {
          console.log("[ghost-audio] Contact not found in GHL, skipping mirror");
        }
      } else {
        console.log("[ghost-audio] No GHL OAuth configured, skipping mirror");
      }
    } catch (mirrorErr) {
      // Don't fail the whole request if mirroring fails
      console.error("[ghost-audio] Mirror error (non-fatal):", mirrorErr);
    }

    return new Response(JSON.stringify({ success: true, path: "sent" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[ghost-audio] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
