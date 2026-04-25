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

    // Helper: check if webhook still exists in UAZAPI
    async function webhookStillExists(): Promise<boolean> {
      try {
        const res = await fetch(`${baseUrl}/webhook`, {
          method: "GET",
          headers: { "Content-Type": "application/json", "Token": token, "token": token },
        });
        if (!res.ok) return false;
        const text = await res.text();
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : [];
        const found = arr.find((w: any) => w.id === webhook_id);
        if (!found) return false;
        // If URL is empty and disabled, consider it "deleted"
        if ((!found.url || found.url.trim() === "") && found.enabled === false) return false;
        return true;
      } catch {
        return false; // Can't verify, assume deleted
      }
    }

    // Phase 1: Try true deletion methods
    const deleteAttempts = [
      { path: `/webhook`, method: "POST", payload: { action: "delete", id: webhook_id }, headers: { "Token": token } },
      { path: `/webhook`, method: "POST", payload: { action: "delete", id: webhook_id }, headers: { "token": token } },
      { path: `/webhook`, method: "POST", payload: { action: "remove", id: webhook_id }, headers: { "Token": token } },
      { path: `/webhook`, method: "POST", payload: { action: "remove", id: webhook_id }, headers: { "token": token } },
      { path: `/webhook/${webhook_id}`, method: "DELETE", payload: null, headers: { "Token": token } },
      { path: `/webhook/${webhook_id}`, method: "DELETE", payload: null, headers: { "token": token } },
      { path: `/webhook`, method: "DELETE", payload: { id: webhook_id }, headers: { "Token": token } },
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
          headers: { "Content-Type": "application/json", ...(attempt.headers as unknown as Record<string, string>) },
        };
        if (attempt.payload) {
          fetchOptions.body = JSON.stringify(attempt.payload);
        }
        
        const res = await fetch(url, fetchOptions);
        const resText = await res.text();
        console.log(`Response: ${res.status} - ${resText.substring(0, 500)}`);

        if (res.ok && res.status !== 405) {
          // Check if it was actually a valid action (not "invalid action" error)
          try {
            const parsed = JSON.parse(resText);
            if (parsed.error || (typeof parsed.message === "string" && parsed.message.toLowerCase().includes("invalid"))) {
              console.log(`Response indicates invalid action, skipping...`);
              continue;
            }
          } catch { /* non-JSON ok */ }

          // Verify: is the webhook actually gone?
          const stillExists = await webhookStillExists();
          if (!stillExists) {
            success = true;
            trueDelete = true;
            console.log(`✅ Webhook ${webhook_id} truly removed via ${attempt.method} ${attempt.path}`);
            break;
          }
          console.log(`⚠️ Webhook ${webhook_id} still exists after ${attempt.method} ${attempt.path}`);
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

    // Phase 2: Fallback - disable and clear URL
    if (!success) {
      console.log(`True deletion failed, falling back to disabling webhook ${webhook_id}...`);
      const disablePayloads = [
        { method: "POST", payload: { id: webhook_id, url: "", enabled: false, action: "update" } },
        { method: "PUT", payload: { id: webhook_id, url: "", enabled: false } },
        { method: "POST", payload: { id: webhook_id, url: "", enabled: false, events: [] } },
      ];

      for (const attempt of disablePayloads) {
        try {
          const res = await fetch(`${baseUrl}/webhook`, {
            method: attempt.method,
            headers: { "Content-Type": "application/json", "Token": token, "token": token },
            body: JSON.stringify(attempt.payload),
          });
          const resText = await res.text();
          console.log(`Disable fallback ${attempt.method}: ${res.status} - ${resText.substring(0, 500)}`);

          if (res.ok) {
            // Verify the webhook is now disabled
            const stillExists = await webhookStillExists();
            if (!stillExists) {
              success = true;
              trueDelete = false;
              console.log(`✅ Webhook ${webhook_id} disabled/cleared via fallback`);
              break;
            }
            console.log(`⚠️ Webhook ${webhook_id} still active after disable attempt`);
          }
        } catch (e: any) {
          lastError = e.message;
          continue;
        }
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
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});