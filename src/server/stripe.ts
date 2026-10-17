import "server-only";

import Stripe from "stripe";
import { assertSandboxOrEnabledLive, env } from "./env";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    if (!env.stripeApiKey) throw new Error("Stripe is not configured");
    assertSandboxOrEnabledLive();
    client = new Stripe(env.stripeApiKey, { appInfo: { name: "Glance", version: "0.1.0", url: "https://github.com/emchu08/glance" } });
  }
  return client;
}

export const livemode = () => env.stripeApiKey.startsWith("sk_live_");

export function cardSummary(pm: Stripe.PaymentMethod | null | undefined): { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null } {
  const c = pm?.card;
  if (!c) return { brand: null, last4: null, expMonth: null, expYear: null };
  const brand = c.brand ? c.brand.charAt(0).toUpperCase() + c.brand.slice(1) : null;
  return { brand, last4: c.last4 ?? null, expMonth: c.exp_month ?? null, expYear: c.exp_year ?? null };
}
