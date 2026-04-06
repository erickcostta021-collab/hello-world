import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function timedFetch(url: string, init: RequestInit, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if the webhook is correctly configured on UAZAPI for a given instance.
 * Returns true if the webhook URL matches, false if it needs reconfiguration.
 */
async function verifyWebhook(
  baseUrl: string,
  token: string,
  expectedUrl: string
): Promise<boolean> {
  try {
    const res = await timedFetch(`${baseUrl}/webhook`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Token: token, token: token },
    }, 6000);

    if (!res.ok) return false;

    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { return false; }

    // Check if any webhook points to our expected URL and is enabled
    if (Array.isArray(data)) {
      return data.some((w: any) =>
        (w.url === expectedUrl || w.webhookURL === expectedUrl) && w.enabled !== false
      );
    }

    // Single webhook object
    if (data.url === expectedUrl || data.webhookURL === expectedUrl || data.webhook_url === expectedUrl) {
      return data.enabled !== false;
    }

    return false;
  } catch {
    return false; // Can't verify, assume it might be broken
  }
}

/**
 * Reconfigure webhook on UAZAPI by calling configure-webhook edge function
 */
async function reconfigureWebhook(
  supabaseUrl: string,
  serviceRoleKey: string,
  instanceId: string,
  webhookUrl: string
): Promise<boolean> {
  try {
    const res = await timedFetch(`${supabaseUrl}/functions/v1/configure-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        instance_id: instanceId,
        webhook_url_override: webhookUrl,
        enabled: true,
        webhook_events: ["messages"],
      }),
    }, 15000);

    const result = await res.json();
    return result.success === true;
  } catch (e: any) {
    console.warn(`Failed to reconfigure webhook for instance ${instanceId}: ${e.message}`);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get all connected instances with their base URLs
    const { data: instances, error: instancesError } = await supabase
      .from("instances")
      .select("id, instance_name, uazapi_instance_token, uazapi_base_url, user_id, subaccount_id, webhook_url")
      .eq("instance_status", "connected");

    if (instancesError) throw instancesError;
    if (!instances || instances.length === 0) {
      return new Response(JSON.stringify({ checked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get global base URLs and webhook URLs for users
    const userIds = [...new Set(instances.map((i) => i.user_id))];
    const { data: settings } = await supabase
      .from("user_settings")
      .select("user_id, uazapi_base_url, global_webhook_url")
      .in("user_id", userIds);

    const settingsMap = new Map(settings?.map((s) => [s.user_id, s]) || []);

    // Get admin credentials as fallback for managed-mode users
    const { data: adminCreds } = await supabase.rpc("get_admin_uazapi_credentials");
    const adminBaseUrl = adminCreds?.[0]?.uazapi_base_url || "";

    // Group instances by server URL to avoid pinging same server multiple times
    const serverMap = new Map<string, typeof instances>();
    for (const inst of instances) {
      const userSettings = settingsMap.get(inst.user_id);
      const baseUrl = (inst.uazapi_base_url || userSettings?.uazapi_base_url || adminBaseUrl || "").replace(/\/$/, "");
      if (!baseUrl) continue;
      if (!serverMap.has(baseUrl)) serverMap.set(baseUrl, []);
      serverMap.get(baseUrl)!.push(inst);
    }

    let checked = 0;
    let offlineCount = 0;
    let webhooksReconfigured = 0;

    for (const [serverUrl, serverInstances] of serverMap) {
      checked++;
      let isOnline = false;

      try {
        const firstInst = serverInstances[0];
        const res = await timedFetch(`${serverUrl}/instance/status`, {
          method: "GET",
          headers: { "Content-Type": "application/json", token: firstInst.uazapi_instance_token },
        });
        isOnline = res.status < 500;
      } catch {
        isOnline = false;
      }

      if (!isOnline) {
        offlineCount++;

        for (const inst of serverInstances) {
          const { data: existingAlert } = await supabase
            .from("server_health_alerts")
            .select("id, first_detected_at")
            .eq("instance_id", inst.id)
            .eq("status", "offline")
            .maybeSingle();

          if (existingAlert) {
            const elapsed = Date.now() - new Date(existingAlert.first_detected_at).getTime();
            if (elapsed > 5 * 60 * 1000) {
              console.warn(`🚨 ALERT: Server ${serverUrl} offline for ${Math.round(elapsed / 60000)}min (instance: ${inst.instance_name})`);
            }
          } else {
            await supabase.from("server_health_alerts").insert({
              user_id: inst.user_id,
              instance_id: inst.id,
              instance_name: inst.instance_name,
              server_url: serverUrl,
              status: "offline",
              first_detected_at: new Date().toISOString(),
            });
            console.log(`⚠️ New offline alert: ${serverUrl} (instance: ${inst.instance_name})`);
          }
        }
      } else {
        // Server is online — resolve any existing alerts
        for (const inst of serverInstances) {
          const { data: existingAlert } = await supabase
            .from("server_health_alerts")
            .select("id")
            .eq("instance_id", inst.id)
            .eq("status", "offline")
            .maybeSingle();

          if (existingAlert) {
            await supabase
              .from("server_health_alerts")
              .update({ status: "recovered", resolved_at: new Date().toISOString() })
              .eq("id", existingAlert.id);
            console.log(`✅ Recovered: ${serverUrl} (instance: ${inst.instance_name})`);
          }
        }

        // ── Webhook verification for online servers ──
        // Check each instance's webhook and reconfigure if needed
        for (const inst of serverInstances) {
          const userSettings = settingsMap.get(inst.user_id);
          const expectedWebhookUrl = inst.webhook_url || userSettings?.global_webhook_url || "https://webhooks.bridgeapi.chat/webhook-inbound";

          try {
            const webhookOk = await verifyWebhook(serverUrl, inst.uazapi_instance_token, expectedWebhookUrl);

            if (!webhookOk) {
              console.warn(`⚠️ Webhook missing/disabled for instance "${inst.instance_name}" (${inst.id}), reconfiguring...`);
              const success = await reconfigureWebhook(supabaseUrl, supabaseKey, inst.id, expectedWebhookUrl);
              if (success) {
                webhooksReconfigured++;
                console.log(`✅ Webhook reconfigured for "${inst.instance_name}"`);
              } else {
                console.error(`❌ Failed to reconfigure webhook for "${inst.instance_name}"`);
              }
            }
          } catch (e: any) {
            console.warn(`Webhook check failed for "${inst.instance_name}": ${e.message}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        checked,
        offline: offlineCount,
        total_instances: instances.length,
        webhooks_reconfigured: webhooksReconfigured,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Health check error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
