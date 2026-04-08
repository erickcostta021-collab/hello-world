import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CUSTOMER-PORTAL] ${step}${detailsStr}`);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);

    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    logStep("User authenticated", { userId: user.id, email: user.email });

    let lookupEmail = user.email;
    let flow: "payment_method_update" | "subscription_cancel" | undefined;
    let body: { email?: string; flow?: "payment_method_update" | "subscription_cancel" } = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    if (body?.email && body.email !== user.email) {
      const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });

      if (isAdmin) {
        lookupEmail = body.email;
        logStep("Admin impersonation", { lookupEmail });
      }
    }

    if (body?.flow === "payment_method_update" || body?.flow === "subscription_cancel") {
      flow = body.flow;
    }

    const profileQuery = lookupEmail === user.email
      ? await supabaseAdmin
          .from("profiles")
          .select("stripe_customer_id")
          .eq("user_id", user.id)
          .maybeSingle()
      : await supabaseAdmin
          .from("profiles")
          .select("stripe_customer_id")
          .eq("email", lookupEmail)
          .maybeSingle();

    if (profileQuery.error) {
      logStep("Profile lookup failed", { message: profileQuery.error.message, lookupEmail });
    }

    let customerId = profileQuery.data?.stripe_customer_id ?? null;
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (!customerId) {
      const customers = await stripe.customers.list({
        email: lookupEmail,
        limit: 1,
      });

      customerId = customers.data[0]?.id ?? null;
      if (customerId) {
        logStep("Found Stripe customer by email", { customerId, lookupEmail });
      }
    } else {
      logStep("Using stripe_customer_id from profile", { customerId, lookupEmail });
    }

    if (!customerId) {
      logStep("No Stripe customer found", { lookupEmail });
      return new Response(JSON.stringify({ error: "NO_CUSTOMER" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const origin = req.headers.get("origin") || Deno.env.get("FRONTEND_URL") || "http://localhost:3000";
    const sessionParams: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: `${origin}/dashboard`,
    };

    if (flow === "payment_method_update") {
      sessionParams.flow_data = {
        type: "payment_method_update",
      };
    }

    const portalSession = await stripe.billingPortal.sessions.create(sessionParams);
    logStep("Portal session created", { customerId, flow, url: portalSession.url });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
