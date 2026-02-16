import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Provider ID from GHL Marketplace
const GHL_PROVIDER_ID = "6971c2cfdbee9e2d7a8b1401";

// Register Conversation Provider - Método principal (estilo Stevo)
async function registerConversationProvider(
  locationId: string,
  accessToken: string
): Promise<{ success: boolean; method?: string; error?: string }> {
  console.log("📞 [PROVIDER] Registering conversation provider for location:", locationId);
  console.log("📞 [PROVIDER] Provider ID:", GHL_PROVIDER_ID);

  // Método 1: POST /locations/{locationId}/conversation-providers
  try {
    const url1 = `https://services.leadconnectorhq.com/locations/${locationId}/conversation-providers`;
    const body1 = JSON.stringify({
      providerId: GHL_PROVIDER_ID,
      enabled: true,
    });

    console.log("📞 [PROVIDER] Method 1 - URL:", url1);
    console.log("📞 [PROVIDER] Method 1 - Body:", body1);

    const response1 = await fetch(url1, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body1,
    });

    const response1Text = await response1.text();
    console.log("📞 [PROVIDER] Method 1 - Status:", response1.status);
    console.log("📞 [PROVIDER] Method 1 - Response:", response1Text);

    if (response1.ok) {
      console.log("✅ [PROVIDER] Method 1 SUCCESS!");
      return { success: true, method: "locations/conversation-providers" };
    }
  } catch (e) {
    console.error("❌ [PROVIDER] Method 1 error:", e);
  }

  // Método 2: POST /conversations/providers/install
  try {
    const url2 = "https://services.leadconnectorhq.com/conversations/providers/install";
    const body2 = JSON.stringify({
      locationId: locationId,
      providerId: GHL_PROVIDER_ID,
    });

    console.log("📞 [PROVIDER] Method 2 - URL:", url2);
    console.log("📞 [PROVIDER] Method 2 - Body:", body2);

    const response2 = await fetch(url2, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body2,
    });

    const response2Text = await response2.text();
    console.log("📞 [PROVIDER] Method 2 - Status:", response2.status);
    console.log("📞 [PROVIDER] Method 2 - Response:", response2Text);

    if (response2.ok) {
      console.log("✅ [PROVIDER] Method 2 SUCCESS!");
      return { success: true, method: "conversations/providers/install" };
    }
  } catch (e) {
    console.error("❌ [PROVIDER] Method 2 error:", e);
  }

  // Método 3: POST /conversations/providers/config (tentado anteriormente)
  try {
    const url3 = "https://services.leadconnectorhq.com/conversations/providers/config";
    const body3 = JSON.stringify({
      locationId: locationId,
      providerId: GHL_PROVIDER_ID,
      type: "SMS",
    });

    console.log("📞 [PROVIDER] Method 3 - URL:", url3);
    console.log("📞 [PROVIDER] Method 3 - Body:", body3);

    const response3 = await fetch(url3, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body3,
    });

    const response3Text = await response3.text();
    console.log("📞 [PROVIDER] Method 3 - Status:", response3.status);
    console.log("📞 [PROVIDER] Method 3 - Response:", response3Text);

    if (response3.ok) {
      console.log("✅ [PROVIDER] Method 3 SUCCESS!");
      return { success: true, method: "conversations/providers/config" };
    }
  } catch (e) {
    console.error("❌ [PROVIDER] Method 3 error:", e);
  }

  console.error("❌ [PROVIDER] All methods failed");
  return { success: false, error: "All provider registration methods failed" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("=== OAUTH CALLBACK START ===");

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    let locationId = url.searchParams.get("locationId");
    const companyId = url.searchParams.get("companyId");
    const state = url.searchParams.get("state"); // Contains user_id

    console.log("Code:", code?.substring(0, 20) + "...");
    console.log("Location ID (URL):", locationId);
    console.log("Company ID:", companyId);
    console.log("State:", state?.substring(0, 30) + "...");

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse state to get user_id
    let userId: string | null = null;
    if (state) {
      try {
        const stateData = JSON.parse(atob(state));
        userId = stateData.userId;
        console.log("User ID from state:", userId);
      } catch {
        console.log("Could not parse state parameter");
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing user context in state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get OAuth credentials - try admin credentials first, then user's own
    let clientId: string | null = null;
    let clientSecret: string | null = null;

    // Try admin credentials first (shared across all users)
    const { data: adminCreds } = await supabase.rpc("get_admin_oauth_credentials");
    if (adminCreds && adminCreds.length > 0 && adminCreds[0].ghl_client_id && adminCreds[0].ghl_client_secret) {
      clientId = adminCreds[0].ghl_client_id;
      clientSecret = adminCreds[0].ghl_client_secret;
      console.log("Using admin OAuth credentials");
    } else {
      // Fallback to user's own credentials
      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("ghl_client_id, ghl_client_secret")
        .eq("user_id", userId)
        .single();
      
      if (userSettings?.ghl_client_id && userSettings?.ghl_client_secret) {
        clientId = userSettings.ghl_client_id;
        clientSecret = userSettings.ghl_client_secret;
        console.log("Using user's own OAuth credentials");
      }
    }

    if (!clientId || !clientSecret) {
      console.error("OAuth credentials not found from admin or user");
      return new Response(
        JSON.stringify({ error: "OAuth credentials not configured. Please contact the administrator." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Step 1: Settings retrieved - OK");

    // Get the base URL for redirect - use frontend URL which proxies to this function
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://bridge-api.lovable.app";
    const redirectUri = `${frontendUrl}/oauth/callback`;

    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      user_type: "Location",
    });

    const tokenResponse = await fetch("https://services.leadconnectorhq.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to exchange code for tokens", details: errorText }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, scope, locationId: tokenLocationId } = tokenData;

    console.log("Step 2: Token exchange - OK");
    console.log("Location ID (token):", tokenLocationId);

    // Use locationId from token response if not provided in URL
    const finalLocationId = tokenLocationId || locationId;

    if (!finalLocationId) {
      console.error("No locationId in URL or token response:", tokenData);
      return new Response(
        JSON.stringify({ error: "Could not determine locationId from OAuth response" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Final Location ID:", finalLocationId);

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Get location name from GHL API
    let accountName = `Location ${finalLocationId}`;
    try {
      const locationResponse = await fetch(
        `https://services.leadconnectorhq.com/locations/${finalLocationId}`,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            Version: "2021-07-28",
            Accept: "application/json",
          },
        }
      );

      if (locationResponse.ok) {
        const locationData = await locationResponse.json();
        accountName = locationData.location?.name || locationData.name || accountName;
      }
    } catch (e) {
      console.log("Could not fetch location name:", e);
    }

    console.log("Step 3: Location name fetched - OK");
    console.log("Account Name:", accountName);

    // Update existing record for THIS user, or insert new one
    // Check if this user already has a record for this location
    const { data: ownSubaccount } = await supabase
      .from("ghl_subaccounts")
      .select("id")
      .eq("location_id", finalLocationId)
      .eq("user_id", userId)
      .maybeSingle();

    let upsertError;
    
    const oauthFields = {
      company_id: companyId || null,
      account_name: accountName,
      ghl_access_token: access_token,
      ghl_refresh_token: refresh_token,
      ghl_token_expires_at: expiresAt.toISOString(),
      ghl_token_scopes: scope,
      ghl_subaccount_token: access_token,
      oauth_installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (ownSubaccount) {
      // Update this user's existing record
      const { error } = await supabase
        .from("ghl_subaccounts")
        .update(oauthFields)
        .eq("id", ownSubaccount.id);
      upsertError = error;
    } else {
      // Insert new record for this user (even if another user has the same location)
      const { error } = await supabase
        .from("ghl_subaccounts")
        .insert({
          user_id: userId,
          location_id: finalLocationId,
          ...oauthFields,
        });
      upsertError = error;
    }

    if (upsertError) {
      console.error("Failed to save integration:", upsertError);
      return new Response(
        JSON.stringify({ error: "Failed to save integration", details: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Step 4: Save to DB - OK");

    // 🔥 CRITICAL: Register Conversation Provider (estilo Stevo)
    const providerResult = await registerConversationProvider(finalLocationId, access_token);
    console.log("Step 5: Register provider -", providerResult.success ? "OK" : "FAILED");
    if (providerResult.success) {
      console.log("✅ Provider registered via:", providerResult.method);
    } else {
      console.log("⚠️ Provider registration failed, user may need manual activation");
    }

    console.log("Step 6: Redirect - OK");
    console.log("=== OAUTH CALLBACK END ===");

    // Redirect to success page (will auto-redirect to dashboard after 3s)
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: `${frontendUrl}/oauth/success/${finalLocationId}`,
      },
    });
  } catch (error: unknown) {
    console.error("OAuth callback error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
