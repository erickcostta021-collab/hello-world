import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      .select("id, instance_name, uazapi_instance_token, uazapi_base_url, user_id, subaccount_id")
      .eq("instance_status", "connected");

    if (instancesError) throw instancesError;
    if (!instances || instances.length === 0) {
      return new Response(JSON.stringify({ checked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get global base URLs for users
    const userIds = [...new Set(instances.map((i) => i.user_id))];
    const { data: settings } = await supabase
      .from("user_settings")
      .select("user_id, uazapi_base_url")
      .in("user_id", userIds);

    const settingsMap = new Map(settings?.map((s) => [s.user_id, s.uazapi_base_url]) || []);

    // Group instances by server URL to avoid pinging same server multiple times
    const serverMap = new Map<string, typeof instances>();
    for (const inst of instances) {
      const baseUrl = (inst.uazapi_base_url || settingsMap.get(inst.user_id) || "").replace(/\/$/, "");
      if (!baseUrl) continue;
      if (!serverMap.has(baseUrl)) serverMap.set(baseUrl, []);
      serverMap.get(baseUrl)!.push(inst);
    }

    let checked = 0;
    let offlineCount = 0;

    for (const [serverUrl, serverInstances] of serverMap) {
      checked++;
      let isOnline = false;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const firstInst = serverInstances[0];

        const res = await fetch(`${serverUrl}/instance/status`, {
          method: "GET",
          headers: { "Content-Type": "application/json", token: firstInst.uazapi_instance_token },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        isOnline = res.status < 500;
      } catch {
        isOnline = false;
      }

      if (!isOnline) {
        offlineCount++;

        // Check if there's already an active alert for this server
        for (const inst of serverInstances) {
          const { data: existingAlert } = await supabase
            .from("server_health_alerts")
            .select("id, first_detected_at")
            .eq("instance_id", inst.id)
            .eq("status", "offline")
            .maybeSingle();

          if (existingAlert) {
            // Already tracking — check if >5 min for escalation logging
            const elapsed = Date.now() - new Date(existingAlert.first_detected_at).getTime();
            if (elapsed > 5 * 60 * 1000) {
              console.warn(`🚨 ALERT: Server ${serverUrl} offline for ${Math.round(elapsed / 60000)}min (instance: ${inst.instance_name})`);
            }
          } else {
            // Create new alert
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
      }
    }

    return new Response(
      JSON.stringify({ checked, offline: offlineCount, total_instances: instances.length }),
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
