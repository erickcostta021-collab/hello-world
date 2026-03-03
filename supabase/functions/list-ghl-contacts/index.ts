import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function fetchGHL(url: string, init: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, init);
    if (res.status === 429 && i < retries) {
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      continue;
    }
    return res;
  }
  throw new Error("Max retries exceeded");
}

async function getValidToken(supabase: any, sub: any): Promise<string> {
  const expiresAt = sub.ghl_token_expires_at ? new Date(sub.ghl_token_expires_at) : null;
  if (expiresAt && expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return sub.ghl_access_token;
  }

  if (!sub.ghl_refresh_token) return sub.ghl_access_token;

  // Need to refresh
  const { data: creds } = await supabase.rpc("get_admin_oauth_credentials");
  const clientId = creds?.[0]?.ghl_client_id;
  const clientSecret = creds?.[0]?.ghl_client_secret;
  if (!clientId || !clientSecret) return sub.ghl_access_token;

  const tokenRes = await fetchGHL("https://services.leadconnectorhq.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: sub.ghl_refresh_token,
    }),
  });

  if (!tokenRes.ok) return sub.ghl_access_token;

  const tokenData = await tokenRes.json();
  const newExpires = new Date(Date.now() + (tokenData.expires_in || 86400) * 1000);

  await supabase
    .from("ghl_subaccounts")
    .update({
      ghl_access_token: tokenData.access_token,
      ghl_refresh_token: tokenData.refresh_token,
      ghl_token_expires_at: newExpires.toISOString(),
      ghl_subaccount_token: tokenData.access_token,
      oauth_last_refresh: new Date().toISOString(),
    })
    .eq("id", sub.id);

  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth check
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { subaccountId, limit = 100, startAfterId, query } = await req.json();

    if (!subaccountId) {
      return new Response(JSON.stringify({ error: "subaccountId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get subaccount with token
    const { data: sub } = await supabase
      .from("ghl_subaccounts")
      .select("id, user_id, location_id, ghl_access_token, ghl_refresh_token, ghl_token_expires_at")
      .eq("id", subaccountId)
      .single();

    if (!sub || !sub.ghl_access_token) {
      return new Response(JSON.stringify({ error: "Subconta não possui token GHL", contacts: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify ownership
    if (sub.user_id !== user.id) {
      // Check if admin
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const ghlToken = await getValidToken(supabase, sub);

    // Build GHL contacts URL
    let url = `https://services.leadconnectorhq.com/contacts/?locationId=${sub.location_id}&limit=${Math.min(limit, 100)}`;
    if (startAfterId) url += `&startAfterId=${startAfterId}`;
    if (query) url += `&query=${encodeURIComponent(query)}`;

    const res = await fetchGHL(url, {
      headers: {
        Authorization: `Bearer ${ghlToken}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[list-ghl-contacts] GHL API error:", res.status, errText);
      return new Response(JSON.stringify({ error: `GHL API error: ${res.status}`, contacts: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const contacts = (data.contacts || []).map((c: any) => ({
      id: c.id,
      phone: c.phone || "",
      firstName: c.firstName || "",
      lastName: c.lastName || "",
      name: c.contactName || c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
      email: c.email || "",
    })).filter((c: any) => c.phone);

    return new Response(JSON.stringify({
      contacts,
      total: data.meta?.total || contacts.length,
      nextPageUrl: data.meta?.nextPageUrl || null,
      startAfterId: data.meta?.startAfterId || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[list-ghl-contacts] Error:", err);
    return new Response(JSON.stringify({ error: err.message, contacts: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
