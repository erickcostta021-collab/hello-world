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

    // UAZAPI uses POST /webhook with action field
    const deleteAttempts = [
      { path: `/webhook`, method: "POST", payload: { action: "remove", id: webhook_id }, headers: { "Token": token } },
      { path: `/webhook`, method: "POST", payload: { action: "remove", id: webhook_id }, headers: { "token": token } },
      { path: `/webhook`, method: "POST", payload: { action: "delete", id: webhook_id }, headers: { "Token": token } },
      { path: `/webhook`, method: "POST", payload: { action: "delete", id: webhook_id }, headers: { "token": token } },
      // Try disabling as fallback
      { path: `/webhook`, method: "POST", payload: { action: "update", id: webhook_id, url: "", enabled: false }, headers: { "Token": token } },
      { path: `/webhook`, method: "POST", payload: { action: "update", id: webhook_id, url: "", enabled: false }, headers: { "token": token } },
    ];

    let success = false;
    let lastError = "";

    for (const attempt of deleteAttempts) {
      try {
        const url = `${baseUrl}${attempt.path}`;
        console.log(`Trying to delete webhook: ${attempt.method} ${url} payload=${JSON.stringify(attempt.payload)}`);
        const res = await fetch(url, {
          method: attempt.method,
          headers: { "Content-Type": "application/json", ...attempt.headers },
          body: JSON.stringify(attempt.payload),
        });
        const resText = await res.text();
        console.log(`Response: ${res.status} - ${resText.substring(0, 300)}`);

        if (res.ok && !resText.includes('"error"')) {
          success = true;
          console.log(`✅ Webhook ${webhook_id} removed via ${attempt.method} ${attempt.path}`);
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
      return new Response(JSON.stringify({ error: `Não foi possível remover o webhook: ${lastError}` }), {
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
