import type Stripe from "stripe";
import { handleStripeEvent } from "@/server/commerce";
import { env } from "@/server/env";
import { stripe } from "@/server/stripe";

export const dynamic = "force-dynamic";

/** Verifies the Stripe signature against the raw body, persists the event id, then applies idempotently. */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  if (!sig) return new Response("Missing signature", { status: 400 });
  let event: Stripe.Event;
  try {
    const secret = env.stripeWebhookSecret || env.stripeConnectWebhookSecret;
    if (!secret) return new Response("Webhook secret not configured", { status: 503 });
    try { event = stripe().webhooks.constructEvent(raw, sig, env.stripeWebhookSecret); }
    catch (e) { if (env.stripeConnectWebhookSecret) event = stripe().webhooks.constructEvent(raw, sig, env.stripeConnectWebhookSecret); else throw e; }
  } catch (e) {
    return new Response(`Invalid signature: ${(e as Error).message}`, { status: 400 });
  }
  if (event.livemode !== env.stripeApiKey.startsWith("sk_live_")) return new Response("Mode mismatch", { status: 400 });
  try {
    const r = await handleStripeEvent(event);
    return Response.json({ received: true, result: r });
  } catch (e) {
    // Durable enqueue failed → 500 so Stripe retries.
    return new Response((e as Error).message, { status: 500 });
  }
}
