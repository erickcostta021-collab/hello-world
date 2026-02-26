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

    // UAZAPI uses POST /webhook with action field
    const attempts = [
      { path: `/webhook`, method: "POST", payload: { action: "update", id: webhook_id, enabled }, headers: { "Token": token } },
      { path: `/webhook`, method: "POST", payload: { action: "update", id: webhook_id, enabled }, headers: { "token": token } },
      // Try without action field but with id
      { path: `/webhook/${webhook_id}`, method: "POST", payload: { enabled }, headers: { "Token": token } },
      { path: `/webhook/${webhook_id}`, method: "POST", payload: { enabled }, headers: { "token": token } },
    ];

    let success = false;
    let lastError = "";

    for (const attempt of attempts) {
      try {
        const url = `${baseUrl}${attempt.path}`;
        console.log(`Trying to toggle webhook: ${attempt.method} ${url} payload=${JSON.stringify(attempt.payload)}`);
        const res = await fetch(url, {
          method: attempt.method,
          headers: { "Content-Type": "application/json", ...attempt.headers },
          body: JSON.stringify(attempt.payload),
        });
        const resText = await res.text();
        console.log(`Response: ${res.status} - ${resText.substring(0, 300)}`);

        if (res.ok && !resText.includes('"error"')) {
          success = true;
          console.log(`✅ Webhook ${webhook_id} toggled to enabled=${enabled}`);
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
