import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// Retry wrapper for GHL API calls with exponential backoff
async function fetchGHL(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);

      if (res.ok || (res.status >= 400 && res.status < 429) || res.status === 404) {
        return res;
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt === maxRetries) return res;
        const retryAfter = res.headers.get("retry-after");
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(1000 * Math.pow(2, attempt), 8000);
        console.log(`⏳ GHL retry ${attempt + 1}/${maxRetries} after ${delay}ms (status ${res.status})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return res;
    } catch (e) {
      if (attempt === maxRetries) throw e;
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      console.log(`⏳ GHL network retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("fetchGHL: exhausted retries");
}

// Helper function to try multiple API endpoints/formats
async function tryUazapiEndpoints(
  baseUrl: string,
  instanceToken: string,
  attempts: Array<{ path: string; body: Record<string, any> }>
): Promise<{ success: boolean; status: number; body: string }> {
  let lastStatus = 0;
  let lastBody = "";

  for (const attempt of attempts) {
    const url = `${baseUrl}${attempt.path}`;
    console.log("🔄 Trying UAZAPI endpoint:", { url, body: attempt.body });

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "token": instanceToken,
        },
        body: JSON.stringify(attempt.body),
      });

      lastStatus = res.status;
      lastBody = await res.text();
      console.log("📥 UAZAPI response:", { url, status: lastStatus, body: lastBody.substring(0, 300) });

      if (res.ok) {
        return { success: true, status: lastStatus, body: lastBody };
      }
    } catch (e) {
      console.error("❌ Fetch error for", url, e);
      lastBody = e instanceof Error ? e.message : String(e);
    }
  }

  return { success: false, status: lastStatus, body: lastBody };
}

