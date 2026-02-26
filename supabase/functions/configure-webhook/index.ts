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
    const { instance_id, webhook_events } = await req.json();
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
    // Build events array for UAZAPI — defaults to ["messages"] if not specified
    const events = Array.isArray(webhook_events) && webhook_events.length > 0 ? webhook_events : ["messages"];

    // Try multiple endpoints, methods, and payload formats (UAZAPI versions differ)
    const token = instance.uazapi_instance_token;

    // Helper: check if response body confirms webhook was actually set
    function webhookActuallySet(resText: string, targetUrl: string): boolean {
      try {
        const parsed = JSON.parse(resText);
        // WuzAPI returns array — check if url was set
        if (Array.isArray(parsed)) {
          return parsed.some((w: any) => w.url === targetUrl || w.webhookURL === targetUrl);
        }
        // Object response — check common fields
        if (parsed.url === targetUrl || parsed.webhookURL === targetUrl || parsed.webhook_url === targetUrl) return true;
        if (parsed.success === true || parsed.status === "ok" || parsed.message?.toLowerCase().includes("success")) return true;
        // If enabled is explicitly false and url is empty, it was NOT set
        if (parsed.enabled === false && (!parsed.url || parsed.url === "")) return false;
        // Generic 200 with no url field — assume success
        return true;
      } catch {
        return true; // Can't parse — assume 200 means success
      }
    }

    const attempts = [
      // WuzAPI format: POST /webhook with url + enabled + events
      { path: "/webhook", method: "POST", payload: { url: webhookUrl, enabled: true, events }, headers: { "Token": token } },
      { path: "/webhook", method: "POST", payload: { url: webhookUrl, enabled: true, events }, headers: { "token": token } },
      // WuzAPI with webhookURL key
      { path: "/webhook", method: "POST", payload: { webhookURL: webhookUrl, enabled: true, events }, headers: { "Token": token } },
      { path: "/webhook", method: "PUT", payload: { url: webhookUrl, enabled: true, events }, headers: { "Token": token } },
      { path: "/webhook", method: "PUT", payload: { url: webhookUrl, enabled: true, events }, headers: { "token": token } },
      // Instance webhook endpoints (other UAZAPI versions)
      { path: "/instance/webhook", method: "PUT", payload: { url: webhookUrl, ignore_groups: ignoreGroups, events }, headers: { "token": token } },
      { path: "/instance/webhook", method: "POST", payload: { url: webhookUrl, ignore_groups: ignoreGroups, events }, headers: { "token": token } },
      { path: "/instance/webhook", method: "PUT", payload: { webhook: webhookUrl, ignore_groups: ignoreGroups, events }, headers: { "token": token } },
      { path: "/instance/webhook", method: "POST", payload: { webhook: webhookUrl, ignore_groups: ignoreGroups, events }, headers: { "token": token } },
      // Settings endpoint
      { path: "/instance/settings", method: "PUT", payload: { webhook_url: webhookUrl, ignore_groups: ignoreGroups, events }, headers: { "token": token } },
      { path: "/instance/settings", method: "POST", payload: { webhook_url: webhookUrl, ignore_groups: ignoreGroups, events }, headers: { "token": token } },
      { path: "/instance/settings", method: "PATCH", payload: { webhook_url: webhookUrl, ignore_groups: ignoreGroups, events }, headers: { "token": token } },
      // webhook_url field variants
      { path: "/instance/webhook", method: "PUT", payload: { webhook_url: webhookUrl, ignore_groups: ignoreGroups, events }, headers: { "token": token } },
      { path: "/instance/webhook", method: "POST", payload: { webhook_url: webhookUrl, ignore_groups: ignoreGroups, events }, headers: { "token": token } },
      { path: "/webhook/set", method: "PUT", payload: { webhook_url: webhookUrl, events }, headers: { "token": token } },
      { path: "/webhook/set", method: "POST", payload: { webhook_url: webhookUrl, events }, headers: { "token": token } },
    ];

    let success = false;
    let lastError = "";

    for (const { path, method, payload, headers: attemptHeaders } of attempts) {
      try {
        const url = `${baseUrl}${path}`;
        console.log(`Trying webhook config: ${method} ${url}`, JSON.stringify(payload));
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...attemptHeaders,
          },
          body: JSON.stringify(payload),
        });

        const resText = await res.text();
        console.log(`Response from ${method} ${path}: ${res.status} - ${resText.substring(0, 500)}`);

        if (res.ok || res.status === 200) {
          // Validate that the webhook was actually applied
          if (webhookActuallySet(resText, webhookUrl)) {
            success = true;
            console.log(`✅ Webhook configured via ${method} ${path}:`, { baseUrl, webhookUrl });
            break;
          } else {
            console.log(`⚠️ Got 200 from ${method} ${path} but webhook not actually set, trying next...`);
            lastError = `${method} ${path} returned 200 but webhook not applied`;
            continue;
          }
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
