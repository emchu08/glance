/**
 * Seeds the sandbox: Glance Demo Market as a Stripe Connect account (test mode, fully verified
 * with Stripe's documented test data), its catalog, and one disclosed sandbox campaign.
 * Re-runnable. Requires STRIPE_API_KEY (sk_test_…) and SUPABASE_SECRET_KEY.
 *
 *   npm run seed:sandbox
 */
import { readFileSync, existsSync } from "node:fs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { DEMO_CATALOG, DEMO_MERCHANT_ID, DEMO_MERCHANT_NAME, DEFAULT_COMMISSION_BPS, COMMISSION_AGREEMENT_VERSION } from "../src/data/merchant.ts";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const stripeKey = process.env.STRIPE_API_KEY ?? "";
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const sbKey = process.env.SUPABASE_SECRET_KEY ?? "";
if (!stripeKey.startsWith("sk_test_")) { console.error("Refusing to seed: STRIPE_API_KEY must be a sandbox key (sk_test_…)"); process.exit(1); }
if (!sbUrl || !sbKey) { console.error("Supabase URL/secret key missing"); process.exit(1); }

const stripe = new Stripe(stripeKey);
const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });

async function ensureConnectedAccount(): Promise<{ id: string; chargesEnabled: boolean; payoutsEnabled: boolean; model: "destination" | "platform"; note: string }> {
  const { data: existing } = await sb.from("merchants").select("stripe_account_id").eq("id", DEMO_MERCHANT_ID).maybeSingle();
  let accountId = existing?.stripe_account_id ?? null;
  if (accountId) {
    try {
      const a = await stripe.accounts.retrieve(accountId);
      return { id: a.id, chargesEnabled: !!a.charges_enabled, payoutsEnabled: !!a.payouts_enabled, model: a.charges_enabled ? "destination" : "platform", note: "existing account" };
    } catch { accountId = null; }
  }
  try {
    // Custom account with Stripe's documented test identity values so transfers/card_payments activate in test mode.
    const acct = await stripe.accounts.create({
      type: "custom",
      country: "US",
      email: "demo-market@glance.example",
      business_type: "individual",
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { name: DEMO_MERCHANT_NAME, mcc: "5399", url: "https://github.com/emchu08/glance", product_description: "Demo merchandise with simulated fulfillment (sandbox)" },
      individual: { first_name: "Demo", last_name: "Market", email: "demo-market@glance.example", phone: "0000000000", dob: { day: 1, month: 1, year: 1901 }, ssn_last_4: "0000", id_number: "000000000", address: { line1: "address_full_match", city: "Seattle", state: "WA", postal_code: "98105", country: "US" } },
      tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" },
      external_account: { object: "bank_account", country: "US", currency: "usd", routing_number: "110000000", account_number: "000123456789" },
      settings: { payouts: { schedule: { interval: "manual" } } },
      metadata: { glance_merchant_id: DEMO_MERCHANT_ID, sandbox: "true" },
    });
    // Capabilities may take a moment; poll briefly.
    let a = acct;
    for (let i = 0; i < 6 && !a.charges_enabled; i += 1) { await new Promise((r) => setTimeout(r, 1500)); a = await stripe.accounts.retrieve(acct.id); }
    return { id: a.id, chargesEnabled: !!a.charges_enabled, payoutsEnabled: !!a.payouts_enabled, model: a.charges_enabled ? "destination" : "platform", note: a.charges_enabled ? "custom account verified with test data" : `created; requirements pending: ${(a.requirements?.currently_due ?? []).join(", ") || "none listed"}` };
  } catch (e) {
    const msg = (e as Error).message;
    return { id: "", chargesEnabled: false, payoutsEnabled: false, model: "platform", note: `Connect account creation failed (${msg}); falling back to platform-managed commission ledger` };
  }
}

async function main() {
  const acct = await ensureConnectedAccount();
  await sb.from("merchants").upsert({
    id: DEMO_MERCHANT_ID, name: DEMO_MERCHANT_NAME, stripe_account_id: acct.id || null, charges_enabled: acct.chargesEnabled, payouts_enabled: acct.payoutsEnabled,
    charge_model: acct.model, commission_bps: Number(process.env.GLANCE_COMMISSION_BPS ?? DEFAULT_COMMISSION_BPS), agreement_version: COMMISSION_AGREEMENT_VERSION, fulfillment_adapter: "simulated", sandbox: true,
  }, { onConflict: "id" });
  await sb.from("merchant_catalog").upsert(DEMO_CATALOG.map((i) => ({ merchant_id: i.merchantId, sku: i.sku, name: i.name, description: i.description, unit_price_cents: i.unitPriceCents, currency: i.currency, stock: i.stock, active: true })), { onConflict: "merchant_id,sku" });

  // Sandbox advertiser + one disclosed CPC campaign for the gray tote (labeled test ledger entries only).
  const { data: adv } = await sb.from("advertisers").upsert({ id: "00000000-0000-4000-8000-00000000ad01", name: "Glance Demo Market (sandbox advertiser)", sandbox: true }, { onConflict: "id" }).select("id").single();
  await sb.from("campaigns").upsert({
    id: "camp_demo_tote", advertiser_id: adv!.id, model: "cpc", cpc_cents: 35, budget_cents: 2000, currency: "USD", ends_at: new Date(Date.now() + 90 * 86400_000).toISOString(), status: "active",
    markets: ["US"], categories: ["bags"], merchant_id: DEMO_MERCHANT_ID, sku: "demo-gray-tote", query_terms: ["tote", "bag", "backpack"], title: "Gray canvas tote · demo merchandise", agreement_ref: "sandbox-ads-2026-10-v1",
  }, { onConflict: "id" });

  console.log(JSON.stringify({ merchant: DEMO_MERCHANT_ID, stripeAccount: acct.id || null, chargesEnabled: acct.chargesEnabled, payoutsEnabled: acct.payoutsEnabled, chargeModel: acct.model, note: acct.note, catalog: DEMO_CATALOG.length, campaign: "camp_demo_tote" }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
