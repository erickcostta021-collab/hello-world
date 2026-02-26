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

    // Try multiple approaches to truly delete the webhook from UAZAPI
    // Priority: real deletion methods first, then fallback to clearing URL
    const deleteAttempts = [
      // 1. POST action "delete" (some UAZAPI versions support this)
      { path: `/webhook`, method: "POST", payload: { action: "delete", id: webhook_id }, headers: { "Token": token } },
      { path: `/webhook`, method: "POST", payload: { action: "delete", id: webhook_id }, headers: { "token": token } },
      // 2. POST action "remove"
      { path: `/webhook`, method: "POST", payload: { action: "remove", id: webhook_id }, headers: { "Token": token } },
      { path: `/webhook`, method: "POST", payload: { action: "remove", id: webhook_id }, headers: { "token": token } },
      // 3. DELETE HTTP method
      { path: `/webhook/${webhook_id}`, method: "DELETE", payload: null, headers: { "Token": token } },
      { path: `/webhook/${webhook_id}`, method: "DELETE", payload: null, headers: { "token": token } },
      { path: `/webhook`, method: "DELETE", payload: { id: webhook_id }, headers: { "Token": token } },
      // 4. Fallback: clear URL (doesn't truly remove, but disables)
      { path: `/webhook`, method: "POST", payload: { action: "update", id: webhook_id, url: "", enabled: false }, headers: { "Token": token } },
      { path: `/webhook`, method: "POST", payload: { action: "update", id: webhook_id, url: "", enabled: false }, headers: { "token": token } },
    ];

    let success = false;
    let lastError = "";
    let trueDelete = false;

    for (const attempt of deleteAttempts) {
      try {
        const url = `${baseUrl}${attempt.path}`;
        console.log(`Trying to delete webhook: ${attempt.method} ${url} payload=${JSON.stringify(attempt.payload)}`);
        
        const fetchOptions: RequestInit = {
          method: attempt.method,
          headers: { "Content-Type": "application/json", ...attempt.headers },
        };
        if (attempt.payload) {
          fetchOptions.body = JSON.stringify(attempt.payload);
        }
        
        const res = await fetch(url, fetchOptions);
        const resText = await res.text();
        console.log(`Response: ${res.status} - ${resText.substring(0, 500)}`);

        // Check if this was a true deletion (webhook no longer in response list)
        if (res.ok && !resText.includes('"error"') && !resText.toLowerCase().includes('invalid action')) {
          // Verify: if response is an array, check that webhook_id is NOT in it
          try {
            const parsed = JSON.parse(resText);
            const arr = Array.isArray(parsed) ? parsed : null;
            if (arr) {
              const stillExists = arr.some((w: any) => w.id === webhook_id);
              if (stillExists) {
                console.log(`⚠️ Webhook ${webhook_id} still exists in response after ${attempt.method} - not a true delete`);
                // Only mark as success for fallback (update) attempts
                if (attempt.payload?.action === "update") {
                  success = true;
                  trueDelete = false;
                  console.log(`✅ Webhook ${webhook_id} URL cleared (fallback)`);
                  break;
                }
                continue;
              }
            }
          } catch { /* non-JSON response, that's ok */ }
          
          success = true;
          trueDelete = true;
          console.log(`✅ Webhook ${webhook_id} truly removed via ${attempt.method} ${attempt.path}`);
          break;
        }
        
        if (res.status === 400 || res.status === 404 || res.status === 405) {
          lastError = `${res.status}: ${resText.substring(0, 200)}`;
          continue;
        }
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

    return new Response(JSON.stringify({ success: true, trueDelete }), {
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
