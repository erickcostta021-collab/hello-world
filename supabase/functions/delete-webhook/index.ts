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
    const { instance_id, webhook_id } = await req.json();
    if (!instance_id || !webhook_id) {
      return new Response(JSON.stringify({ error: "instance_id and webhook_id required" }), {
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

    // UAZAPI returns 405 for DELETE methods, so we use POST/PUT to remove/disable webhooks
    const deleteAttempts = [
      // Try removing by setting url to empty via PUT
      { path: `/webhook/${webhook_id}`, method: "PUT", payload: { url: "", enabled: false }, headers: { "Token": token } },
      { path: `/webhook/${webhook_id}`, method: "PUT", payload: { url: "", enabled: false }, headers: { "token": token } },
      // Try PATCH
      { path: `/webhook/${webhook_id}`, method: "PATCH", payload: { url: "", enabled: false }, headers: { "Token": token } },
      { path: `/webhook/${webhook_id}`, method: "PATCH", payload: { url: "", enabled: false }, headers: { "token": token } },
      // Try POST with remove action
      { path: `/webhook/remove`, method: "POST", payload: { id: webhook_id }, headers: { "Token": token } },
      { path: `/webhook/remove`, method: "POST", payload: { id: webhook_id }, headers: { "token": token } },
      // Try POST to /webhook with id and empty url
      { path: `/webhook`, method: "POST", payload: { id: webhook_id, url: "", enabled: false }, headers: { "Token": token } },
      { path: `/webhook`, method: "POST", payload: { id: webhook_id, url: "", enabled: false }, headers: { "token": token } },
      // Try PUT to /webhook with id
      { path: `/webhook`, method: "PUT", payload: { id: webhook_id, url: "", enabled: false }, headers: { "Token": token } },
      { path: `/webhook`, method: "PUT", payload: { id: webhook_id, url: "", enabled: false }, headers: { "token": token } },
      // Try DELETE as last resort
      { path: `/webhook/${webhook_id}`, method: "DELETE", payload: null, headers: { "Token": token } },
      { path: `/webhook/${webhook_id}`, method: "DELETE", payload: null, headers: { "token": token } },
    ];

    let success = false;
    let lastError = "";

    for (const attempt of deleteAttempts) {
      try {
        const url = `${baseUrl}${attempt.path}`;
        console.log(`Trying to delete webhook: ${attempt.method} ${url}`);
        const fetchOpts: RequestInit = {
          method: attempt.method,
          headers: { "Content-Type": "application/json", ...attempt.headers },
        };
        if (attempt.payload) {
          fetchOpts.body = JSON.stringify(attempt.payload);
        }
        const res = await fetch(url, fetchOpts);
        const resText = await res.text();
        console.log(`Response: ${res.status} - ${resText.substring(0, 300)}`);

        if (res.ok) {
          success = true;
          console.log(`✅ Webhook ${webhook_id} deleted/disabled via ${attempt.method} ${attempt.path}`);
          break;
        }
        if (res.status === 404 || res.status === 405) continue;
        lastError = `${res.status}: ${resText.substring(0, 200)}`;
      } catch (e: any) {
        lastError = e.message;
        continue;
      }
    }

    if (!success) {
      return new Response(JSON.stringify({ error: `Não foi possível remover o webhook. A UAZAPI pode não suportar exclusão direta. Tente desabilitar o webhook.` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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
