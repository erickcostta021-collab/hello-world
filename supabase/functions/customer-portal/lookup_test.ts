import Stripe from "https://esm.sh/stripe@18.5.0";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("lookup eduardo stripe customer", async () => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" as any });
  const customers = await stripe.customers.list({ email: "eduardo@controlgestao.com.br", limit: 1 });
  const id = customers.data.length > 0 ? customers.data[0].id : "NOT_FOUND";
  // Force the ID into assertion output
  assertEquals(id, "SHOW_ME", `Stripe customer ID: ${id}`);
});
