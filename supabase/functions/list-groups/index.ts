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
  profilePicUrl?: string;
}

interface Participant {
  id: string;
  phone: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

/**
 * Resolve the UAZAPI base URL for a given user_id by checking:
 * 1. user_settings.uazapi_base_url
 * 2. shared_from_user_id chain
 * 3. get_effective_user_id RPC
 */
async function resolveBaseUrlForUser(supabase: any, userId: string): Promise<string | null> {
  // Direct settings
  const { data: settings } = await supabase
    .from("user_settings")
    .select("uazapi_base_url, shared_from_user_id")
    .eq("user_id", userId)
    .limit(1);

  const url = settings?.[0]?.uazapi_base_url?.replace(/\/+$/, "");
  if (url) return url;

  // Shared from
  if (settings?.[0]?.shared_from_user_id) {
    const { data: sharedSettings } = await supabase
      .from("user_settings")
      .select("uazapi_base_url")
      .eq("user_id", settings[0].shared_from_user_id)
      .limit(1);
    const sharedUrl = sharedSettings?.[0]?.uazapi_base_url?.replace(/\/+$/, "");
    if (sharedUrl) return sharedUrl;
  }

  // Effective user
  const { data: effectiveId } = await supabase.rpc("get_effective_user_id", { p_user_id: userId });
  if (effectiveId && effectiveId !== userId) {
    const { data: effectiveSettings } = await supabase
      .from("user_settings")
      .select("uazapi_base_url")
      .eq("user_id", effectiveId)
      .limit(1);
    const effectiveUrl = effectiveSettings?.[0]?.uazapi_base_url?.replace(/\/+$/, "");
    if (effectiveUrl) return effectiveUrl;
  }

  return null;
}

/**
 * Get admin fallback base URL
 */
async function getAdminBaseUrl(supabase: any): Promise<string | null> {
  const { data: adminRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  
  if (!adminRoles?.length) return null;

  const { data: adminSettings } = await supabase
    .from("user_settings")
    .select("uazapi_base_url, user_id")
    .not("uazapi_base_url", "is", null)
    .in("user_id", adminRoles.map((r: any) => r.user_id))
    .limit(1);

  const url = adminSettings?.[0]?.uazapi_base_url?.replace(/\/+$/, "");
  if (url) {
    console.log(`Using admin fallback base URL from ${adminSettings[0].user_id}`);
  }
  return url || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { instanceId, locationId, groupjid } = body;
    console.log("[list-groups] Received:", { instanceId, locationId, groupjid: groupjid?.substring(0, 20) });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ---- Resolve instance + base URL (token must match server) ----
    let instanceData: any = null;
    let baseUrl: string | null = null;

    if (instanceId) {
      // Direct instance lookup
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
      baseUrl = instanceData.uazapi_base_url?.replace(/\/+$/, "") || null;

      if (!baseUrl) {
        baseUrl = await resolveBaseUrlForUser(supabase, instanceData.user_id);
      }

      // If still no base URL, try to find it from another instance in the same subaccount
      // that has a resolvable URL (same server, different owner)
      if (!baseUrl && instanceData.subaccount_id) {
        const { data: siblingInstances } = await supabase
          .from("instances")
          .select("uazapi_base_url, user_id")
          .eq("subaccount_id", instanceData.subaccount_id)
          .neq("id", instanceId);

        for (const sibling of siblingInstances || []) {
          const siblingUrl = sibling.uazapi_base_url?.replace(/\/+$/, "");
          if (siblingUrl) {
            baseUrl = siblingUrl;
            console.log(`Using sibling instance base URL: ${baseUrl}`);
            break;
          }
          const ownerUrl = await resolveBaseUrlForUser(supabase, sibling.user_id);
          if (ownerUrl) {
            baseUrl = ownerUrl;
            console.log(`Using sibling owner base URL: ${baseUrl}`);
            break;
          }
        }
      }
    } else if (locationId) {
      // Find ALL subaccounts for this location, then find the best instance
      const { data: subs } = await supabase
        .from("ghl_subaccounts")
        .select("id, user_id")
        .eq("location_id", locationId);

      if (!subs?.length) {
        return new Response(JSON.stringify({ error: "Subaccount not found for location" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const subIds = subs.map((s: any) => s.id);
      const { data: allInstances } = await supabase
        .from("instances")
        .select("id, uazapi_instance_token, instance_name, user_id, uazapi_base_url, subaccount_id, instance_status")
        .in("subaccount_id", subIds)
        .order("instance_status", { ascending: true }); // connected first

      if (!allInstances?.length) {
        return new Response(JSON.stringify({ error: "No instance found for this location" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log(`[list-groups] Found ${allInstances.length} instances across ${subs.length} subaccounts for location ${locationId}`);

      // Try to find an instance with a resolvable base URL, preferring connected ones
      for (const inst of allInstances) {
        let url = inst.uazapi_base_url?.replace(/\/+$/, "") || null;
        if (!url) {
          url = await resolveBaseUrlForUser(supabase, inst.user_id);
        }
        if (url) {
          instanceData = inst;
          baseUrl = url;
          console.log(`[list-groups] Selected instance "${inst.instance_name}" (${inst.id}) with base URL ${url}`);
          break;
        }
      }

      // If no instance has a resolvable URL, use first connected + admin fallback
      if (!instanceData) {
        instanceData = allInstances.find((i: any) => i.instance_status === "connected") || allInstances[0];
        console.log(`[list-groups] No instance with resolvable URL, using "${instanceData.instance_name}"`);
      }
    } else {
      return new Response(JSON.stringify({ error: "instanceId or locationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Final fallback: admin base URL
    if (!baseUrl) {
      baseUrl = await getAdminBaseUrl(supabase);
    }

    if (!baseUrl) {
      return new Response(JSON.stringify({ error: "UAZAPI base URL not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[list-groups] Using instance "${instanceData.instance_name}" token=${instanceData.uazapi_instance_token.substring(0,8)}... baseUrl=${baseUrl}`);

    // ======== Helper: try group info on a specific server ========
    async function tryGroupInfoOnServer(serverUrl: string, token: string, gid: string): Promise<{ data: any; error: string }> {
      const endpoints = [
        { url: `${serverUrl}/group/info`, method: "POST", body: { groupjid: gid, getInviteLink: false, getRequestsParticipants: true, force: true } },
        { url: `${serverUrl}/group/info`, method: "POST", body: { jid: gid, getInviteLink: false, force: true } },
        { url: `${serverUrl}/group/${encodeURIComponent(gid)}`, method: "GET", body: null },
        { url: `${serverUrl}/group/metadata/${encodeURIComponent(gid)}`, method: "GET", body: null },
      ];

      let lastError = "";
      for (const ep of endpoints) {
        try {
          console.log(`Trying: ${ep.method} ${ep.url}`);
          const fetchOpts: any = {
            method: ep.method,
            headers: { "Accept": "application/json", "Content-Type": "application/json", "token": token },
          };
          if (ep.body) fetchOpts.body = JSON.stringify(ep.body);
          const response = await fetch(ep.url, fetchOpts);
          const text = await response.text();
          console.log(`Response ${ep.method} ${ep.url}: ${response.status} - ${text.substring(0, 1500)}`);

          if (response.status === 401) {
            lastError = "Invalid token";
            break; // Token doesn't belong to this server, skip remaining endpoints
          }
          if (response.ok) {
            try {
              const parsed = JSON.parse(text);
              // Check both lowercase and PascalCase (Go-style) field names
              const hasParticipants = parsed && (
                parsed.participants || parsed.Participants ||
                parsed.members || parsed.Members ||
                parsed.data?.participants || parsed.data?.Participants ||
                parsed.JID // UAZAPI Go response with group info
              );
              if (hasParticipants) {
                console.log("✅ Got group info from:", ep.url);
                return { data: parsed, error: "" };
              }
            } catch { /* continue */ }
          }
          lastError = text;
        } catch (e) {
          console.error(`Error trying ${ep.url}:`, e);
          lastError = String(e);
        }
      }
      return { data: null, error: lastError };
    }

    // ======== GROUP INFO (members) ========
    if (groupjid) {
      console.log(`Fetching group info for ${groupjid} from ${baseUrl}`);

      // First: try with resolved instance + base URL
      let result = await tryGroupInfoOnServer(baseUrl, instanceData.uazapi_instance_token, groupjid);

      // If failed, try ALL instances for the same location with ALL known servers
      if (!result.data) {
        console.log("[list-groups] Primary attempt failed, trying all instances × all servers...");

        // Get all known UAZAPI servers
        const { data: allServers } = await supabase
          .from("user_settings")
          .select("uazapi_base_url")
          .not("uazapi_base_url", "is", null);
        const knownServers = [...new Set((allServers || []).map((s: any) => s.uazapi_base_url?.replace(/\/+$/, "")).filter(Boolean))];

        // Get all instances for this location (if we came via locationId, we already have them)
        let allLocationInstances: any[] = [];
        if (locationId) {
          const { data: subs } = await supabase.from("ghl_subaccounts").select("id").eq("location_id", locationId);
          if (subs?.length) {
            const { data: insts } = await supabase.from("instances").select("id, uazapi_instance_token, instance_name, instance_status").in("subaccount_id", subs.map((s: any) => s.id));
            allLocationInstances = insts || [];
          }
        } else if (instanceData.subaccount_id) {
          // Get location from subaccount, then all instances
          const { data: sub } = await supabase.from("ghl_subaccounts").select("location_id").eq("id", instanceData.subaccount_id).limit(1);
          if (sub?.[0]?.location_id) {
            const { data: subs } = await supabase.from("ghl_subaccounts").select("id").eq("location_id", sub[0].location_id);
            if (subs?.length) {
              const { data: insts } = await supabase.from("instances").select("id, uazapi_instance_token, instance_name, instance_status").in("subaccount_id", subs.map((s: any) => s.id));
              allLocationInstances = insts || [];
            }
          }
        }

        // Try each instance token on each known server
        outerLoop:
        for (const inst of allLocationInstances) {
          if (inst.id === instanceId && inst.uazapi_instance_token === instanceData.uazapi_instance_token) continue; // Already tried
          for (const server of knownServers) {
            if (server === baseUrl && inst.uazapi_instance_token === instanceData.uazapi_instance_token) continue; // Already tried
            console.log(`[list-groups] Trying instance "${inst.instance_name}" on ${server}`);
            result = await tryGroupInfoOnServer(server, inst.uazapi_instance_token, groupjid);
            if (result.data) {
              instanceData = inst; // Update instance data for response
              // Save the working base URL on the instance for future use
              await supabase.from("instances").update({ uazapi_base_url: server }).eq("id", inst.id);
              console.log(`[list-groups] ✅ Auto-saved base URL ${server} for instance ${inst.id}`);
              break outerLoop;
            }
          }
        }
      }

      if (!result.data) {
        return new Response(JSON.stringify({ error: `Failed to fetch group info: ${result.error}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = result.data;
      const rawParticipants = data.participants || data.Participants || data.members || data.Members || data.data?.participants || data.data?.Participants || [];
      
      // Log first 2 raw participants to understand the data structure
      if (rawParticipants.length > 0) {
        console.log("[list-groups] Raw participant sample:", JSON.stringify(rawParticipants.slice(0, 2)));
      }

      const participants = rawParticipants.map((p: any) => {
        const jid = p.id || p.JID || p.jid || p.participant || "";
        // Extract phone from PhoneNumber field (format: "5521980014713@s.whatsapp.net")
        const phoneNumberField = p.PhoneNumber || p.phoneNumber || p.phone_number || p.phone || p.Phone || p.pn || p.PN || "";
        const phone = phoneNumberField ? phoneNumberField.split("@")[0] : (jid.includes("@lid") ? "" : jid.split("@")[0]);
        const lid = (p.LID || p.lid || (jid.includes("@lid") ? jid : "")).split("@")[0];
        const name = p.DisplayName || p.displayName || p.notify || p.Notify || p.pushName || p.PushName || p.name || p.Name || p.verifiedName || p.VerifiedName || "";
        return {
          id: jid,
          phone: phone || lid,
          lid,
          name,
          isAdmin: p.IsAdmin === true || p.isAdmin === true || p.admin === "admin" || p.Admin === "admin",
          isSuperAdmin: p.IsSuperAdmin === true || p.isSuperAdmin === true || p.admin === "superadmin" || p.Admin === "superadmin",
        };
      });

      // Fetch contact names for participants that don't have a DisplayName
      const participantsWithoutName = participants.filter((p: any) => !p.name && p.phone);
      if (participantsWithoutName.length > 0) {
        try {
      // Try multiple endpoints to get contact names
          const phones = participantsWithoutName.map((p: any) => p.phone);
          console.log(`[list-groups] Fetching names for ${phones.length} phones`);
          
          let contactMap: Record<string, string> = {};

          // Strategy 1: Try to get all contacts at once via GET endpoints
          const getContactsEndpoints = [
            `${baseUrl}/chat/getcontacts`,
            `${baseUrl}/contact/getcontacts`,
            `${baseUrl}/contacts`,
          ];
          for (const url of getContactsEndpoints) {
            try {
              console.log(`[list-groups] Trying GET ${url}`);
              const res = await fetch(url, {
                method: "GET",
                headers: { "Accept": "application/json", "token": instanceData.uazapi_instance_token },
              });
              const text = await res.text();
              console.log(`[list-groups] Response ${res.status}: ${text.substring(0, 800)}`);
              if (!res.ok) continue;
              const data = JSON.parse(text);
              const contacts = Array.isArray(data) ? data : (data?.data || data?.contacts || data?.results || []);
              if (Array.isArray(contacts) && contacts.length > 0) {
                for (const c of contacts) {
                  const cJid = c.id || c.jid || c.JID || c.phone || "";
                  const cPhone = cJid.split("@")[0];
                  const cName = c.contact_name || c.contact_FirstName || c.PushName || c.pushName || c.notify || c.name || c.Name || c.FullName || c.DisplayName || "";
                  if (cPhone && cName) {
                    // Match against our participant phones
                    if (phones.includes(cPhone)) {
                      contactMap[cPhone] = cName;
                    }
                  }
                }
                if (Object.keys(contactMap).length > 0) {
                  console.log(`[list-groups] ✅ Got ${Object.keys(contactMap).length} names from ${url}`);
                  break;
                }
              }
            } catch (e) { console.log(`[list-groups] Error: ${e}`); }
          }

          // Strategy 2: Individual lookups with logging
          if (Object.keys(contactMap).length === 0) {
            for (const phone of phones) {
              const jid = phone + "@s.whatsapp.net";
              const infoEndpoints = [
                { method: "GET", url: `${baseUrl}/user/info/${encodeURIComponent(jid)}` },
                { method: "GET", url: `${baseUrl}/contact/info/${encodeURIComponent(jid)}` },
                { method: "POST", url: `${baseUrl}/user/info`, body: JSON.stringify({ jid }) },
                { method: "POST", url: `${baseUrl}/contact/info`, body: JSON.stringify({ jid }) },
              ];
              for (const ep of infoEndpoints) {
                try {
                  console.log(`[list-groups] Trying ${ep.method} ${ep.url}`);
                  const fetchOpts: any = {
                    method: ep.method,
                    headers: { "Accept": "application/json", "Content-Type": "application/json", "token": instanceData.uazapi_instance_token },
                  };
                  if ((ep as any).body) fetchOpts.body = (ep as any).body;
                  const res = await fetch(ep.url, fetchOpts);
                  const text = await res.text();
                  console.log(`[list-groups] Response ${res.status}: ${text.substring(0, 300)}`);
                  if (!res.ok) continue;
                  const d = JSON.parse(text);
                  const flat = d?.data || d;
                  const name = flat?.PushName || flat?.pushName || flat?.notify || flat?.Notify || flat?.name || flat?.Name || flat?.VerifiedName || flat?.DisplayName || "";
                  if (name) {
                    contactMap[phone] = name;
                    console.log(`[list-groups] ✅ Name for ${phone}: ${name}`);
                    break;
                  }
                } catch (e) { console.log(`[list-groups] Error: ${e}`); }
              }
            }
          }
          
          // Apply names to participants
          for (const p of participants) {
            if (!p.name && contactMap[p.phone]) {
              p.name = contactMap[p.phone];
            }
          }
          console.log(`[list-groups] Final resolved names: ${JSON.stringify(contactMap)}`);

          // Apply resolved names back to participants
          for (const p of participants) {
            if (!p.name && p.phone && contactMap[p.phone]) {
              p.name = contactMap[p.phone];
            }
          }
        } catch (e) {
          console.error("[list-groups] Failed to fetch contact names:", e);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        instanceName: instanceData.instance_name,
        groupName: data.subject || data.Subject || data.data?.subject || data.data?.Subject || data.Topic || data.topic || data.groupName || data.GroupName || groupjid,
        groupDescription: data.desc || data.Desc || data.description || data.Description || data.Topic || "",
        participantCount: participants.length,
        participants,
        isAnnounce: data.IsAnnounce ?? data.isAnnounce ?? data.announce ?? false,
        isLocked: data.IsLocked ?? data.isLocked ?? data.locked ?? false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ======== LIST ALL GROUPS ========
    const groupsUrl = `${baseUrl}/group/list?noparticipants=true`;
    console.log(`Fetching groups from: ${groupsUrl}`);

    const response = await fetch(groupsUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": instanceData.uazapi_instance_token,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`UAZAPI error (${response.status}):`, errorText);
      return new Response(JSON.stringify({ error: `Failed to fetch groups: ${errorText}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawText = await response.text();
    console.log(`[list-groups] Raw response (first 2000 chars): ${rawText.substring(0, 2000)}`);
    
    let groupsData: any;
    try {
      groupsData = JSON.parse(rawText);
    } catch {
      return new Response(JSON.stringify({ error: `Invalid JSON from UAZAPI: ${rawText.substring(0, 200)}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Handle various response formats: direct array, or wrapped in object
    let groupsList: any[] = [];
    if (Array.isArray(groupsData)) {
      groupsList = groupsData;
    } else if (groupsData && typeof groupsData === "object") {
      // Try common wrapper keys
      groupsList = groupsData.data || groupsData.groups || groupsData.Groups || 
                   groupsData.result || groupsData.Results || groupsData.items || [];
      if (!Array.isArray(groupsList)) groupsList = [];
    }
    
    console.log(`[list-groups] Found ${groupsList.length} groups`);

    const groups: GroupInfo[] = [];
    for (const group of groupsList) {
      const id = group.id || group.jid || group.JID || group.groupId || group.GroupId || "";
      const name = group.subject || group.Subject || group.name || group.Name || group.groupName || group.GroupName || group.Topic || group.topic || `Grupo ${id.split("@")[0].slice(-6)}`;
      const memberCount = group.size || group.Size || group.ParticipantCount || group.participantCount || group.participants?.length || group.Participants?.length || group.MemberCount || group.memberCount;
      const isAdmin = group.isAdmin || group.IsAdmin || group.admin || group.Admin || group.OwnerIsAdmin || group.ownerIsAdmin;
      const profilePicUrl = group.profilePicUrl || group.ProfilePicUrl || group.profilePic || group.ProfilePic || group.picture || group.Picture || group.pictureUrl || group.PictureUrl || group.imgUrl || group.ImgUrl || group.photo || group.Photo || "";
      if (id) {
        groups.push({ id, name, memberCount, isAdmin, profilePicUrl: profilePicUrl || undefined });
      }
    }

    // Profile picture endpoints not available on this UAZAPI version - using visual fallback (initials)

    return new Response(JSON.stringify({ success: true, instanceName: instanceData.instance_name, groups }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
