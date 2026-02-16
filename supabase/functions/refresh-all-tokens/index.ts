import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find all subaccounts with refresh tokens that expire within the next 6 hours
    // or are already expired (but not older than 30 days to avoid stale refresh tokens)
    const sixHoursFromNow = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const { data: subaccounts, error: fetchErr } = await supabase
      .from("ghl_subaccounts")
      .select("id, user_id, location_id, account_name, ghl_access_token, ghl_refresh_token, ghl_token_expires_at")
      .not("ghl_refresh_token", "is", null)
      .not("ghl_token_expires_at", "is", null)
      .lt("ghl_token_expires_at", sixHoursFromNow)
      .gt("ghl_token_expires_at", thirtyDaysAgo);

    if (fetchErr) {
      console.error("[refresh-all-tokens] DB error:", fetchErr);
      return new Response(JSON.stringify({ error: "DB query failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subaccounts?.length) {
      console.log("[refresh-all-tokens] No tokens need refreshing");
      return new Response(JSON.stringify({ refreshed: 0, message: "All tokens are fresh" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[refresh-all-tokens] Found ${subaccounts.length} tokens to refresh`);

    // Get OAuth credentials: try user-specific first, then admin fallback
    const credentialsCache: Record<string, { client_id: string; client_secret: string } | null> = {};

    async function getCredentials(userId: string): Promise<{ client_id: string; client_secret: string } | null> {
      if (credentialsCache[userId] !== undefined) return credentialsCache[userId];

      const { data: settings } = await supabase
        .from("user_settings")
        .select("ghl_client_id, ghl_client_secret")
        .eq("user_id", userId)
        .limit(1);

      if (settings?.[0]?.ghl_client_id && settings?.[0]?.ghl_client_secret) {
        credentialsCache[userId] = {
          client_id: settings[0].ghl_client_id,
          client_secret: settings[0].ghl_client_secret,
        };
        return credentialsCache[userId];
      }

      // Admin fallback
      const { data: adminCreds } = await supabase.rpc("get_admin_oauth_credentials");
      if (adminCreds?.length) {
        credentialsCache[userId] = {
          client_id: adminCreds[0].ghl_client_id,
          client_secret: adminCreds[0].ghl_client_secret,
        };
        return credentialsCache[userId];
      }

      credentialsCache[userId] = null;
      return null;
    }

    const results: Array<{ account: string; status: string }> = [];

    for (const sub of subaccounts) {
      const creds = await getCredentials(sub.user_id);
      if (!creds) {
        console.error(`[refresh-all-tokens] No OAuth creds for ${sub.account_name}`);
        results.push({ account: sub.account_name, status: "no_credentials" });
        continue;
      }

      try {
        const tokenParams = new URLSearchParams({
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          grant_type: "refresh_token",
          refresh_token: sub.ghl_refresh_token!,
          user_type: "Location",
        });

        const tokenResponse = await fetch("https://services.leadconnectorhq.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
          body: tokenParams.toString(),
        });

        if (!tokenResponse.ok) {
          const errText = await tokenResponse.text();
          console.error(`[refresh-all-tokens] Failed for ${sub.account_name}:`, errText);
          results.push({ account: sub.account_name, status: `error_${tokenResponse.status}` });
          continue;
        }

        const tokenData = await tokenResponse.json();
        const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

        await supabase
          .from("ghl_subaccounts")
          .update({
            ghl_access_token: tokenData.access_token,
            ghl_refresh_token: tokenData.refresh_token,
            ghl_token_expires_at: newExpiresAt.toISOString(),
            ghl_subaccount_token: tokenData.access_token,
            oauth_last_refresh: new Date().toISOString(),
          })
          .eq("id", sub.id);

        console.log(`[refresh-all-tokens] ✅ Refreshed ${sub.account_name} (expires: ${newExpiresAt.toISOString()})`);
        results.push({ account: sub.account_name, status: "refreshed" });

        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`[refresh-all-tokens] Error for ${sub.account_name}:`, err);
        results.push({ account: sub.account_name, status: "exception" });
      }
    }

    const refreshed = results.filter((r) => r.status === "refreshed").length;
    console.log(`[refresh-all-tokens] Done: ${refreshed}/${subaccounts.length} refreshed`);

    return new Response(JSON.stringify({ refreshed, total: subaccounts.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[refresh-all-tokens] Fatal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
