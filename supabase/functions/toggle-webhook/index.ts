import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instance_id, webhook_id, enabled } = await req.json();
    if (!instance_id || !webhook_id || typeof enabled !== "boolean") {
      return new Response(JSON.stringify({ error: "instance_id, webhook_id and enabled (boolean) required" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: instance, error } = await supabase
      .from("instances")
      .select("*")
      .eq("id", instance_id)
      .single();

    if (error || !instance) {
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("user_settings")
      .select("uazapi_base_url")
      .eq("user_id", instance.user_id)
      .single();

    const baseUrl = (instance.uazapi_base_url || settings?.uazapi_base_url || "").replace(/\/$/, "");
    const token = instance.uazapi_instance_token;

    // Step 1: Fetch current webhook data to get full object
    let currentWebhook: any = null;
    try {
      const listRes = await fetch(`${baseUrl}/webhook`, {
        method: "GET",
        headers: { "Content-Type": "application/json", "Token": token },
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        const webhooks = Array.isArray(listData) ? listData : (listData.webhooks || []);
        currentWebhook = webhooks.find((w: any) => w.id === webhook_id || w._id === webhook_id);
      }
    } catch (e) {
      console.log("Failed to fetch webhooks for pre-read:", e);
    }

    if (!currentWebhook) {
      // Try with lowercase token
      try {
        const listRes = await fetch(`${baseUrl}/webhook`, {
          method: "GET",
          headers: { "Content-Type": "application/json", "token": token },
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          const webhooks = Array.isArray(listData) ? listData : (listData.webhooks || []);
          currentWebhook = webhooks.find((w: any) => w.id === webhook_id || w._id === webhook_id);
        }
      } catch (e) {
        console.log("Failed to fetch webhooks (lowercase token):", e);
      }
    }

    // Build full payload with all existing fields + toggled enabled
    const fullPayload = currentWebhook
      ? { ...currentWebhook, enabled, action: "update" }
      : { action: "update", id: webhook_id, enabled };

    console.log(`Toggle payload: ${JSON.stringify(fullPayload).substring(0, 500)}`);

    // Step 2: Send update with full object
    const attempts = [
      { headers: { "Token": token } },
      { headers: { "token": token } },
    ];

    let success = false;
    let lastError = "";

    for (const attempt of attempts) {
      try {
        const res = await fetch(`${baseUrl}/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...attempt.headers },
          body: JSON.stringify(fullPayload),
        });
        const resText = await res.text();
        console.log(`Toggle response: ${res.status} - ${resText.substring(0, 500)}`);

        if (res.ok) {
          // Verify the change actually took effect
          try {
            const parsed = JSON.parse(resText);
            const resultWebhooks = Array.isArray(parsed) ? parsed : (parsed.webhooks || [parsed]);
            const updated = resultWebhooks.find((w: any) => (w.id === webhook_id || w._id === webhook_id));
            if (updated && updated.enabled === enabled) {
              success = true;
              console.log(`✅ Webhook ${webhook_id} confirmed toggled to enabled=${enabled}`);
              break;
            } else if (updated) {
              console.log(`⚠️ Response OK but enabled=${updated.enabled}, expected=${enabled}`);
              lastError = `Webhook not updated: enabled is still ${updated.enabled}`;
              continue;
            }
          } catch {
            // Can't parse, assume success if 200
            success = true;
            break;
          }
        }
        if (res.status === 404 || res.status === 405) continue;
        lastError = `${res.status}: ${resText.substring(0, 200)}`;
      } catch (e: any) {
        lastError = e.message;
        continue;
      }
    }

    if (!success) {
      return new Response(JSON.stringify({ error: `Não foi possível alterar o webhook: ${lastError}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, enabled }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
