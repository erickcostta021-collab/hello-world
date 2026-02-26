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

    const { data: settings } = await supabase
      .from("user_settings")
      .select("uazapi_base_url")
      .eq("user_id", instance.user_id)
      .single();

    const baseUrl = (instance.uazapi_base_url || settings?.uazapi_base_url || "").replace(/\/$/, "");
    if (!baseUrl) {
      return new Response(JSON.stringify({ error: "No UAZAPI base URL configured", webhooks: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = instance.uazapi_instance_token;

    // Try multiple endpoints to list webhooks
    const listAttempts = [
      { path: "/webhook", method: "GET", headers: { "Token": token } },
      { path: "/webhook", method: "GET", headers: { "token": token } },
      { path: "/webhooks", method: "GET", headers: { "Token": token } },
      { path: "/webhooks", method: "GET", headers: { "token": token } },
      { path: "/instance/webhook", method: "GET", headers: { "token": token } },
      { path: "/instance/settings", method: "GET", headers: { "token": token } },
    ];

    for (const { path, method, headers: attemptHeaders } of listAttempts) {
      try {
        const url = `${baseUrl}${path}`;
        console.log(`Trying to list webhooks: ${method} ${url}`);
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json", ...attemptHeaders },
        });

        if (!res.ok) continue;

        const resText = await res.text();
        console.log(`Response from ${method} ${path}: ${res.status} - ${resText.substring(0, 1000)}`);

        try {
          const parsed = JSON.parse(resText);

          // Normalize response into an array of webhooks
          let webhooks: any[] = [];

          if (Array.isArray(parsed)) {
            webhooks = parsed;
          } else if (parsed.webhooks && Array.isArray(parsed.webhooks)) {
            webhooks = parsed.webhooks;
          } else if (parsed.url || parsed.webhookURL || parsed.webhook_url) {
            // Single webhook object
            webhooks = [parsed];
          } else if (parsed.webhook && typeof parsed.webhook === "object") {
            webhooks = Array.isArray(parsed.webhook) ? parsed.webhook : [parsed.webhook];
          }

          // Normalize each webhook object and filter out "deleted" ones (empty URL)
          const normalized = webhooks
            .map((w: any, idx: number) => ({
              id: w.id || w._id || `webhook-${idx}`,
              url: w.url || w.webhookURL || w.webhook_url || w.webhook || "",
              enabled: w.enabled !== false,
              events: w.events || w.listen_events || [],
              addUrlEvents: w.addUrlEvents ?? false,
              addUrlTypesMessages: w.addUrlTypesMessages ?? false,
              excludeMessages: w.excludeMessages || w.exclude_messages || "",
            }))
            .filter((w: any) => w.url && w.url.trim() !== "");

          if (normalized.length > 0 || path === "/webhook") {
            return new Response(JSON.stringify({ webhooks: normalized }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch {
          continue;
        }
      } catch (e: any) {
        console.error(`Error trying ${method} ${path}:`, e.message);
        continue;
      }
    }

    // No webhooks found
    return new Response(JSON.stringify({ webhooks: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, webhooks: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});