import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Plan configuration with inline pricing (no external Price IDs needed)
const PLAN_CONFIG: Record<string, { name: string; amount: number; instances: number }> = {
  plan_50: { name: "Plano 50 Conexões", amount: 89800, instances: 50 },
  plan_100: { name: "Plano 100 Conexões", amount: 149800, instances: 100 },
  plan_300: { name: "Plano 300 Conexões", amount: 299800, instances: 300 },
};

const FLEXIBLE_PRICE_AMOUNTS = [0, 2900, 4900, 7500, 9900, 12500, 14900, 17500, 19900, 22500, 24900];

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const { plan, quantity, email: bodyEmail, forceNewSubscription } = await req.json();
    logStep("Request received", { plan, quantity, email: bodyEmail, forceNewSubscription });

    // Try to get authenticated user
    let userEmail = bodyEmail;
    let isAuthenticated = false;
    let authUserId: string | null = null;
    
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      
      if (!userError && userData?.user?.email) {
        userEmail = userData.user.email;
        authUserId = userData.user.id;
        isAuthenticated = true;
        logStep("Authenticated user detected", { email: userEmail, userId: authUserId });
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
    if (plan !== "flexible" && !PLAN_CONFIG[plan]) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if customer already exists
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing customer found", { customerId });
    } else {
      logStep("No existing customer, will create new");
    }

    const origin = req.headers.get("origin") || "https://bridge-api.lovable.app";
    const qty = Math.min(Math.max(quantity || 1, 1), 10);

    // ── Check for existing active subscription ──
    if (customerId) {
      const activeSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 10,
      });

      // Also check trialing subscriptions
      const trialingSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: "trialing",
        limit: 10,
      });

      const allActiveSubs = [...activeSubs.data, ...trialingSubs.data];

      if (allActiveSubs.length > 0) {
        // User already has an active subscription → upgrade/downgrade
        const currentSub = allActiveSubs[0]; // Use the first active subscription
        logStep("Existing subscription found, updating", { 
          subscriptionId: currentSub.id, 
          currentItems: currentSub.items.data.map(i => ({ price: i.price.id, qty: i.quantity }))
        });

        // Cancel extra subscriptions if user somehow has more than one
        for (let i = 1; i < allActiveSubs.length; i++) {
          logStep("Canceling duplicate subscription", { subId: allActiveSubs[i].id });
          await stripe.subscriptions.cancel(allActiveSubs[i].id, {
            prorate: true,
          });
        }

        const currentItemId = currentSub.items.data[0]?.id;

        // subscriptions.update does NOT support price_data.product_data
        // We must create a product first, then reference it via price_data.product
        let productName: string;
        let productDescription: string;
        let unitAmount: number;
        let subMetadata: Record<string, any>;

        if (plan === "flexible") {
          productName = qty === 1
            ? "Plano Flexível - 1 Instância"
            : `Plano Flexível - ${qty} Instâncias`;
          productDescription = `${qty} ${qty === 1 ? "Instância" : "Instâncias"} WhatsApp Bridge API`;
          unitAmount = FLEXIBLE_PRICE_AMOUNTS[qty];
          subMetadata = { plan, quantity: qty };
        } else {
          const planConfig = PLAN_CONFIG[plan];
          productName = planConfig.name;
          productDescription = `${planConfig.instances} Conexões WhatsApp Bridge API`;
          unitAmount = planConfig.amount;
          subMetadata = { plan, quantity: planConfig.instances };
        }

        const product = await stripe.products.create({
          name: productName,
          description: productDescription,
        });
        logStep("Product created for sub update", { productId: product.id });

        const updatedSub = await stripe.subscriptions.update(currentSub.id, {
          items: [
            {
              id: currentItemId,
              deleted: true,
            },
            {
              price_data: {
                currency: "brl",
                product: product.id,
                unit_amount: unitAmount,
                recurring: { interval: "month" as const },
              },
              quantity: 1,
            },
          ],
          proration_behavior: "create_prorations",
          metadata: subMetadata,
        });

        const nextInstanceLimit =
          plan === "flexible" ? qty : PLAN_CONFIG[plan].instances;
        const stripeCustomerId =
          typeof updatedSub.customer === "string"
            ? updatedSub.customer
            : updatedSub.customer?.id;

        if (authUserId) {
          const { error: profileUpdateError } = await supabaseAdmin
            .from("profiles")
            .update({
              instance_limit: nextInstanceLimit,
              is_paused: false,
              paused_at: null,
              stripe_customer_id: stripeCustomerId || null,
            })
            .eq("user_id", authUserId);

          if (profileUpdateError) {
            logStep("Profile sync failed after subscription update", {
              userId: authUserId,
              error: profileUpdateError.message,
            });
          } else {
            logStep("Profile synced after subscription update", {
              userId: authUserId,
              limit: nextInstanceLimit,
              stripeCustomerId,
            });
          }
        }

        logStep("Subscription updated", { 
          subscriptionId: updatedSub.id, 
          newPlan: plan, 
          quantity: nextInstanceLimit,
        });

        return new Response(
          JSON.stringify({ 
            updated: true, 
            message: "Assinatura atualizada com sucesso! As alterações já estão ativas.",
            instanceLimit: nextInstanceLimit,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }
    }

    // ── No existing subscription → create new checkout session ──

    // Determine line items based on plan
    let lineItems;
    if (plan === "flexible") {
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
            unit_amount: FLEXIBLE_PRICE_AMOUNTS[qty],
            recurring: { interval: "month" as const },
          },
          quantity: 1,
        },
      ];
      logStep("Flexible plan selected", { quantity: qty });
    } else {
      const planConfig = PLAN_CONFIG[plan];
      lineItems = [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: planConfig.name,
              description: `${planConfig.instances} Conexões WhatsApp Bridge API`,
            },
            unit_amount: planConfig.amount,
            recurring: { interval: "month" as const },
          },
          quantity: 1,
        },
      ];
      logStep("Fixed plan selected", { plan, amount: planConfig.amount });
    }

    // Trial for flexible plan with up to 2 instances
    let isTrialEligible = plan === "flexible" && qty >= 1 && qty <= 2;

    if (isTrialEligible && customerId) {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        limit: 1,
      });
      if (paymentMethods.data.length > 0) {
        isTrialEligible = false;
        logStep("Trial disabled: customer already has payment method", { customerId });
      } else {
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
      status: 200,
    });
  }
});
