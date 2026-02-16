import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Price IDs for each plan
const PRICE_IDS = {
  flexible: "price_1SxfRy0Z2fZr4Q3PJmHZbs14", // R$35 per instance
  plan_50: "price_1SxfSE0Z2fZr4Q3PMYliUtzV",  // R$798/month
  plan_100: "price_1SxfSZ0Z2fZr4Q3PbqRwA59t", // R$1.298/month
  plan_300: "price_1SxfSv0Z2fZr4Q3PqhkKAOUS", // R$2.998/month
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Use service role key to check auth.users
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const { plan, quantity, email: bodyEmail } = await req.json();
    logStep("Request received", { plan, quantity, email: bodyEmail });

    // Try to get authenticated user
    let userEmail = bodyEmail;
    let isAuthenticated = false;
    
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      
      if (!userError && userData?.user?.email) {
        userEmail = userData.user.email;
        isAuthenticated = true;
        logStep("Authenticated user detected", { email: userEmail });
      }
    }

    if (!plan || !userEmail) {
      throw new Error("Plan and email are required");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      throw new Error("Formato de email inválido");
    }

    // Only check for existing users if NOT authenticated (new signup flow)
    if (!isAuthenticated) {
      const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        logStep("Error checking existing users", { error: listError.message });
      } else {
        const userExists = existingUsers.users.some(
          (user) => user.email?.toLowerCase() === userEmail.toLowerCase()
        );
        
        if (userExists) {
          logStep("Email already registered", { email: userEmail });
          return new Response(
            JSON.stringify({ 
              error: "Este email já está cadastrado. Por favor, faça login ou use outro email.",
              code: "EMAIL_EXISTS"
            }),
            { 
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            }
          );
        }
      }
    }

    // Validate plan
    if (!PRICE_IDS[plan as keyof typeof PRICE_IDS]) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if customer already exists
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing customer found", { customerId });
    } else {
      logStep("No existing customer, will create new");
    }

    // Determine line items based on plan
    let lineItems;
    if (plan === "flexible") {
      const qty = Math.min(Math.max(quantity || 1, 1), 10); // 1-10 instances
      lineItems = [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: qty === 1
                ? "Plano Flexível - 1 Instância"
                : `Plano Flexível - ${qty} Instâncias`,
              description: `${qty} ${qty === 1 ? "Instância" : "Instâncias"} WhatsApp Bridge API`,
            },
            unit_amount: 3500 * qty,
            recurring: { interval: "month" as const },
          },
          quantity: 1,
        },
      ];
      logStep("Flexible plan selected", { quantity: qty });
    } else {
      lineItems = [
        {
          price: PRICE_IDS[plan as keyof typeof PRICE_IDS],
          quantity: 1,
        },
      ];
      logStep("Fixed plan selected", { plan });
    }

    const origin = req.headers.get("origin") || "https://bridge-api.lovable.app";
    
    // Trial for flexible plan with up to 5 instances
    // Only eligible if customer has NO prior payment methods (first-time user)
    const qty = quantity || 1;
    let isTrialEligible = plan === "flexible" && qty >= 1 && qty <= 5;

    if (isTrialEligible && customerId) {
      // Check if customer already has payment methods registered
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        limit: 1,
      });
      if (paymentMethods.data.length > 0) {
        isTrialEligible = false;
        logStep("Trial disabled: customer already has payment method", { customerId });
      } else {
        // Also check for any previous subscriptions (active, canceled, etc.)
        const prevSubs = await stripe.subscriptions.list({
          customer: customerId,
          limit: 1,
          status: "all",
        });
        if (prevSubs.data.length > 0) {
          isTrialEligible = false;
          logStep("Trial disabled: customer has previous subscriptions", { customerId });
        }
      }
    }
    logStep("Trial eligibility", { isTrialEligible, plan, quantity: qty });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      line_items: lineItems,
      mode: "subscription",
      success_url: `${origin}/login?checkout=success`,
      cancel_url: `${origin}/?checkout=canceled`,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      payment_method_collection: "always",
      ...(isTrialEligible ? { subscription_data: { trial_period_days: 5 } } : {}),
      metadata: {
        plan,
        quantity: quantity || 1,
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url }), {
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
