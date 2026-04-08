import Stripe from "https://esm.sh/stripe@18.5.0";

Deno.test("lookup eduardo stripe customer", async () => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" as any });
  const customers = await stripe.customers.list({ email: "eduardo@controlgestao.com.br", limit: 1 });
  if (customers.data.length > 0) {
    console.log("FOUND CUSTOMER:", customers.data[0].id, customers.data[0].name);
  } else {
    console.log("NO CUSTOMER FOUND");
  }
});
