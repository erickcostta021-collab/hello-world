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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instanceId } = await req.json();

    if (!instanceId) {
      return new Response(
        JSON.stringify({ error: "instanceId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get instance details
    const { data: instance, error: instanceError } = await supabase
      .from("instances")
      .select("uazapi_instance_token, instance_name, user_id, uazapi_base_url")
      .eq("id", instanceId)
      .limit(1);

    if (instanceError || !instance || instance.length === 0) {
      console.error("Instance not found:", instanceError);
      return new Response(
        JSON.stringify({ error: "Instance not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const instanceData = instance[0];

    // Per-instance base URL takes priority over global settings
    let baseUrl = instanceData.uazapi_base_url?.replace(/\/+$/, "");

    if (!baseUrl) {
      // Get user settings for UAZAPI base URL
      const { data: settings, error: settingsError } = await supabase
        .from("user_settings")
        .select("uazapi_base_url")
        .eq("user_id", instanceData.user_id)
        .limit(1);

      if (settingsError || !settings || settings.length === 0) {
        console.error("User settings not found:", settingsError);
        return new Response(
          JSON.stringify({ error: "User settings not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      baseUrl = settings[0].uazapi_base_url?.replace(/\/+$/, "");
    }

    if (!baseUrl) {
      return new Response(
        JSON.stringify({ error: "UAZAPI base URL not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch groups from UAZAPI
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
      return new Response(
        JSON.stringify({ error: `Failed to fetch groups: ${errorText}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const groupsData = await response.json();
    console.log(`Found ${Array.isArray(groupsData) ? groupsData.length : 0} groups`);

    // Format groups for response
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        instanceName: instanceData.instance_name,
        groups 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error listing groups:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