// Helper to get valid access token (refresh if needed)
async function getValidToken(supabase: any, subaccount: any, settings: any): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(subaccount.ghl_token_expires_at);
  const expiresIn1Hour = (expiresAt.getTime() - now.getTime()) < 3600000;

  if (now >= expiresAt || expiresIn1Hour) {
    // Refresh token
    const tokenParams = new URLSearchParams({
      client_id: settings.ghl_client_id,
      client_secret: settings.ghl_client_secret,
      grant_type: "refresh_token",
      refresh_token: subaccount.ghl_refresh_token,
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
      console.error("Token refresh failed:", errorBody.substring(0, 200));
      throw new Error(`Failed to refresh token: ${tokenResponse.status}`);
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

  return subaccount.ghl_access_token;
}

// Get instance and settings for a location, preferring the contact's preferred instance
async function getInstanceForLocation(supabase: any, locationId: string, contactId?: string | null) {
  // Fetch ALL connected instances for this location
  const { data: instances } = await supabase
    .from("instances")
    .select("*, ghl_subaccounts!inner(location_id, user_id, ghl_access_token, ghl_refresh_token, ghl_token_expires_at)")
    .eq("ghl_subaccounts.location_id", locationId)
    .eq("instance_status", "connected");

  if (!instances || instances.length === 0) {
    console.log("⚠️ No connected instance found for location:", locationId);
    return null;
  }

  let instance = instances[0]; // default to first

  // If multiple instances and we have a contactId, use contact preference
  if (instances.length > 1 && contactId) {
    // Look up the contact's phone to match against preferences
    const { data: phoneMapping } = await supabase
      .from("ghl_contact_phone_mapping")
      .select("original_phone")
      .eq("contact_id", contactId)
      .maybeSingle();

    const leadPhone = phoneMapping?.original_phone?.replace(/\D/g, "")?.slice(-10) || null;

    if (leadPhone) {
      // Find preference by phone (most reliable, matches webhook-outbound logic)
      const { data: pref } = await supabase
        .from("contact_instance_preferences")
        .select("instance_id")
        .eq("location_id", locationId)
        .ilike("lead_phone", `%${leadPhone}`)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pref?.instance_id) {
        const matched = instances.find((i: any) => i.id === pref.instance_id);
        if (matched) {
          instance = matched;
          console.log("📌 Using preferred instance by phone:", { instanceId: instance.id, instanceName: instance.instance_name, leadPhone });
        }
      }
    }

    // Fallback: try by contact_id preference
    if (instance === instances[0] && instance.id !== instances[0]?.id) {
      // already matched above
    } else if (instance === instances[0]) {
      const { data: pref } = await supabase
        .from("contact_instance_preferences")
        .select("instance_id")
        .eq("location_id", locationId)
        .eq("contact_id", contactId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pref?.instance_id) {
        const matched = instances.find((i: any) => i.id === pref.instance_id);
        if (matched) {
          instance = matched;
          console.log("📌 Using preferred instance by contactId:", { instanceId: instance.id, instanceName: instance.instance_name });
        }
      }
    }

    if (instance === instances[0]) {
      console.log("⚠️ Multiple instances found but no preference match, using first:", { instanceId: instance.id, instanceName: instance.instance_name });
    }
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("uazapi_base_url, ghl_client_id, ghl_client_secret")
    .eq("user_id", instance.ghl_subaccounts.user_id)
    .maybeSingle();

  // Fallback to admin OAuth credentials if user doesn't have their own
  if (settings && (!settings.ghl_client_id || !settings.ghl_client_secret)) {
    console.log("User OAuth credentials not found, trying admin credentials...");
    const { data: adminCreds } = await supabase.rpc("get_admin_oauth_credentials");
    if (adminCreds?.[0]?.ghl_client_id && adminCreds?.[0]?.ghl_client_secret) {
      settings.ghl_client_id = adminCreds[0].ghl_client_id;
      settings.ghl_client_secret = adminCreds[0].ghl_client_secret;
      console.log("Using admin OAuth credentials as fallback");
    }
  }

  // Per-instance base URL takes priority over global settings
  const resolvedBaseUrl = instance.uazapi_base_url || settings?.uazapi_base_url;

  if (!resolvedBaseUrl) {
    console.log("⚠️ No UAZAPI base URL configured for instance or user");
    return null;
  }

  return {
    instance,
    subaccount: instance.ghl_subaccounts,
    settings,
    baseUrl: resolvedBaseUrl,
    token: instance.uazapi_instance_token,
    ghlUserId: instance.ghl_user_id,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { action } = body;

    console.log("📨 map-messages received:", { action, ...body });

    // Action: map - Save message mapping
    if (action === "map" || !action) {
      const { ghl_id, uazapi_id, text, timestamp, location_id, contact_id, from_me, message_type } = body;

      if (!ghl_id || !location_id) {
        return new Response(
          JSON.stringify({ error: "ghl_id and location_id are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from("message_map")
        .upsert({
          ghl_message_id: ghl_id,
          uazapi_message_id: uazapi_id || null,
          location_id,
          contact_id: contact_id || null,
          message_text: text || null,
          message_type: message_type || "text",
          from_me: from_me ?? false,
          original_timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
        }, { onConflict: "ghl_message_id" })
        .select()
        .single();

      if (error) {
        console.error("Failed to save message mapping:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: edit - Edit a message (with 15-minute validation)
    if (action === "edit") {
      const { ghl_id, new_text, ghl_user_id } = body;

      if (!ghl_id || !new_text) {
        return new Response(
          JSON.stringify({ error: "ghl_id and new_text are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the message mapping
      const { data: mapping, error: fetchError } = await supabase
        .from("message_map")
        .select("*")
        .eq("ghl_message_id", ghl_id)
        .maybeSingle();

      if (fetchError || !mapping) {
        console.log("❌ Message not found:", ghl_id);
        return new Response(
          JSON.stringify({ error: "Message not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate 15-minute rule
      const originalTime = new Date(mapping.original_timestamp);
      const now = new Date();
      const diffMinutes = (now.getTime() - originalTime.getTime()) / (1000 * 60);

      if (diffMinutes > 15) {
        return new Response(
          JSON.stringify({ error: "Cannot edit message older than 15 minutes", age_minutes: diffMinutes }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let uazapiSuccess = false;
      let ghlInternalCommentSent = false;
      const originalText = mapping.message_text || '(texto original)';

      // Get config for this location
      const config = await getInstanceForLocation(supabase, mapping.location_id, mapping.contact_id);

      // If we have UAZAPI ID, send edit to WhatsApp
      if (mapping.uazapi_message_id && config) {
        console.log("✏️ Edit payload:", { id: mapping.uazapi_message_id, text: new_text });
        
        // UAZAPI exact format: POST /message/edit with { id, text }
        const result = await tryUazapiEndpoints(config.baseUrl, config.token, [
          { path: "/message/edit", body: { id: mapping.uazapi_message_id, text: new_text } },
        ]);

        uazapiSuccess = result.success;
        if (!result.success) {
          console.error("❌ All edit attempts failed:", result.status, result.body);
          return new Response(
            JSON.stringify({ error: "Failed to edit on WhatsApp", details: result.body }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Mark this edit as already handled (InternalComment will be sent below)
        // so webhook-inbound doesn't send a duplicate InternalComment when it
        // receives the UAZAPI echo for this edit.
        if (mapping.uazapi_message_id) {
          const editIcKey = `edit-ic:${mapping.uazapi_message_id}`;
          console.log("🔒 Marking edit as handled to prevent duplicate IC:", editIcKey);
          await supabase.from("ghl_processed_messages").insert({ message_id: editIcKey }).maybeSingle();
        }
      }

      // Update message in database
      const { data: updated, error: updateError } = await supabase
        .from("message_map")
        .update({
          message_text: new_text,
          is_edited: true,
        })
        .eq("ghl_message_id", ghl_id)
        .select()
        .single();

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Send InternalComment to GHL with formatted edit message
      if (config?.subaccount && config?.settings?.ghl_client_id && mapping.contact_id) {
        try {
          const ghlToken = await getValidToken(supabase, config.subaccount, config.settings);
          
          // Format: ✏️ Editado: "texto original" → novo texto
          const formattedEditMessage = `✏️ Editado: "${originalText}"\n\n${new_text}`;
          
          // Build request body with optional userId for attribution
          const requestBody: Record<string, string> = {
            type: "InternalComment",
            contactId: mapping.contact_id,
            message: formattedEditMessage,
          };
          
          // Priority: ghl_user_id from request (actual user editing) > instance's ghl_user_id (fallback)
          const effectiveUserId = ghl_user_id || config.ghlUserId;
          if (effectiveUserId) {
            requestBody.userId = effectiveUserId;
          }
          
          console.log("📝 Sending edit InternalComment to GHL:", {
            contactId: mapping.contact_id,
            userId: effectiveUserId || "(not assigned)",
            userIdSource: ghl_user_id ? "from_request" : (config.ghlUserId ? "from_instance" : "none"),
            originalText: originalText?.substring(0, 30),
            newText: new_text?.substring(0, 30),
          });
          
          const response = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${ghlToken}`,
              "Version": "2021-04-15",
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify(requestBody),
          });
          
          const responseText = await response.text();
          if (!response.ok) {
            console.error("Failed to send InternalComment to GHL:", responseText);
          } else {
            console.log("✅ InternalComment sent to GHL:", responseText.substring(0, 200));
            ghlInternalCommentSent = true;
          }
        } catch (e) {
          console.error("Error sending InternalComment:", e);
        }
      }

      // Broadcast update via realtime (for any UI that might want to react)
      await supabase.channel("ghl_updates").send({
        type: "broadcast",
        event: "msg_update",
        payload: { 
          ghl_id, 
          type: "edit", 
          new_text, 
          original_text: originalText,
          location_id: mapping.location_id,
          fromMe: true,
        },
      });

      return new Response(
        JSON.stringify({ success: true, data: updated, whatsapp_sent: uazapiSuccess, ghl_internal_comment: ghlInternalCommentSent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: react - Add reaction to message
    if (action === "react") {
      const { ghl_id, emoji } = body;

      if (!ghl_id || !emoji) {
        return new Response(
          JSON.stringify({ error: "ghl_id and emoji are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the message mapping
      const { data: mapping, error: fetchError } = await supabase
        .from("message_map")
        .select("*")
        .eq("ghl_message_id", ghl_id)
        .maybeSingle();

      if (fetchError || !mapping) {
        console.log("❌ Message not found:", ghl_id);
        return new Response(
          JSON.stringify({ error: "Message not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let uazapiSuccess = false;

      // Send reaction to UAZAPI if we have the ID
      if (mapping.uazapi_message_id) {
        const config = await getInstanceForLocation(supabase, mapping.location_id, mapping.contact_id);

        if (config) {
          // Need to get the contact's phone number to build the WhatsApp JID
          let contactPhone = "";
          
          if (mapping.contact_id) {
            // Try to get phone from contact_instance_preferences or ghl_contact_phone_mapping
            const { data: phoneMapping } = await supabase
              .from("ghl_contact_phone_mapping")
              .select("original_phone")
              .eq("contact_id", mapping.contact_id)
              .maybeSingle();
            
            if (phoneMapping?.original_phone) {
              contactPhone = phoneMapping.original_phone.replace(/\D/g, "");
            }
          }

          // Build the WhatsApp JID (number@s.whatsapp.net)
          const whatsappJid = contactPhone ? `${contactPhone}@s.whatsapp.net` : "";
          
          console.log("📱 React payload:", { 
            number: whatsappJid, 
            text: emoji, 
            id: mapping.uazapi_message_id,
            contact_id: mapping.contact_id 
          });

          // UAZAPI format: POST /message/react with { number, text (emoji), id }
          const result = await tryUazapiEndpoints(config.baseUrl, config.token, [
            // Exact UAZAPI format from user documentation
            { path: "/message/react", body: { number: whatsappJid, text: emoji, id: mapping.uazapi_message_id } },
            // Try without JID suffix if needed
            { path: "/message/react", body: { number: contactPhone, text: emoji, id: mapping.uazapi_message_id } },
          ]);

          uazapiSuccess = result.success;
          if (!result.success) {
            console.error("❌ React failed:", result.status, result.body);
            return new Response(
              JSON.stringify({ error: "Failed to react on WhatsApp", details: result.body }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      // Update reactions in database - REPLACE (not accumulate)
      // Since this is from the CRM user reacting, we replace the reaction with the new emoji
      // If they want to remove the reaction, they can use an empty string or specific action
      const updatedReactions = [emoji];

      const { data: updated, error: updateError } = await supabase
        .from("message_map")
        .update({ reactions: updatedReactions })
        .eq("ghl_message_id", ghl_id)
        .select()
        .single();

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Broadcast reaction
      await supabase.channel("ghl_updates").send({
        type: "broadcast",
        event: "msg_update",
        payload: { ghl_id, type: "react", emoji, location_id: mapping.location_id },
      });

      return new Response(
        JSON.stringify({ success: true, data: updated, whatsapp_sent: uazapiSuccess }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: delete - Mark message as deleted
    if (action === "delete") {
      const { ghl_id, from_me, ghl_user_id } = body;

      if (!ghl_id) {
        return new Response(
          JSON.stringify({ error: "ghl_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the message mapping
      const { data: mapping, error: fetchError } = await supabase
        .from("message_map")
        .select("*")
        .eq("ghl_message_id", ghl_id)
        .maybeSingle();

      if (fetchError || !mapping) {
        console.log("❌ Message not found:", ghl_id);
        return new Response(
          JSON.stringify({ error: "Message not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let uazapiSuccess = false;
      let config: Awaited<ReturnType<typeof getInstanceForLocation>> = null;

      // Send delete to UAZAPI if we have the ID and it's from_me
      if (mapping.uazapi_message_id && from_me) {
        config = await getInstanceForLocation(supabase, mapping.location_id, mapping.contact_id);

        if (config) {
          // Try multiple endpoint formats for delete
          const result = await tryUazapiEndpoints(config.baseUrl, config.token, [
            // UAZAPI style
            { path: "/message/delete", body: { id: mapping.uazapi_message_id, fromMe: true } },
            { path: "/chat/delete", body: { Id: mapping.uazapi_message_id, FromMe: true } },
            { path: "/chat/delete", body: { messageId: mapping.uazapi_message_id, fromMe: true } },
            // Evolution style
            { path: "/message/delete", body: { key: { id: mapping.uazapi_message_id, fromMe: true } } },
          ]);

          uazapiSuccess = result.success;
          if (!result.success) {
            console.error("❌ All delete attempts failed:", result.status, result.body);
            // For delete, we still mark as deleted in DB even if WhatsApp fails
          }
        }
      }

      // Mark as deleted in database
      const { data: updated, error: updateError } = await supabase
        .from("message_map")
        .update({ is_deleted: true })
        .eq("ghl_message_id", ghl_id)
        .select()
        .single();

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Send InternalComment to GHL with deletion notice (like we do for edits/replies)
      let ghlInternalCommentSent = false;
      const originalText = mapping.message_text || '(mensagem)';
      
      // Get config if we don't have it yet
      if (!config) {
        config = await getInstanceForLocation(supabase, mapping.location_id, mapping.contact_id);
      }
      
      if (config?.subaccount && config?.settings?.ghl_client_id && mapping.contact_id) {
        try {
          const ghlToken = await getValidToken(supabase, config.subaccount, config.settings);
          
          // Format: 🗑️ Mensagem apagada: "texto original"
          const formattedDeleteMessage = `🗑️ Mensagem apagada: "${originalText.substring(0, 150)}${originalText.length > 150 ? '...' : ''}"`;
          
          // Build request body with optional userId for attribution
          const requestBody: Record<string, string> = {
            type: "InternalComment",
            contactId: mapping.contact_id,
            message: formattedDeleteMessage,
          };
          
          // Priority: ghl_user_id from request > instance's ghl_user_id (fallback)
          const effectiveUserId = ghl_user_id || config.ghlUserId;
          if (effectiveUserId) {
            requestBody.userId = effectiveUserId;
          }
          
          console.log("📝 Sending delete InternalComment to GHL:", {
            contactId: mapping.contact_id,
            userId: effectiveUserId || "(not assigned)",
            originalText: originalText?.substring(0, 30),
          });
          
          const response = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${ghlToken}`,
              "Version": "2021-04-15",
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify(requestBody),
          });
          
          const responseText = await response.text();
          if (!response.ok) {
            console.error("Failed to send delete InternalComment to GHL:", responseText);
          } else {
            console.log("✅ Delete InternalComment sent to GHL:", responseText.substring(0, 200));
            ghlInternalCommentSent = true;
          }
        } catch (e) {
          console.error("Error sending delete InternalComment:", e);
        }
      }

      // No broadcast needed - we use InternalComment instead of overlay now

      return new Response(
        JSON.stringify({ 
          success: true, 
          data: updated, 
          whatsapp_sent: uazapiSuccess,
          ghl_internal_comment: ghlInternalCommentSent
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: reply - Send a reply message with quoted context
    if (action === "reply") {
      const { ghl_id, text, contact_phone, location_id, ghl_user_id } = body;

      if (!ghl_id || !text || !location_id) {
        return new Response(
          JSON.stringify({ error: "ghl_id, text and location_id are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the original message mapping to get the UAZAPI message ID
      const { data: mapping, error: fetchError } = await supabase
        .from("message_map")
        .select("*")
        .eq("ghl_message_id", ghl_id)
        .maybeSingle();

      if (fetchError) {
        console.error("❌ Error fetching mapping:", fetchError);
        return new Response(
          JSON.stringify({ error: fetchError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!mapping?.uazapi_message_id) {
        console.log("❌ Message not mapped or missing UAZAPI ID:", ghl_id);
        return new Response(
          JSON.stringify({ error: "Message not found or not mapped to WhatsApp" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get instance configuration for this location
      const config = await getInstanceForLocation(supabase, location_id, mapping?.contact_id);

      if (!config) {
        return new Response(
          JSON.stringify({ error: "No connected instance found for this location" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Build the phone number - try from mapping first, then from request
      let phoneNumber = contact_phone;
      
      if (!phoneNumber && mapping.contact_id) {
        const { data: phoneMapping } = await supabase
          .from("ghl_contact_phone_mapping")
          .select("original_phone")
          .eq("contact_id", mapping.contact_id)
          .maybeSingle();
        
        if (phoneMapping?.original_phone) {
          phoneNumber = phoneMapping.original_phone.replace(/\D/g, "");
        }
      }

      if (!phoneNumber) {
        return new Response(
          JSON.stringify({ error: "Could not determine phone number for reply" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("↩️ Reply payload:", { 
        number: phoneNumber, 
        text, 
        replyid: mapping.uazapi_message_id 
      });

      // Send reply using /send/text with replyid
      const result = await tryUazapiEndpoints(config.baseUrl, config.token, [
        { 
          path: "/send/text", 
          body: { 
            number: phoneNumber, 
            text: text, 
            replyid: mapping.uazapi_message_id 
          } 
        },
      ]);

      if (!result.success) {
        console.error("❌ Reply failed:", result.status, result.body);
        return new Response(
          JSON.stringify({ error: "Failed to send reply on WhatsApp", details: result.body }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parse the response to get the new message ID and quoted message info
      let newMessageId = null;
      let uazapiQuotedMessage: Record<string, unknown> | null = null;
      try {
        const responseData = JSON.parse(result.body);
        newMessageId = responseData.key?.id || responseData.messageId || responseData.id;
        // Extract quotedMessage from UAZAPI response for media type detection
        uazapiQuotedMessage = responseData.content?.contextInfo?.quotedMessage || null;
      } catch (e) {
        console.log("⚠️ Could not parse reply response for message ID");
      }

      // Send InternalComment to GHL with reply context (like we do for edits)
      let ghlInternalCommentSent = false;
      // Generate friendly label for media types when message_text is empty
      let originalText = mapping.message_text || '';
      if (!originalText) {
        const mType = (mapping.message_type || '').toLowerCase();
        if (mType.includes('audio') || mType.includes('ptt')) {
          originalText = 'Áudio';
        } else if (mType.includes('image')) {
          originalText = 'Imagem';
        } else if (mType.includes('video')) {
          originalText = 'Vídeo';
        } else if (mType.includes('document')) {
          originalText = 'Documento';
        } else if (mType.includes('sticker')) {
          originalText = 'Figurinha';
        } else if (mType.includes('contact')) {
          originalText = 'Contato';
        } else if (mType.includes('location')) {
          originalText = 'Localização';
        } else if (mType === 'media' && uazapiQuotedMessage) {
          // Fallback: detect from UAZAPI response quotedMessage for legacy "media" entries
          if (uazapiQuotedMessage.audioMessage) {
            originalText = 'Áudio';
          } else if (uazapiQuotedMessage.imageMessage) {
            originalText = 'Imagem';
          } else if (uazapiQuotedMessage.videoMessage) {
            originalText = 'Vídeo';
          } else if (uazapiQuotedMessage.documentMessage) {
            originalText = 'Documento';
          } else if (uazapiQuotedMessage.stickerMessage) {
            originalText = 'Figurinha';
          } else {
            originalText = 'Mídia';
          }
        } else {
          originalText = 'Mídia';
        }
      }
      
      if (config?.subaccount && config?.settings?.ghl_client_id && mapping.contact_id) {
        try {
          const ghlToken = await getValidToken(supabase, config.subaccount, config.settings);
          
          // Format: ↩️ Respondendo a: "texto original" \n\n texto da resposta
          const formattedReplyMessage = `↩️ Respondendo a: "${originalText.substring(0, 100)}${originalText.length > 100 ? '...' : ''}"\n\n${text}`;
          
          // Build request body with optional userId for attribution
          const requestBody: Record<string, string> = {
            type: "InternalComment",
            contactId: mapping.contact_id,
            message: formattedReplyMessage,
          };
          
          // Priority: ghl_user_id from request > instance's ghl_user_id (fallback)
          const effectiveUserId = ghl_user_id || config.ghlUserId;
          if (effectiveUserId) {
            requestBody.userId = effectiveUserId;
          }
          
          console.log("📝 Sending reply InternalComment to GHL:", {
            contactId: mapping.contact_id,
            userId: effectiveUserId || "(not assigned)",
            originalText: originalText?.substring(0, 30),
            replyText: text?.substring(0, 30),
          });
          
          const response = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${ghlToken}`,
              "Version": "2021-04-15",
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify(requestBody),
          });
          
          const responseText = await response.text();
          if (!response.ok) {
            console.error("Failed to send reply InternalComment to GHL:", responseText);
          } else {
            console.log("✅ Reply InternalComment sent to GHL:", responseText.substring(0, 200));
            ghlInternalCommentSent = true;
          }
        } catch (e) {
          console.error("Error sending reply InternalComment:", e);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          whatsapp_sent: true,
          new_message_id: newMessageId,
          ghl_internal_comment: ghlInternalCommentSent
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: lookup - Get mapping by UAZAPI ID (for webhook processing)
    if (action === "lookup") {
      const { uazapi_id, ghl_id } = body;

      let query = supabase.from("message_map").select("*");
      
      if (uazapi_id) {
        query = query.eq("uazapi_message_id", uazapi_id);
      } else if (ghl_id) {
        query = query.eq("ghl_message_id", ghl_id);
      } else {
        return new Response(
          JSON.stringify({ error: "uazapi_id or ghl_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: list-states - Get all modified message states for a location (for page load persistence)
    if (action === "list-states") {
      const { location_id, ghl_ids } = body;

      if (!location_id && !ghl_ids) {
        return new Response(
          JSON.stringify({ error: "location_id or ghl_ids is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let query = supabase
        .from("message_map")
        .select("ghl_message_id, message_text, is_deleted, is_edited, reactions, from_me")
        .or("is_deleted.eq.true,is_edited.eq.true,reactions.neq.null");

      if (location_id) {
        query = query.eq("location_id", location_id);
      }

      if (ghl_ids && Array.isArray(ghl_ids) && ghl_ids.length > 0) {
        query = query.in("ghl_message_id", ghl_ids);
      }

      // Limit to last 100 modified messages to avoid large payloads
      query = query.order("updated_at", { ascending: false }).limit(100);

      const { data, error } = await query;

      if (error) {
        console.error("Failed to list message states:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Transform to a more efficient format for the frontend
      const states = (data || []).map(row => ({
        ghl_id: row.ghl_message_id,
        text: row.message_text,
        is_deleted: row.is_deleted || false,
        is_edited: row.is_edited || false,
        reactions: row.reactions || [],
        from_me: row.from_me || false,
      }));

      return new Response(
        JSON.stringify({ success: true, states }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Error in map-messages:", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});