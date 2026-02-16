// v2.0 - Forced redeploy
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const locationId = url.searchParams.get("locationId");
    const contactId = url.searchParams.get("contactId");
    const phone = url.searchParams.get("phone");

    if (!locationId) {
      return new Response(
        JSON.stringify({ error: "locationId is required", instances: [], activeInstanceId: null }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[get-instances] Request:", { locationId, contactId: contactId?.slice(0, 10), phone: phone?.slice(0, 10) });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find subaccount by location_id
    const { data: subaccounts, error: subError } = await supabase
      .from("ghl_subaccounts")
      .select("id")
      .eq("location_id", locationId)
      .not("ghl_access_token", "is", null)
      .order("oauth_installed_at", { ascending: false, nullsFirst: false })
      .limit(1);
    
    const subaccount = subaccounts?.[0] || null;

    if (subError) {
      console.error("[get-instances] Error fetching subaccount:", subError);
      return new Response(
        JSON.stringify({ instances: [], activeInstanceId: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subaccount) {
      console.log("[get-instances] No subaccount found for locationId:", locationId);
      return new Response(
        JSON.stringify({ instances: [], activeInstanceId: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch connected instances
    const { data: instances, error: instError } = await supabase
      .from("instances")
      .select("id, instance_name, phone, profile_pic_url, instance_status")
      .eq("subaccount_id", subaccount.id)
      .eq("instance_status", "connected")
      .order("instance_name", { ascending: true });

    if (instError) {
      console.error("[get-instances] Error fetching instances:", instError);
      return new Response(
        JSON.stringify({ instances: [], activeInstanceId: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formattedInstances = (instances || []).map((i) => ({
      id: i.id,
      name: i.instance_name,
      phone: i.phone,
      profilePic: i.profile_pic_url,
    }));

    console.log("[get-instances] Found instances:", formattedInstances.length);

    // Determine active instance
    let activeInstanceId: string | null = null;
    let resolvedPhone: string | null = null;

    // Priority 1: Direct phone parameter
    if (phone && phone.length >= 10) {
      resolvedPhone = phone.replace(/\D/g, '');
    }

    // Priority 2: ContactId -> phone lookup
    if (!resolvedPhone && contactId && contactId.length >= 10) {
      const { data: phoneMapping } = await supabase
        .from("ghl_contact_phone_mapping")
        .select("original_phone")
        .eq("contact_id", contactId)
        .eq("location_id", locationId)
        .maybeSingle();
      
      if (phoneMapping?.original_phone) {
        resolvedPhone = phoneMapping.original_phone;
      } else {
        const { data: prefWithPhone } = await supabase
          .from("contact_instance_preferences")
          .select("lead_phone")
          .eq("contact_id", contactId)
          .eq("location_id", locationId)
          .not("lead_phone", "is", null)
          .limit(1);
        
        if (prefWithPhone?.[0]?.lead_phone) {
          resolvedPhone = prefWithPhone[0].lead_phone;
        }
      }
    }

    // Lookup preference by phone
    if (resolvedPhone) {
      const normalizedPhone = resolvedPhone.replace(/\D/g, '');
      const last10Digits = normalizedPhone.slice(-10);
      
      const { data: preferences } = await supabase
        .from("contact_instance_preferences")
        .select("instance_id, updated_at")
        .eq("location_id", locationId)
        .or("lead_phone.eq." + resolvedPhone + ",lead_phone.like.%" + normalizedPhone + ",lead_phone.like.%" + last10Digits + "%")
        .order("updated_at", { ascending: false })
        .limit(1);
      
      if (preferences?.[0]) {
        const exists = formattedInstances.some(i => i.id === preferences[0].instance_id);
        if (exists) {
          activeInstanceId = preferences[0].instance_id;
        }
      }
    }

    // Fallback: Direct contactId lookup
    if (!activeInstanceId && contactId && contactId.length >= 10) {
      const { data: contactPref } = await supabase
        .from("contact_instance_preferences")
        .select("instance_id, lead_phone")
        .eq("contact_id", contactId)
        .eq("location_id", locationId)
        .limit(1);
      
      const pref = contactPref?.[0];
      
      if (pref?.lead_phone) {
        const normalizedPhone = pref.lead_phone.replace(/\D/g, '');
        const last10 = normalizedPhone.slice(-10);
        
        const { data: phonePrefs } = await supabase
          .from("contact_instance_preferences")
          .select("instance_id")
          .eq("location_id", locationId)
          .or("lead_phone.eq." + pref.lead_phone + ",lead_phone.like.%" + normalizedPhone + ",lead_phone.like.%" + last10 + "%")
          .order("updated_at", { ascending: false })
          .limit(1);
        
        if (phonePrefs?.[0]) {
          const exists = formattedInstances.some(i => i.id === phonePrefs[0].instance_id);
          if (exists) activeInstanceId = phonePrefs[0].instance_id;
        }
      } else if (pref?.instance_id) {
        const exists = formattedInstances.some(i => i.id === pref.instance_id);
        if (exists) activeInstanceId = pref.instance_id;
      }
    }

    // Use first instance as fallback
    if (!activeInstanceId && formattedInstances.length > 0) {
      activeInstanceId = formattedInstances[0].id;
    }

    return new Response(
      JSON.stringify({ instances: formattedInstances, activeInstanceId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[get-instances] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", instances: [], activeInstanceId: null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
