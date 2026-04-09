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

function resolvePlanName(item: Stripe.SubscriptionItem): string {
  const price = item.price;
  const productName = typeof price.product === "object" ? (price.product as Stripe.Product).name : null;

  if (productName) return productName;

  const knownPriceIds: Record<string, string> = {
    "price_1SxfRy0Z2fZr4Q3PJmHZbs14": "Plano Flexível",
    "price_1SxfSE0Z2fZr4Q3PMYliUtzV": "50 Conexões",
    "price_1SxfSZ0Z2fZr4Q3PbqRwA59t": "100 Conexões",
    "price_1SxfSv0Z2fZr4Q3PqhkKAOUS": "300 Conexões",
  };

  if (knownPriceIds[price.id]) return knownPriceIds[price.id];

  const flexibleAmounts: Record<number, string> = {
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

  if (price.unit_amount && flexibleAmounts[price.unit_amount]) return flexibleAmounts[price.unit_amount];

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

    let lookupEmail = user.email;
    let body: { email?: string } = {};

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
    logStep("Looking up subscriptions", { email: lookupEmail, customerId });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (!customerId) {
      const customers = await stripe.customers.list({ email: lookupEmail, limit: 1 });
      customerId = customers.data[0]?.id ?? null;
      if (customerId) {
        logStep("Found Stripe customer by email", { customerId, lookupEmail });
      }
    }

    if (!customerId) {
      return new Response(JSON.stringify({ subscriptions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subs = await stripe.subscriptions.list({
      customer: customerId,
      limit: 10,
    });

    for (const sub of subs.data) {
      for (const item of sub.items.data) {
        if (typeof item.price.product === "string") {
          try {
            const product = await stripe.products.retrieve(item.price.product);
            (item.price as { product: Stripe.Product }).product = product;
          } catch {
            // ignore product fetch failures
          }
        }
      }
    }

    // Debug: log raw subscription structure
    if (subs.data.length > 0) {
      const rawSub = subs.data[0] as any;
      logStep("Raw sub period fields", {
        current_period_end: rawSub.current_period_end,
        current_period_start: rawSub.current_period_start,
        current_period: rawSub.current_period,
        billing_cycle_anchor: rawSub.billing_cycle_anchor,
      });
    }

    const result = subs.data
      .filter((subscription) => ["active", "trialing", "past_due"].includes(subscription.status))
      .map((subscription) => {
        const item = subscription.items.data[0];
        const sub = subscription as any;

        // Try multiple possible field locations for period end
        const periodEnd = sub.current_period_end
          ?? sub.current_period?.end
          ?? null;

        return {
          id: subscription.id,
          plan: resolvePlanName(item),
          status: subscription.status,
          amount: item.price.unit_amount ? item.price.unit_amount / 100 : 0,
          currency: item.price.currency,
          current_period_end: periodEnd
            ? new Date((typeof periodEnd === "number" ? periodEnd : periodEnd) * 1000).toISOString()
            : null,
          cancel_at_period_end: subscription.cancel_at_period_end,
        };
      });

    logStep("Returning subscriptions", { count: result.length, customerId });

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
