import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Map unit_amount to instance limits for fixed plans
const AMOUNT_TO_LIMIT: Record<number, number> = {
  89800: 50,   // Plan 50 - R$898
  149800: 100, // Plan 100 - R$1.498
  299800: 300, // Plan 300 - R$2.998
};

// Flexible plan amounts
const FLEXIBLE_AMOUNTS = [0, 2900, 4900, 7500, 9900, 12500, 14900, 17500, 19900, 22500, 24900];

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// --- Shared helper: find user by email via profiles table (avoids listUsers pagination limit) ---
async function findUserByEmail(supabaseAdmin: any, email: string): Promise<{ id: string; user_id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, user_id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) {
    logStep("Error looking up profile by email", { email, error: error.message });
    return null;
  }
  return data ? { id: data.id, user_id: data.user_id } : null;
}

// --- Shared helper: calculate total instance limit from all active/trialing subs ---
async function calculateTotalLimit(stripe: Stripe, customerId: string): Promise<number> {
  const allActiveSubs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 50 });
  const allTrialingSubs = await stripe.subscriptions.list({ customer: customerId, status: "trialing", limit: 50 });
  const allSubs = [...allActiveSubs.data, ...allTrialingSubs.data];

  logStep("Calculating total limit from all subs", { count: allSubs.length, subIds: allSubs.map(s => s.id) });

  let instanceLimit = 0;

  for (const sub of allSubs) {
    for (const item of sub.items.data) {
      const unitAmount = item.price.unit_amount || 0;

      if (AMOUNT_TO_LIMIT[unitAmount]) {
        instanceLimit += AMOUNT_TO_LIMIT[unitAmount];
        logStep("Fixed plan detected", { subId: sub.id, unitAmount, instances: AMOUNT_TO_LIMIT[unitAmount] });
      } else {
        const flexIdx = FLEXIBLE_AMOUNTS.indexOf(unitAmount);
        if (flexIdx > 0) {
          instanceLimit += flexIdx;
          logStep("Flexible plan detected", { subId: sub.id, unitAmount, instances: flexIdx });
        } else {
          try {
            const product = await stripe.products.retrieve(item.price.product as string);
            if (product.name?.includes("Flexível")) {
              const match = product.name.match(/(\d+)\s*Inst/i);
              if (match) instanceLimit += parseInt(match[1], 10);
            } else if (product.name?.includes("50 Conexões")) instanceLimit += 50;
            else if (product.name?.includes("100 Conexões")) instanceLimit += 100;
            else if (product.name?.includes("300 Conexões")) instanceLimit += 300;
            else logStep("Unknown product, skipping", { name: product.name, unitAmount });
          } catch {
            logStep("Unknown price, skipping", { priceId: item.price.id, unitAmount });
          }
        }
      }
    }
  }

  return instanceLimit;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    let event: Stripe.Event;

    if (webhookSecret && signature) {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      logStep("Signature verified successfully");
    } else {
      logStep("WARNING: No webhook secret or signature, processing without verification");
      event = JSON.parse(body) as Stripe.Event;
    }

    logStep("Event type", { type: event.type });

    // Handle subscription events
    if (
      event.type === "checkout.session.completed" ||
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      let subscription: Stripe.Subscription | null = null;
      let customerEmail: string | null = null;

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        customerEmail = session.customer_email || null;

        if (!customerEmail && session.customer) {
          const customer = await stripe.customers.retrieve(session.customer as string);
          if (!customer.deleted) {
            customerEmail = customer.email;
          }
        }

        if (session.subscription) {
          subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        }

        logStep("Checkout completed", { email: customerEmail, subscriptionId: session.subscription });

        // Set old subscriptions to cancel at period end
        const cancelSubs = session.metadata?.cancel_subs;
        if (cancelSubs) {
          const subIds = cancelSubs.split(",").filter(Boolean);
          for (const oldSubId of subIds) {
            try {
              if (oldSubId !== session.subscription) {
                await stripe.subscriptions.update(oldSubId, { cancel_at_period_end: true });
                logStep("Set old subscription to cancel at period end", { oldSubId });
              }
            } catch (cancelErr) {
              logStep("Failed to update old sub (may already be canceled)", { oldSubId, error: String(cancelErr) });
            }
          }
        }
      } else {
        subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        if (!customer.deleted) {
          customerEmail = customer.email;
        }
        logStep("Subscription event", { email: customerEmail, subscriptionId: subscription.id });
      }

      if (!customerEmail) {
        logStep("No customer email found, skipping");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!subscription || (subscription.status !== "active" && subscription.status !== "trialing")) {
        logStep("No active/trialing subscription, skipping limit update", { status: subscription?.status });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
      let instanceLimit = 0;

      if (customerId) {
        instanceLimit = await calculateTotalLimit(stripe, customerId);
      }

      logStep("Calculated total instance limit", { email: customerEmail, limit: instanceLimit });

      const userProfile = await findUserByEmail(supabaseAdmin, customerEmail);

      if (userProfile) {
        const stripeCustomerId = customerId || null;
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({
            instance_limit: instanceLimit,
            is_paused: false,
            paused_at: null,
            stripe_customer_id: stripeCustomerId || null,
          })
          .eq("user_id", userProfile.user_id);

        if (updateError) {
          logStep("Error updating profile", { error: updateError.message });
          throw updateError;
        }

        logStep("Updated user instance limit", { userId: userProfile.user_id, limit: instanceLimit });
      } else {
        logStep("User not found yet, limit will be set on first login", { email: customerEmail });
      }
    }

    // Handle subscription cancellation
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;

      const customer = await stripe.customers.retrieve(customerId as string);
      if (customer.deleted) {
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const customerEmail = customer.email;

      if (customerEmail) {
        // Check remaining active/trialing subscriptions
        const remainingSubs = await stripe.subscriptions.list({ customer: customerId as string, status: "active", limit: 10 });
        const remainingTrialing = await stripe.subscriptions.list({ customer: customerId as string, status: "trialing", limit: 10 });
        const allRemaining = [...remainingSubs.data, ...remainingTrialing.data];

        const userProfile = await findUserByEmail(supabaseAdmin, customerEmail);

        if (!userProfile) {
          logStep("User not found for canceled subscription", { email: customerEmail });
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (allRemaining.length > 0) {
          logStep("Subscription deleted but customer still has active subs, recalculating", {
            email: customerEmail,
            remainingCount: allRemaining.length,
            deletedSubId: subscription.id,
          });

          const totalLimit = await calculateTotalLimit(stripe, customerId as string);

          // Check if user has more instances than new limit
          const { data: instances } = await supabaseAdmin
            .from("instances")
            .select("id")
            .eq("user_id", userProfile.user_id);

          const instanceCount = instances?.length ?? 0;
          const needsTrimming = instanceCount > totalLimit;

          await supabaseAdmin
            .from("profiles")
            .update({
              instance_limit: totalLimit,
              is_paused: false,
              paused_at: needsTrimming ? new Date().toISOString() : null,
            })
            .eq("user_id", userProfile.user_id);

          logStep("Recalculated limit from remaining subs", {
            userId: userProfile.user_id,
            totalLimit,
            instanceCount,
            needsTrimming,
          });
        } else {
          // No remaining subs - start grace period
          const { error: updateError } = await supabaseAdmin
            .from("profiles")
            .update({
              instance_limit: 0,
              is_paused: false,
              paused_at: new Date().toISOString(),
            })
            .eq("user_id", userProfile.user_id);

          if (updateError) {
            logStep("Error setting grace period", { error: updateError.message });
          } else {
            logStep("User subscription canceled, grace period started", { userId: userProfile.user_id });
          }
        }
      }
    }

    // Handle payment failures - start 3-day grace period
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;

      if (invoice.billing_reason === "subscription_cycle" || invoice.billing_reason === "subscription_update") {
        const customer = await stripe.customers.retrieve(invoice.customer as string);
        if (customer.deleted) {
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const customerEmail = customer.email;

        if (customerEmail) {
          const userProfile = await findUserByEmail(supabaseAdmin, customerEmail);

          if (userProfile) {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("paused_at, is_paused")
              .eq("user_id", userProfile.user_id)
              .maybeSingle();

            if (!profile?.paused_at) {
              const { error: updateError } = await supabaseAdmin
                .from("profiles")
                .update({
                  is_paused: false,
                  paused_at: new Date().toISOString(),
                })
                .eq("user_id", userProfile.user_id);

              if (updateError) {
                logStep("Error setting grace period", { error: updateError.message });
              } else {
                logStep("Payment failed, grace period started (3 days)", { userId: userProfile.user_id, email: customerEmail });
              }
            } else {
              logStep("Payment failed again, grace period already active", { userId: userProfile.user_id, paused_at: profile.paused_at });
            }
          }
        }
      }
    }

    // Handle successful payment (reactivate if was paused)
    if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;

      const customer = await stripe.customers.retrieve(invoice.customer as string);
      if (customer.deleted) {
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const customerEmail = customer.email;

      if (customerEmail) {
        const userProfile = await findUserByEmail(supabaseAdmin, customerEmail);

        if (userProfile) {
          const { error: updateError } = await supabaseAdmin
            .from("profiles")
            .update({
              is_paused: false,
              paused_at: null,
            })
            .eq("user_id", userProfile.user_id);

          if (updateError) {
            logStep("Error reactivating user after payment", { error: updateError.message });
          } else {
            logStep("Payment succeeded, account reactivated", { userId: userProfile.user_id, email: customerEmail });
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
