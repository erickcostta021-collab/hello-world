import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GroupInfo {
  id: string;
  name: string;
  memberCount?: number;
  isAdmin?: boolean;
}

interface Participant {
  id: string;
  phone: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { instanceId, locationId, groupjid } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ---- Resolve instance ----
    let instanceData: any = null;

    if (instanceId) {
      const { data, error } = await supabase
        .from("instances")
        .select("uazapi_instance_token, instance_name, user_id, uazapi_base_url, subaccount_id")
        .eq("id", instanceId)
        .limit(1);
      if (error || !data?.length) {
        return new Response(JSON.stringify({ error: "Instance not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      instanceData = data[0];
    } else if (locationId) {
      // Find active instance for this location via subaccount
      const { data: sub } = await supabase
        .from("ghl_subaccounts")
        .select("id")
        .eq("location_id", locationId)
        .limit(1);
      if (!sub?.length) {
        return new Response(JSON.stringify({ error: "Subaccount not found for location" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: instances } = await supabase
        .from("instances")
        .select("uazapi_instance_token, instance_name, user_id, uazapi_base_url, subaccount_id, instance_status")
        .eq("subaccount_id", sub[0].id)
        .order("instance_status", { ascending: true }); // connected first
      if (!instances?.length) {
        return new Response(JSON.stringify({ error: "No instance found for this location" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Prefer connected instance
      instanceData = instances.find((i: any) => i.instance_status === "connected") || instances[0];
    } else {
      return new Response(JSON.stringify({ error: "instanceId or locationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Resolve base URL ----
    let baseUrl = instanceData.uazapi_base_url?.replace(/\/+$/, "");
    if (!baseUrl) {
      // Try user's own settings
      const { data: settings } = await supabase
        .from("user_settings")
        .select("uazapi_base_url, shared_from_user_id")
        .eq("user_id", instanceData.user_id)
        .limit(1);
      baseUrl = settings?.[0]?.uazapi_base_url?.replace(/\/+$/, "");

      // Try shared (effective) user's settings
      if (!baseUrl && settings?.[0]?.shared_from_user_id) {
        const { data: sharedSettings } = await supabase
          .from("user_settings")
          .select("uazapi_base_url")
          .eq("user_id", settings[0].shared_from_user_id)
          .limit(1);
        baseUrl = sharedSettings?.[0]?.uazapi_base_url?.replace(/\/+$/, "");
      }

      // Last resort: get effective user id and try their settings
      if (!baseUrl) {
        const { data: effectiveId } = await supabase.rpc("get_effective_user_id", { p_user_id: instanceData.user_id });
        if (effectiveId && effectiveId !== instanceData.user_id) {
          const { data: effectiveSettings } = await supabase
            .from("user_settings")
            .select("uazapi_base_url")
            .eq("user_id", effectiveId)
            .limit(1);
          baseUrl = effectiveSettings?.[0]?.uazapi_base_url?.replace(/\/+$/, "");
          if (baseUrl) {
            console.log(`Using effective user base URL from ${effectiveId}`);
          }
        }
      }
    }
    if (!baseUrl) {
      return new Response(JSON.stringify({ error: "UAZAPI base URL not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ======== GROUP INFO (members) ========
    if (groupjid) {
      console.log(`Fetching group info for ${groupjid} from ${baseUrl}`);
      
      // Try multiple UAZAPI endpoints for group info
      const endpoints = [
        { url: `${baseUrl}/group/info`, method: "POST", body: { groupjid, getInviteLink: false, getRequestsParticipants: true, force: false } },
        { url: `${baseUrl}/group/info`, method: "POST", body: { jid: groupjid, getInviteLink: false } },
        { url: `${baseUrl}/group/${encodeURIComponent(groupjid)}`, method: "GET", body: null },
        { url: `${baseUrl}/group/metadata/${encodeURIComponent(groupjid)}`, method: "GET", body: null },
      ];

      let data: any = null;
      let lastError = "";

      for (const ep of endpoints) {
        try {
          console.log(`Trying: ${ep.method} ${ep.url}`);
          const fetchOpts: any = {
            method: ep.method,
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json",
              "token": instanceData.uazapi_instance_token,
            },
          };
          if (ep.body) fetchOpts.body = JSON.stringify(ep.body);

          const response = await fetch(ep.url, fetchOpts);
          const text = await response.text();
          console.log(`Response ${ep.method} ${ep.url}: ${response.status} - ${text.substring(0, 200)}`);

          if (response.ok) {
            try { data = JSON.parse(text); } catch { data = null; }
            if (data && (data.participants || data.members || data.data?.participants)) {
              console.log("✅ Got group info from:", ep.url);
              break;
            }
            // Reset if no participants found
            data = null;
          } else {
            lastError = text;
          }
        } catch (e) {
          console.error(`Error trying ${ep.url}:`, e);
          lastError = String(e);
        }
      }

      if (!data) {
        return new Response(JSON.stringify({ error: `Failed to fetch group info: ${lastError}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Extract participants from various UAZAPI response formats
      const rawParticipants = data.participants || data.members || data.data?.participants || [];
      const participants: Participant[] = rawParticipants.map((p: any) => {
        const jid = p.id || p.jid || p.participant || "";
        const phone = jid.split("@")[0] || jid;
        return {
          id: jid,
          phone,
          isAdmin: p.admin === "admin" || p.isAdmin === true || p.role === "admin",
          isSuperAdmin: p.admin === "superadmin" || p.isSuperAdmin === true || p.role === "superadmin",
        };
      });

      return new Response(JSON.stringify({
        success: true,
        instanceName: instanceData.instance_name,
        groupName: data.subject || data.name || data.groupName || groupjid,
        groupDescription: data.desc || data.description || "",
        participantCount: participants.length,
        participants,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ======== LIST ALL GROUPS ========
    const groupsUrl = `${baseUrl}/group/all`;
    console.log(`Fetching groups from: ${groupsUrl}`);

    const response = await fetch(groupsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "apikey": instanceData.uazapi_instance_token,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`UAZAPI error (${response.status}):`, errorText);
      return new Response(JSON.stringify({ error: `Failed to fetch groups: ${errorText}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const groupsData = await response.json();
    console.log(`Found ${Array.isArray(groupsData) ? groupsData.length : 0} groups`);

    const groups: GroupInfo[] = [];
    if (Array.isArray(groupsData)) {
      for (const group of groupsData) {
        groups.push({
          id: group.id || group.jid || group.groupId,
          name: group.subject || group.name || group.groupName || "Unknown Group",
          memberCount: group.size || group.participants?.length,
          isAdmin: group.isAdmin || group.admin,
        });
      }
    }

    return new Response(JSON.stringify({ success: true, instanceName: instanceData.instance_name, groups }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
