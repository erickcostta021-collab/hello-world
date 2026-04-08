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
      // Verify webhook signature
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

        // Get customer email if not in session
        if (!customerEmail && session.customer) {
          const customer = await stripe.customers.retrieve(session.customer as string);
          if (!customer.deleted) {
            customerEmail = customer.email;
          }
        }

        // Get subscription details
        if (session.subscription) {
          subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        }

        logStep("Checkout completed", { email: customerEmail, subscriptionId: session.subscription });
      } else {
        subscription = event.data.object as Stripe.Subscription;
        
        // Get customer email
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

      if (!subscription || subscription.status !== "active") {
        logStep("No active subscription, skipping limit update");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Calculate instance limit from subscription
      let instanceLimit = 0;
      for (const item of subscription.items.data) {
        const priceId = item.price.id;
        const quantity = item.quantity || 1;

        if (priceId === FLEXIBLE_PRICE_ID) {
          // Flexible plan with fixed price ID: limit = quantity
          instanceLimit += quantity;
        } else if (PRICE_TO_LIMIT[priceId]) {
          // Fixed plans: use predefined limit
          instanceLimit += PRICE_TO_LIMIT[priceId];
        } else {
          // Inline price_data (flexible upgrade/downgrade) — detect by product name or unit_amount
          const unitAmount = item.price.unit_amount || 0;
          const FLEXIBLE_AMOUNTS = [0, 2900, 4900, 7500, 9900, 12500, 14900, 17500, 19900, 22500, 24900];
          const flexIdx = FLEXIBLE_AMOUNTS.indexOf(unitAmount);
          if (flexIdx > 0) {
            instanceLimit += flexIdx;
            logStep("Detected inline flexible price", { unitAmount, instances: flexIdx });
          } else {
            // Try to expand product and check name
            try {
              const product = await stripe.products.retrieve(item.price.product as string);
              if (product.name?.includes("Flexível")) {
                // Parse quantity from name like "Plano Flexível - 3 Instâncias"
                const match = product.name.match(/(\d+)\s*Inst/i);
                if (match) {
                  instanceLimit += parseInt(match[1], 10);
                  logStep("Detected flexible from product name", { name: product.name, instances: match[1] });
                }
              }
            } catch {
              logStep("Unknown price, skipping", { priceId, unitAmount });
            }
          }
        }
      }

      logStep("Calculated instance limit", { email: customerEmail, limit: instanceLimit });

      // Find user by email and update their profile
      const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        logStep("Error listing users", { error: listError.message });
        throw listError;
      }

      const user = users.users.find(
        (u) => u.email?.toLowerCase() === customerEmail?.toLowerCase()
      );

      if (user) {
        // Update existing user's instance limit and clear any grace period
        const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({ 
            instance_limit: instanceLimit,
            is_paused: false,
            paused_at: null,
            stripe_customer_id: stripeCustomerId || null,
          })
          .eq("user_id", user.id);

        if (updateError) {
          logStep("Error updating profile", { error: updateError.message });
          throw updateError;
        }

        logStep("Updated user instance limit", { userId: user.id, limit: instanceLimit });
      } else {
        logStep("User not found yet, limit will be set on first login", { email: customerEmail });
        // Store pending limit in metadata or handle on user creation
      }
    }

    // Handle subscription cancellation
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      
      const customer = await stripe.customers.retrieve(subscription.customer as string);
      if (customer.deleted) {
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const customerEmail = customer.email;
      
      if (customerEmail) {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const user = users?.users.find(
          (u) => u.email?.toLowerCase() === customerEmail.toLowerCase()
        );

        if (user) {
          // Set limit to 0 and pause account
          const { error: updateError } = await supabaseAdmin
            .from("profiles")
            .update({ 
              instance_limit: 0,
              is_paused: true,
              paused_at: new Date().toISOString()
            })
            .eq("user_id", user.id);

          if (updateError) {
            logStep("Error pausing user", { error: updateError.message });
          } else {
            logStep("User subscription canceled, account paused", { userId: user.id });
          }
        }
      }
    }

    // Handle payment failures - start 3-day grace period instead of immediate pause
    // Support multiple event name variations
    if (
      event.type === "invoice.payment_failed" ||
      event.type === "invoice.payment.failed" ||
      event.type === "payment_intent.payment_failed"
    ) {
      const invoice = event.data.object as Stripe.Invoice;
      
      // Only start grace period if this is a subscription payment (not initial)
      if (invoice.billing_reason === "subscription_cycle" || invoice.billing_reason === "subscription_update") {
        const customer = await stripe.customers.retrieve(invoice.customer as string);
        if (customer.deleted) {
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const customerEmail = customer.email;
        
        if (customerEmail) {
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const user = users?.users.find(
            (u) => u.email?.toLowerCase() === customerEmail.toLowerCase()
          );

          if (user) {
            // Check if already in grace period (don't overwrite paused_at)
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("paused_at, is_paused")
              .eq("user_id", user.id)
              .maybeSingle();

            if (!profile?.paused_at) {
              // Start 3-day grace period: set paused_at but keep is_paused = false
              const { error: updateError } = await supabaseAdmin
                .from("profiles")
                .update({ 
                  is_paused: false,
                  paused_at: new Date().toISOString()
                })
                .eq("user_id", user.id);

              if (updateError) {
                logStep("Error setting grace period", { error: updateError.message });
              } else {
                logStep("Payment failed, grace period started (3 days)", { userId: user.id, email: customerEmail });
              }
            } else {
              logStep("Payment failed again, grace period already active", { userId: user.id, paused_at: profile.paused_at });
            }
          }
        }
      }
    }

    // Handle successful payment (reactivate if was paused)
    // Support multiple event name variations from Stripe
    if (
      event.type === "invoice.payment_succeeded" ||
      event.type === "invoice.paid" ||
      event.type === "invoice.payment.paid" ||
      event.type === "invoice_payment.paid"
    ) {
      const invoice = event.data.object as Stripe.Invoice;
      
      const customer = await stripe.customers.retrieve(invoice.customer as string);
      if (customer.deleted) {
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const customerEmail = customer.email;
      
      if (customerEmail) {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const user = users?.users.find(
          (u) => u.email?.toLowerCase() === customerEmail.toLowerCase()
        );

        if (user) {
          // Reactivate account after successful payment
          const { error: updateError } = await supabaseAdmin
            .from("profiles")
            .update({ 
              is_paused: false,
              paused_at: null
            })
            .eq("user_id", user.id);

          if (updateError) {
            logStep("Error reactivating user after payment", { error: updateError.message });
          } else {
            logStep("Payment succeeded, account reactivated", { userId: user.id, email: customerEmail });
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
