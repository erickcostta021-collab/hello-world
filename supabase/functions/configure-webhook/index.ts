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
    const { instance_id } = await req.json();
    if (!instance_id) {
      return new Response(JSON.stringify({ error: "instance_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch instance
    const { data: instance, error } = await supabase
      .from("instances")
      .select("*")
      .eq("id", instance_id)
      .single();

    if (error || !instance) {
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user settings for global base URL fallback
    const { data: settings } = await supabase
      .from("user_settings")
      .select("uazapi_base_url")
      .eq("user_id", instance.user_id)
      .single();

    const baseUrl = (instance.uazapi_base_url || settings?.uazapi_base_url || "").replace(/\/$/, "");
    if (!baseUrl) {
      return new Response(JSON.stringify({ error: "No UAZAPI base URL configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookUrl = instance.webhook_url || `${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook-inbound`;
    const ignoreGroups = instance.ignore_groups ?? false;

    // Try multiple endpoints, methods, and payload formats (UAZAPI versions differ)
    const attempts = [
      // Try with "url" field (some versions expect this)
      { path: "/instance/webhook", method: "PUT", payload: { url: webhookUrl, ignore_groups: ignoreGroups } },
      { path: "/instance/webhook", method: "POST", payload: { url: webhookUrl, ignore_groups: ignoreGroups } },
      // Try with "webhook" field 
      { path: "/instance/webhook", method: "PUT", payload: { webhook: webhookUrl, ignore_groups: ignoreGroups } },
      { path: "/instance/webhook", method: "POST", payload: { webhook: webhookUrl, ignore_groups: ignoreGroups } },
      // Try settings endpoint
      { path: "/instance/settings", method: "PUT", payload: { webhook_url: webhookUrl, ignore_groups: ignoreGroups } },
      { path: "/instance/settings", method: "POST", payload: { webhook_url: webhookUrl, ignore_groups: ignoreGroups } },
      { path: "/instance/settings", method: "PATCH", payload: { webhook_url: webhookUrl, ignore_groups: ignoreGroups } },
      // Standard webhook_url field
      { path: "/instance/webhook", method: "PUT", payload: { webhook_url: webhookUrl, ignore_groups: ignoreGroups } },
      { path: "/instance/webhook", method: "POST", payload: { webhook_url: webhookUrl, ignore_groups: ignoreGroups } },
      { path: "/webhook/set", method: "PUT", payload: { webhook_url: webhookUrl } },
      { path: "/webhook/set", method: "POST", payload: { webhook_url: webhookUrl } },
    ];

    let success = false;
    let lastError = "";

    for (const { path, method, payload } of attempts) {
      try {
        const url = `${baseUrl}${path}`;
        console.log(`Trying webhook config: ${method} ${url}`, JSON.stringify(payload));
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "token": instance.uazapi_instance_token,
          },
          body: JSON.stringify(payload),
        });

        const resText = await res.text();
        console.log(`Response from ${method} ${path}: ${res.status} - ${resText.substring(0, 300)}`);

        if (res.ok || res.status === 200) {
          success = true;
          console.log(`✅ Webhook configured via ${method} ${path}:`, { baseUrl, webhookUrl });
          break;
        }
        if (res.status === 404 || res.status === 405) continue;

        lastError = `${res.status}: ${resText.substring(0, 200)}`;
      } catch (e: any) {
        console.error(`Error trying ${method} ${path}:`, e.message);
        lastError = e.message || String(e);
        continue;
      }
    }

    if (!success) {
      return new Response(JSON.stringify({ error: `Failed to configure webhook: ${lastError}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, webhook_url: webhookUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
