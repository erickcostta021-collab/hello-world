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

    // Step 1: Fetch current webhook data
    let currentWebhook: any = null;
    for (const headerKey of ["Token", "token"]) {
      try {
        const listRes = await fetch(`${baseUrl}/webhook`, {
          method: "GET",
          headers: { "Content-Type": "application/json", [headerKey]: token },
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          const webhooks = Array.isArray(listData) ? listData : (listData.webhooks || []);
          currentWebhook = webhooks.find((w: any) => w.id === webhook_id || w._id === webhook_id);
          if (currentWebhook) break;
        }
      } catch (e) {
        console.log(`Failed to fetch webhooks (${headerKey}):`, e);
      }
    }

    if (!currentWebhook) {
      return new Response(JSON.stringify({ error: "Webhook não encontrado na UAZAPI" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    console.log(`Current webhook: ${JSON.stringify(currentWebhook).substring(0, 500)}`);

    // Step 2: Remove existing webhook using action "update" with empty url (UAZAPI pattern)
    let removed = false;
    for (const headerKey of ["Token", "token"]) {
      try {
        const res = await fetch(`${baseUrl}/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", [headerKey]: token },
          body: JSON.stringify({ action: "update", id: webhook_id, url: "", enabled: false }),
        });
        const resText = await res.text();
        console.log(`Remove response (${headerKey}): ${res.status} - ${resText.substring(0, 300)}`);
        if (res.ok && !resText.includes('"Invalid action"')) {
          removed = true;
          break;
        }
      } catch (e: any) {
        console.log(`Remove failed (${headerKey}):`, e.message);
      }
    }

    if (!removed) {
      return new Response(JSON.stringify({ error: "Não foi possível remover o webhook para recriá-lo" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Re-add with new enabled state
    const addPayload = {
      action: "add",
      url: currentWebhook.url,
      enabled,
      events: currentWebhook.events || ["messages"],
      addUrlEvents: currentWebhook.addUrlEvents ?? false,
      addUrlTypesMessages: currentWebhook.addUrlTypesMessages ?? false,
      excludeMessages: currentWebhook.excludeMessages || [],
    };

    console.log(`Re-add payload: ${JSON.stringify(addPayload).substring(0, 500)}`);

    let added = false;
    let lastError = "";
    for (const headerKey of ["Token", "token"]) {
      try {
        const res = await fetch(`${baseUrl}/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", [headerKey]: token },
          body: JSON.stringify(addPayload),
        });
        const resText = await res.text();
        console.log(`Re-add response (${headerKey}): ${res.status} - ${resText.substring(0, 500)}`);
        if (res.ok) {
          added = true;
          break;
        }
        lastError = `${res.status}: ${resText.substring(0, 200)}`;
      } catch (e: any) {
        lastError = e.message;
      }
    }

    if (!added) {
      return new Response(JSON.stringify({ error: `Webhook removido mas falhou ao recriar: ${lastError}` }), {
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
