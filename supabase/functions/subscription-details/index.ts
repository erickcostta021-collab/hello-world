import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[SUBSCRIPTION-DETAILS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

// Map price amounts / IDs to human-readable plan names
function resolvePlanName(item: Stripe.SubscriptionItem): string {
  const price = item.price;
  const productName = typeof price.product === "object" ? (price.product as Stripe.Product).name : null;

  if (productName) return productName;

  // Fallback by known price IDs
  const KNOWN: Record<string, string> = {
    "price_1SxfRy0Z2fZr4Q3PJmHZbs14": "Plano Flexível",
    "price_1SxfSE0Z2fZr4Q3PMYliUtzV": "50 Conexões",
    "price_1SxfSZ0Z2fZr4Q3PbqRwA59t": "100 Conexões",
    "price_1SxfSv0Z2fZr4Q3PqhkKAOUS": "300 Conexões",
  };

  if (KNOWN[price.id]) return KNOWN[price.id];

  // Fallback by unit_amount for inline price_data (flexible)
  const FLEX_AMOUNTS: Record<number, string> = {
    2900: "Flexível - 1 Conexão",
    4900: "Flexível - 2 Conexões",
    7500: "Flexível - 3 Conexões",
    9900: "Flexível - 4 Conexões",
    12500: "Flexível - 5 Conexões",
    14900: "Flexível - 6 Conexões",
    17500: "Flexível - 7 Conexões",
    19900: "Flexível - 8 Conexões",
    22500: "Flexível - 9 Conexões",
    24900: "Flexível - 10 Conexões",
  };

  if (price.unit_amount && FLEX_AMOUNTS[price.unit_amount]) return FLEX_AMOUNTS[price.unit_amount];

  return `Plano R$${((price.unit_amount || 0) / 100).toFixed(0)}/mês`;
}

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
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    // Check for impersonation: accept email param if caller is admin
    let lookupEmail = user.email;
    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    if (body?.email && body.email !== user.email) {
      // Verify caller is admin
      const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (isAdmin) {
        lookupEmail = body.email;
        logStep("Admin impersonation", { lookupEmail });
      }
    }

    logStep("Looking up subscriptions", { email: lookupEmail });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ subscriptions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = customers.data[0].id;

    const subs = await stripe.subscriptions.list({
      customer: customerId,
      limit: 10,
      expand: ["data.items.data.price.product"],
    });

    const result = subs.data
      .filter((s) => ["active", "trialing", "past_due"].includes(s.status))
      .map((s) => {
        const item = s.items.data[0];
        return {
          id: s.id,
          plan: resolvePlanName(item),
          status: s.status,
          amount: item.price.unit_amount ? item.price.unit_amount / 100 : 0,
          currency: item.price.currency,
          current_period_end: s.current_period_end
            ? new Date(s.current_period_end * 1000).toISOString()
            : null,
          cancel_at_period_end: s.cancel_at_period_end,
        };
      });

    logStep("Returning subscriptions", { count: result.length });

    return new Response(JSON.stringify({ subscriptions: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
