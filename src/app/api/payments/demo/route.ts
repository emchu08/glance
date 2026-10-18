import { z } from "zod";
import { env } from "@/server/env";
import { assertSameOrigin, clientKey, errorResponse, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/relay";
import { stripe } from "@/server/stripe";
import { HttpError } from "@/server/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  offerId: z.string().min(1).max(500),
  name: z.string().min(1).max(200),
  retailer: z.string().min(1).max(120),
  // Stripe's minimum charge is $0.50; a demo never needs more than $5,000.
  priceCents: z.number().int().min(50).max(500_000),
  attemptKey: z.string().min(8).max(200),
});

/**
 * Buy on the glasses with Stripe's test card (Visa •• 4242): no sign-in, no saved card, no phone.
 * Test mode only; with a live key this refuses, so no real money can move. A repeated tap with the
 * same attempt key returns the same PaymentIntent.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!env.stripeApiKey.startsWith("sk_test_")) throw new HttpError(503, "Demo payments need a Stripe test key", "demo_unavailable");
    if (!(await rateLimit(`demo-pay:${clientKey(req)}`, 30, 10 * 60_000))) throw new HttpError(429, "Too many demo payments. Try again in a few minutes.", "rate_limited");
    const body = await readJson(req, Body);
    const pi = await stripe().paymentIntents.create(
      {
        amount: body.priceCents,
        currency: "usd",
        payment_method: "pm_card_visa",
        allowed_payment_method_types: ["card"],
        confirm: true,
        description: `Glance demo: ${body.name} (${body.retailer})`.slice(0, 500),
        metadata: { source: "glance-demo", offer_id: body.offerId.slice(0, 500), retailer: body.retailer },
      },
      { idempotencyKey: `glance-demo:${body.attemptKey}` },
    );
    return json({
      status: pi.status,
      id: pi.id,
      reference: pi.id.slice(-8).toUpperCase(),
      totalCents: pi.amount,
      card: "Visa •• 4242",
      createdAt: new Date(pi.created * 1000).toISOString(),
    });
  } catch (e) {
    // A declined test charge is a payment result, not a server failure.
    const card = e as { type?: string; message?: string };
    if (card?.type === "StripeCardError") return json({ status: "failed", error: card.message ?? "Card declined" }, 402);
    return errorResponse(e);
  }
}
