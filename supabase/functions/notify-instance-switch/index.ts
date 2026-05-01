// notify-instance-switch
// Sends an immediate broadcast + InternalComment to GHL conversations whose
// preferred_instance is being unlinked or disconnected.
//
// Triggered from the frontend right after a user unlinks an instance from a
// subaccount, or disconnects an instance. Limits notifications to contacts
// with activity in the last 24h to avoid IC spam in GHL.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTIVITY_WINDOW_HOURS = 24;
const MAX_CONTACTS = 50;

type Reason = "unlinked" | "disconnected" | "deleted";

async function getValidToken(supabase: any, subaccount: any, settings: any): Promise<string> {
  const accessToken: string | null = subaccount.ghl_access_token ?? null;
  const refreshToken: string | null = subaccount.ghl_refresh_token ?? null;
  const expiresAtIso: string | null = subaccount.ghl_token_expires_at ?? null;
  if (!accessToken) return "";
  if (!refreshToken || !expiresAtIso) return accessToken;

  const now = new Date();
  const expiresAt = new Date(expiresAtIso);
  const expiresIn1Hour = expiresAt.getTime() - now.getTime() < 60 * 60 * 1000;

  if (now < expiresAt && !expiresIn1Hour) return accessToken;
  if (!settings?.ghl_client_id || !settings?.ghl_client_secret) return accessToken;

  try {
    const params = new URLSearchParams({
      client_id: settings.ghl_client_id,
      client_secret: settings.ghl_client_secret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      user_type: "Location",
    });
    const res = await fetch("https://services.leadconnectorhq.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: params.toString(),
    });
    if (!res.ok) return accessToken;
    const data = await res.json();
    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);
    await supabase
      .from("ghl_subaccounts")
      .update({
        ghl_access_token: data.access_token,
        ghl_refresh_token: data.refresh_token,
        ghl_token_expires_at: newExpiresAt.toISOString(),
        ghl_subaccount_token: data.access_token,
        oauth_last_refresh: new Date().toISOString(),
      })
      .eq("id", subaccount.id);
    return data.access_token;
  } catch (e) {
    console.error("[notify-switch] token refresh error:", e);
    return accessToken;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const instanceId = String(body?.instanceId || "").trim();
    const reason: Reason = (body?.reason as Reason) || "disconnected";
    if (!instanceId) {
      return new Response(JSON.stringify({ error: "instanceId required" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("authorization") || "";

    // Authenticate the caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Load the (now-old) instance — may have subaccount_id null already (unlinked)
    const { data: oldInst } = await admin
      .from("instances")
      .select("id, instance_name, subaccount_id, user_id")
      .eq("id", instanceId)
      .maybeSingle();

    if (!oldInst) {
      return new Response(JSON.stringify({ ok: false, error: "Instance not found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorize: caller must own the instance OR be admin
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin && oldInst.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find all preferences pointing to this old instance
    const { data: prefs } = await admin
      .from("contact_instance_preferences")
      .select("id, contact_id, location_id, lead_phone")
      .eq("instance_id", instanceId);

    if (!prefs || prefs.length === 0) {
      console.log("[notify-switch] No preferences pointing to instance", instanceId);
      return new Response(JSON.stringify({ ok: true, notified: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by location_id (each subaccount handled independently)
    const byLocation = new Map<string, typeof prefs>();
    for (const p of prefs) {
      const arr = byLocation.get(p.location_id) || [];
      arr.push(p);
      byLocation.set(p.location_id, arr);
    }

    let totalNotified = 0;
    const errors: string[] = [];
    const cutoffIso = new Date(Date.now() - ACTIVITY_WINDOW_HOURS * 3600 * 1000).toISOString();

    for (const [locationId, locPrefs] of byLocation) {
      // Resolve subaccount and its connected instances
      const { data: subaccount } = await admin
        .from("ghl_subaccounts")
        .select("id, user_id, location_id, account_name, ghl_access_token, ghl_refresh_token, ghl_token_expires_at, ghl_subaccount_token")
        .eq("location_id", locationId)
        .maybeSingle();
      if (!subaccount) continue;

      const { data: settings } = await admin
        .from("user_settings")
        .select("ghl_client_id, ghl_client_secret")
        .eq("user_id", subaccount.user_id)
        .maybeSingle();

      // Find a connected fallback instance in the same subaccount
      const { data: subInstances } = await admin
        .from("instances")
        .select("id, instance_name, instance_status")
        .eq("subaccount_id", subaccount.id);

      const fallback = (subInstances || []).find(
        (i: any) => i.id !== instanceId && i.instance_status === "connected"
      );

      // Filter preferences to only contacts active in last 24h
      const contactIds = locPrefs.map((p) => p.contact_id).filter(Boolean);
      if (contactIds.length === 0) continue;

      const { data: recentMsgs } = await admin
        .from("message_map")
        .select("contact_id")
        .eq("location_id", locationId)
        .in("contact_id", contactIds)
        .gte("created_at", cutoffIso)
        .limit(1000);

      const recentSet = new Set((recentMsgs || []).map((m: any) => m.contact_id));
      const activePrefs = locPrefs.filter((p) => recentSet.has(p.contact_id)).slice(0, MAX_CONTACTS);

      if (activePrefs.length === 0) {
        console.log("[notify-switch] No recent contacts for location", locationId);
        continue;
      }

      const reasonText =
        reason === "unlinked"
          ? "desvinculada desta subconta"
          : reason === "deleted"
          ? "removida"
          : "desconectada";

      const newInstanceName = fallback?.instance_name || "nenhuma conectada";
      const switchMessage = fallback
        ? `🔄 Instância "${oldInst.instance_name}" ${reasonText}. Trocada automaticamente para: ${newInstanceName}`
        : `⚠️ Instância "${oldInst.instance_name}" ${reasonText}. Nenhuma instância conectada disponível na subconta.`;

      // Resolve a valid GHL token once per subaccount
      const ghlToken = await getValidToken(admin, subaccount, settings);

      for (const pref of activePrefs) {
        // Update preference if we have a fallback
        if (fallback) {
          try {
            await admin
              .from("contact_instance_preferences")
              .update({ instance_id: fallback.id, updated_at: new Date().toISOString() })
              .eq("id", pref.id);
          } catch (e) {
            console.error("[notify-switch] update preference error:", e);
          }
        }

        // Broadcast for any open GHL UI
        try {
          await admin.channel("ghl_updates").send({
            type: "broadcast",
            event: "instance_switch",
            payload: {
              location_id: locationId,
              lead_phone: pref.lead_phone,
              new_instance_id: fallback?.id || null,
              new_instance_name: newInstanceName,
              previous_instance_name: oldInst.instance_name,
              reason: reason === "unlinked" ? "auto_unlinked" : "auto_disconnect",
            },
          });
        } catch (e) {
          console.error("[notify-switch] broadcast error:", e);
        }

        // Send InternalComment immediately
        if (ghlToken && settings?.ghl_client_id && settings?.ghl_client_secret) {
          try {
            const res = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${ghlToken}`,
                Version: "2021-04-15",
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                type: "InternalComment",
                contactId: pref.contact_id,
                message: switchMessage,
              }),
            });
            if (!res.ok) {
              const t = await res.text().catch(() => "");
              console.error("[notify-switch] IC HTTP error", res.status, t.slice(0, 200));
              errors.push(`${pref.contact_id}:${res.status}`);
            } else {
              totalNotified++;
            }
          } catch (e: any) {
            console.error("[notify-switch] IC error:", e?.message || e);
            errors.push(`${pref.contact_id}:exc`);
          }
        }
      }
    }

    console.log("[notify-switch] done", { instanceId, reason, notified: totalNotified, errors: errors.length });
    return new Response(JSON.stringify({ ok: true, notified: totalNotified, errors }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[notify-switch] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
