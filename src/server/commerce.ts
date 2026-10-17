import "server-only";

import type Stripe from "stripe";
import { DEMO_CATALOG, DEMO_MERCHANT_ID, DEMO_MERCHANT_NAME } from "@/data/merchant";
import { applyBps } from "@/domain/money";
import { QUOTE_TTL_MS, type Quote } from "@/domain/commerce/quote";
import { evaluateRule, type PurchaseRule } from "@/domain/commerce/rules";
import { env } from "./env";
import { HttpError, makeReference, supabaseAdmin } from "./supabase";
import { cardSummary, livemode, stripe } from "./stripe";

/**
 * Server-side commerce: wallet references, quotes, orders, purchases, webhooks, commissions.
 * All amounts are integer cents. Client-supplied amounts, destinations, and fee values are never trusted.
 */

// ── Wallet ───────────────────────────────────────────────────────────────────

export interface WalletView {
  status: "signed-out" | "not-ready" | "ready";
  brand: string | null;
  last4: string | null;
  autoBuy: "off" | "on" | "paused";
  ruleSummary: string | null;
  email: string | null;
}

export async function getWalletView(userId: string, email: string | null): Promise<WalletView> {
  const sb = supabaseAdmin();
  const { data: w } = await sb.from("wallets").select("default_payment_method_id, brand, last4").eq("owner_id", userId).maybeSingle();
  const { data: rule } = await sb.from("purchase_rules").select("status, sku_allowlist, per_order_limit_cents, merchant_allowlist").eq("owner_id", userId).in("status", ["active", "paused"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return {
    status: w?.default_payment_method_id ? "ready" : "not-ready",
    brand: w?.brand ?? null,
    last4: w?.last4 ?? null,
    autoBuy: rule ? (rule.status === "active" ? "on" : "paused") : "off",
    ruleSummary: rule ? `${rule.merchant_allowlist[0] === DEMO_MERCHANT_ID ? DEMO_MERCHANT_NAME : rule.merchant_allowlist[0]} · ${rule.sku_allowlist.length} item${rule.sku_allowlist.length === 1 ? "" : "s"} · ${(rule.per_order_limit_cents / 100).toFixed(0)}/order` : null,
    email,
  };
}

export async function ensureCustomer(userId: string, email: string | null): Promise<string> {
  const sb = supabaseAdmin();
  const { data: w } = await sb.from("wallets").select("stripe_customer_id").eq("owner_id", userId).maybeSingle();
  if (w?.stripe_customer_id) return w.stripe_customer_id;
  const customer = await stripe().customers.create({ email: email ?? undefined, metadata: { glance_user_id: userId, env: env.paymentsMode } }, { idempotencyKey: `cust:${userId}` });
  await sb.from("wallets").upsert({ owner_id: userId, stripe_customer_id: customer.id }, { onConflict: "owner_id" });
  return customer.id;
}

/** Creates a SetupIntent for official Stripe card collection components (one-time setup on the companion/browser). */
export async function createSetupIntent(userId: string, email: string | null): Promise<{ clientSecret: string; customerId: string }> {
  const customerId = await ensureCustomer(userId, email);
  const si = await stripe().setupIntents.create({ customer: customerId, usage: "off_session", allowed_payment_method_types: ["card"], metadata: { glance_user_id: userId } });
  if (!si.client_secret) throw new HttpError(500, "Stripe did not return a client secret");
  return { clientSecret: si.client_secret, customerId };
}

/** Attach a payment method (from a completed SetupIntent, or Stripe's `pm_card_visa` test method in sandbox) as the default. */
export async function saveDefaultMethod(userId: string, email: string | null, paymentMethodId: string, consentVersion: string): Promise<WalletView> {
  if (livemode() && paymentMethodId.startsWith("pm_card_")) throw new HttpError(400, "Test payment methods are not allowed in live mode");
  const customerId = await ensureCustomer(userId, email);
  const s = stripe();
  let pm = await s.paymentMethods.retrieve(paymentMethodId);
  if (pm.customer && pm.customer !== customerId) throw new HttpError(403, "Payment method belongs to another customer");
  if (!pm.customer) pm = await s.paymentMethods.attach(paymentMethodId, { customer: customerId });
  await s.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
  const c = cardSummary(pm);
  await supabaseAdmin().from("wallets").upsert({ owner_id: userId, stripe_customer_id: customerId, default_payment_method_id: pm.id, brand: c.brand, last4: c.last4, exp_month: c.expMonth, exp_year: c.expYear, consent_version: consentVersion, consent_at: new Date().toISOString() }, { onConflict: "owner_id" });
  return getWalletView(userId, email);
}

export async function removeWalletMethod(userId: string): Promise<void> {
  const sb = supabaseAdmin();
  const { data: w } = await sb.from("wallets").select("default_payment_method_id").eq("owner_id", userId).maybeSingle();
  if (w?.default_payment_method_id) { try { await stripe().paymentMethods.detach(w.default_payment_method_id); } catch { /* already detached */ } }
  await sb.from("wallets").update({ default_payment_method_id: null, brand: null, last4: null, exp_month: null, exp_year: null }).eq("owner_id", userId);
  // Pausing wallet also stops new auto-buy executions promptly.
  await sb.from("purchase_rules").update({ status: "paused" }).eq("owner_id", userId).eq("status", "active");
}

// ── Merchants & quotes ───────────────────────────────────────────────────────

interface MerchantRow { id: string; name: string; stripe_account_id: string | null; charges_enabled: boolean; charge_model: "destination" | "platform"; commission_bps: number; agreement_version: string; fulfillment_adapter: string }

export async function getMerchant(id: string): Promise<MerchantRow> {
  const { data } = await supabaseAdmin().from("merchants").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "Unknown seller", "unknown_merchant");
  return data as MerchantRow;
}

export async function quoteOrder(userId: string, merchantId: string, lines: { sku: string; quantity: number }[]): Promise<Quote> {
  if (!lines.length || lines.length > 10) throw new HttpError(400, "Provide 1–10 lines", "bad_lines");
  const sb = supabaseAdmin();
  const merchant = await getMerchant(merchantId);
  const skus = lines.map((l) => l.sku);
  const { data: items } = await sb.from("merchant_catalog").select("*").eq("merchant_id", merchantId).in("sku", skus).eq("active", true);
  const qlines = lines.map((l) => {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0 || l.quantity > 20) throw new HttpError(400, "Bad quantity", "bad_quantity");
    const item = items?.find((i) => i.sku === l.sku);
    if (!item) throw new HttpError(404, `Unknown item ${l.sku}`, "unknown_sku");
    if (item.stock < l.quantity) throw new HttpError(409, `${item.name} is out of stock`, "out_of_stock");
    return { sku: item.sku, name: item.name, quantity: l.quantity, unitPriceCents: item.unit_price_cents, lineTotalCents: item.unit_price_cents * l.quantity };
  });
  const subtotal = qlines.reduce((s, l) => s + l.lineTotalCents, 0);
  const shipping = 0; // demo merchant: free shipping, disclosed before Buy
  const tax = 0;
  const commission = applyBps(subtotal, merchant.commission_bps);
  const now = Date.now();
  const version = `q_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const quote: Quote = { merchantId, currency: "USD", lines: qlines, subtotalCents: subtotal, shippingCents: shipping, taxCents: tax, totalCents: subtotal + shipping + tax, commission: { bps: merchant.commission_bps, amountCents: commission, basis: "item_subtotal", version: merchant.agreement_version }, expiresAt: now + QUOTE_TTL_MS, version };
  const { error } = await sb.from("quotes").insert({ version, owner_id: userId, merchant_id: merchantId, lines: qlines, subtotal_cents: subtotal, shipping_cents: shipping, tax_cents: tax, total_cents: quote.totalCents, currency: "USD", commission_bps: merchant.commission_bps, commission_cents: commission, expires_at: new Date(quote.expiresAt).toISOString() });
  if (error) throw new HttpError(500, error.message);
  return quote;
}

// ── Orders ───────────────────────────────────────────────────────────────────

export interface OrderView {
  id: string; merchantName: string; totalCents: number; currency: string; status: string; paymentStatus: string; fulfillmentStatus: string; createdAt: string;
  lines: { name: string; quantity: number; lineTotalCents: number }[]; reference: string; cardSummary?: string; mode?: string; commissionCents: number; merchantId: string;
}

export async function createOrder(userId: string, input: { quoteVersion: string; merchantId: string; lines: { sku: string; quantity: number }[]; mode?: string; sponsored?: { campaignId: string; token: string } | null; deviceId?: string | null }): Promise<OrderView> {
  const sb = supabaseAdmin();
  const { data: q } = await sb.from("quotes").select("*").eq("version", input.quoteVersion).eq("owner_id", userId).maybeSingle();
  if (!q) throw new HttpError(404, "Quote not found", "quote_not_found");
  if (new Date(q.expires_at).getTime() < Date.now()) throw new HttpError(409, "Quote expired. Get a fresh total.", "quote_expired");
  if (q.merchant_id !== input.merchantId) throw new HttpError(400, "Quote is for a different seller", "mixed_merchants");
  const quoted = (q.lines as Quote["lines"]).map((l) => `${l.sku}:${l.quantity}`).sort().join(",");
  const requested = input.lines.map((l) => `${l.sku}:${l.quantity}`).sort().join(",");
  if (quoted !== requested) throw new HttpError(409, "Lines changed since the quote", "quote_mismatch");

  // Reuse an existing open order for this quote (idempotent create).
  const { data: existing } = await sb.from("orders").select("id").eq("quote_version", q.version).eq("owner_id", userId).maybeSingle();
  if (existing) return getOrderView(userId, existing.id);

  const merchant = await getMerchant(q.merchant_id);
  const { data: order, error } = await sb.from("orders").insert({
    reference: makeReference(), owner_id: userId, merchant_id: q.merchant_id, quote_version: q.version, status: "created", payment_status: "pending", fulfillment_status: "pending",
    subtotal_cents: q.subtotal_cents, shipping_cents: q.shipping_cents, tax_cents: q.tax_cents, total_cents: q.total_cents, currency: q.currency,
    commission_bps: q.commission_bps, commission_cents: q.commission_cents, commission_version: merchant.agreement_version, source_mode: input.mode ?? null,
    sponsored_campaign_id: input.sponsored?.campaignId ?? null, livemode: livemode(), device_id: input.deviceId ?? null,
  }).select("id").single();
  if (error || !order) throw new HttpError(500, error?.message ?? "Could not create order");
  await sb.from("order_lines").insert((q.lines as Quote["lines"]).map((l) => ({ order_id: order.id, sku: l.sku, name: l.name, quantity: l.quantity, unit_price_cents: l.unitPriceCents, line_total_cents: l.lineTotalCents })));
  await sb.from("fulfillments").insert({ order_id: order.id, status: "pending", adapter: merchant.fulfillment_adapter });
  return getOrderView(userId, order.id);
}

export async function getOrderView(userId: string | null, orderId: string): Promise<OrderView> {
  const sb = supabaseAdmin();
  const { data: o } = await sb.from("orders").select("*, merchants(name), order_lines(name, quantity, line_total_cents)").eq("id", orderId).maybeSingle();
  if (!o || (userId && o.owner_id !== userId)) throw new HttpError(404, "Order not found", "order_not_found");
  const merchants = o.merchants as { name: string } | { name: string }[] | null;
  const merchantName = Array.isArray(merchants) ? merchants[0]?.name : merchants?.name;
  return {
    id: o.id, merchantName: merchantName ?? o.merchant_id, merchantId: o.merchant_id, totalCents: o.total_cents, currency: o.currency, status: o.status, paymentStatus: o.payment_status, fulfillmentStatus: o.fulfillment_status,
    createdAt: o.created_at, lines: (o.order_lines as { name: string; quantity: number; line_total_cents: number }[]).map((l) => ({ name: l.name, quantity: l.quantity, lineTotalCents: l.line_total_cents })),
    reference: o.reference, cardSummary: o.card_summary ?? undefined, mode: o.source_mode ?? undefined, commissionCents: o.commission_cents,
  };
}

export async function listOrders(userId: string): Promise<OrderView[]> {
  const { data } = await supabaseAdmin().from("orders").select("id").eq("owner_id", userId).order("created_at", { ascending: false }).limit(20);
  return Promise.all((data ?? []).map((o) => getOrderView(userId, o.id)));
}

// ── Purchase ─────────────────────────────────────────────────────────────────

export interface PurchaseResult { status: "succeeded" | "processing" | "requires_action" | "failed"; order: OrderView; clientSecret?: string }

/**
 * Deliberate Buy (or matching auto-buy rule) → PaymentIntent confirmed with the saved method.
 * One active attempt per order/attemptKey (unique constraint); lost responses reconcile instead of re-charging.
 */
export async function purchaseOrder(userId: string, orderId: string, attemptKey: string, opts: { instruction: "buy" | "rule"; ruleId?: string; confidence?: number } = { instruction: "buy" }): Promise<PurchaseResult> {
  const sb = supabaseAdmin();
  const s = stripe();
  const { data: o } = await sb.from("orders").select("*").eq("id", orderId).eq("owner_id", userId).maybeSingle();
  if (!o) throw new HttpError(404, "Order not found", "order_not_found");
  if (o.livemode !== livemode()) throw new HttpError(409, "Order was created in a different Stripe mode", "livemode_mismatch");
  if (o.payment_status === "succeeded") return { status: "succeeded", order: await getOrderView(userId, orderId) };

  const { data: w } = await sb.from("wallets").select("*").eq("owner_id", userId).maybeSingle();
  if (!w?.default_payment_method_id || !w.stripe_customer_id) throw new HttpError(409, "No saved card. Set up your wallet first.", "wallet_not_ready");

  // Quote must still be valid at purchase time.
  const { data: q } = await sb.from("quotes").select("expires_at, total_cents").eq("version", o.quote_version).maybeSingle();
  if (!q || new Date(q.expires_at).getTime() < Date.now()) throw new HttpError(409, "Quote expired. Get a fresh total.", "quote_expired");
  if (q.total_cents !== o.total_cents) throw new HttpError(409, "Total changed. Review the new total.", "amount_changed");

  // Re-validate stock at execution time.
  const { data: lines } = await sb.from("order_lines").select("sku, quantity").eq("order_id", orderId);
  for (const l of lines ?? []) {
    const { data: item } = await sb.from("merchant_catalog").select("stock, active").eq("merchant_id", o.merchant_id).eq("sku", l.sku).maybeSingle();
    if (!item?.active || item.stock < l.quantity) throw new HttpError(409, "Item is no longer available", "out_of_stock");
  }

  // Idempotent attempt record: a repeated tap with the same key reuses the same PaymentIntent.
  const { data: attempt, error: attemptErr } = await sb.from("payment_attempts").insert({ order_id: orderId, owner_id: userId, attempt_key: attemptKey, status: "created" }).select("id").single();
  if (attemptErr) {
    const { data: prior } = await sb.from("payment_attempts").select("stripe_payment_intent_id").eq("order_id", orderId).eq("attempt_key", attemptKey).maybeSingle();
    if (prior?.stripe_payment_intent_id) {
      const pi = await s.paymentIntents.retrieve(prior.stripe_payment_intent_id);
      return finalizeFromIntent(userId, orderId, pi);
    }
    throw new HttpError(409, "A payment for this order is already in progress", "attempt_in_progress");
  }

  // Auto-buy authorization: validate rule + reserve budget atomically.
  let reserved = false;
  if (opts.instruction === "rule") {
    if (!opts.ruleId) throw new HttpError(400, "Rule id required", "rule_required");
    const { data: rule } = await sb.from("purchase_rules").select("*").eq("id", opts.ruleId).eq("owner_id", userId).maybeSingle();
    if (!rule) throw new HttpError(404, "Rule not found", "rule_not_found");
    const pr: PurchaseRule = { id: rule.id, version: rule.version, status: rule.status, merchantAllowlist: rule.merchant_allowlist, skuAllowlist: rule.sku_allowlist, maxQuantity: rule.max_quantity, perOrderLimitCents: rule.per_order_limit_cents, cumulativeLimitCents: rule.cumulative_limit_cents, spentCents: rule.spent_cents, reservedCents: rule.reserved_cents, currency: "USD", expiresAt: new Date(rule.expires_at).getTime(), minConfidence: Number(rule.min_confidence) };
    const first = lines?.[0];
    const decision = evaluateRule(pr, { merchantId: o.merchant_id, sku: first?.sku ?? "", quantity: first?.quantity ?? 1, totalCents: o.total_cents, currency: o.currency, confidence: opts.confidence ?? 0, exactVariant: true });
    if (!decision.ok) { await sb.from("rule_events").insert({ rule_id: rule.id, owner_id: userId, kind: "rejected", order_id: orderId, detail: { reason: decision.reason } }); throw new HttpError(403, decision.reason, "rule_rejected"); }
    const { data: ok } = await sb.rpc("reserve_rule_budget", { p_rule_id: rule.id, p_amount: o.total_cents, p_order_id: orderId });
    if (!ok) throw new HttpError(409, "Auto-buy budget exhausted", "budget_exhausted");
    reserved = true;
    await sb.from("orders").update({ rule_id: rule.id }).eq("id", orderId);
  }

  const merchant = await getMerchant(o.merchant_id);
  const useDestination = merchant.charge_model === "destination" && !!merchant.stripe_account_id && merchant.charges_enabled;
  const params: Stripe.PaymentIntentCreateParams = {
    amount: o.total_cents,
    currency: o.currency.toLowerCase(),
    customer: w.stripe_customer_id,
    payment_method: w.default_payment_method_id,
    confirm: true,
    off_session: opts.instruction === "rule" ? true : false, // present wearer → on-session; delegated rule → off-session
    allowed_payment_method_types: ["card"],
    description: `Glance order ${o.reference} · ${merchant.name}`,
    metadata: { glance_order_id: orderId, glance_user_id: userId, merchant_id: o.merchant_id, commission_cents: String(o.commission_cents), commission_version: o.commission_version, instruction: opts.instruction },
    ...(useDestination ? { application_fee_amount: o.commission_cents, transfer_data: { destination: merchant.stripe_account_id! } } : {}),
  };
  await sb.from("orders").update({ status: "paying", payment_status: "processing" }).eq("id", orderId);
  let pi: Stripe.PaymentIntent;
  try {
    pi = await s.paymentIntents.create(params, { idempotencyKey: `pi:${orderId}:${attemptKey}` });
  } catch (e) {
    const err = e as Stripe.errors.StripeError & { payment_intent?: Stripe.PaymentIntent };
    if (err.payment_intent) pi = err.payment_intent;
    else {
      await sb.from("payment_attempts").update({ status: "failed", error: err.message }).eq("id", attempt.id);
      await sb.from("orders").update({ status: "failed", payment_status: "failed" }).eq("id", orderId);
      if (reserved && opts.ruleId) await sb.rpc("settle_rule_reservation", { p_rule_id: opts.ruleId, p_amount: o.total_cents, p_order_id: orderId, p_consume: false });
      throw new HttpError(402, err.message ?? "Payment failed", err.code ?? "payment_failed");
    }
  }
  await sb.from("payment_attempts").update({ stripe_payment_intent_id: pi.id, status: pi.status }).eq("id", attempt.id);
  await sb.from("orders").update({ stripe_payment_intent_id: pi.id, card_summary: `${w.brand ?? "Card"} •• ${w.last4 ?? "····"}` }).eq("id", orderId);
  return finalizeFromIntent(userId, orderId, pi);
}

async function finalizeFromIntent(userId: string, orderId: string, pi: Stripe.PaymentIntent): Promise<PurchaseResult> {
  await applyIntentState(orderId, pi, "api");
  const order = await getOrderView(userId, orderId);
  if (pi.status === "succeeded") return { status: "succeeded", order };
  if (pi.status === "requires_action" || pi.status === "requires_confirmation") return { status: "requires_action", order, clientSecret: pi.client_secret ?? undefined };
  if (pi.status === "processing" || pi.status === "requires_capture") return { status: "processing", order };
  return { status: "failed", order };
}

/** Apply a PaymentIntent state to the order idempotently. Called from the API result and from verified webhooks. */
export async function applyIntentState(orderId: string, pi: Stripe.PaymentIntent, source: "api" | "webhook"): Promise<void> {
  const sb = supabaseAdmin();
  const { data: o } = await sb.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!o) return;
  if (o.payment_status === "succeeded" && pi.status !== "succeeded") return; // never regress a verified success
  const map: Record<string, { payment: string; status: string }> = {
    succeeded: { payment: "succeeded", status: "paid" },
    processing: { payment: "processing", status: "paying" },
    requires_action: { payment: "requires_action", status: "paying" },
    requires_confirmation: { payment: "requires_action", status: "paying" },
    requires_payment_method: { payment: "failed", status: "failed" },
    canceled: { payment: "canceled", status: "canceled" },
  };
  const m = map[pi.status] ?? { payment: "processing", status: "paying" };
  await sb.from("orders").update({ payment_status: m.payment, status: o.fulfillment_status === "accepted" && m.payment === "succeeded" ? "accepted" : m.status, stripe_payment_intent_id: pi.id }).eq("id", orderId);
  await sb.from("payment_attempts").update({ status: pi.status, error: pi.last_payment_error?.message ?? null }).eq("stripe_payment_intent_id", pi.id);

  if (m.payment === "succeeded" && o.payment_status !== "succeeded") {
    await bookCommission(orderId, pi);
    if (o.rule_id) await sb.rpc("settle_rule_reservation", { p_rule_id: o.rule_id, p_amount: o.total_cents, p_order_id: orderId, p_consume: true });
    await sb.from("outbox").insert({ kind: "fulfill", payload: { orderId } });
    // Simulated merchant adapter accepts immediately; real adapters would be driven by the outbox worker.
    await runFulfillment(orderId);
    if (o.sponsored_campaign_id) await sb.from("outbox").insert({ kind: "ad-conversion", payload: { orderId, campaignId: o.sponsored_campaign_id } });
  }
  if ((m.payment === "failed" || m.payment === "canceled") && o.rule_id && o.payment_status !== "succeeded") {
    await sb.rpc("settle_rule_reservation", { p_rule_id: o.rule_id, p_amount: o.total_cents, p_order_id: orderId, p_consume: false });
  }
  void source;
}

async function bookCommission(orderId: string, pi: Stripe.PaymentIntent): Promise<void> {
  const sb = supabaseAdmin();
  const { data: o } = await sb.from("orders").select("merchant_id, commission_cents, total_cents, commission_version, commission_bps").eq("id", orderId).maybeSingle();
  if (!o) return;
  const destination = !!pi.transfer_data?.destination;
  let processorFee: number | null = null;
  try {
    const charge = typeof pi.latest_charge === "string" ? await stripe().charges.retrieve(pi.latest_charge, { expand: ["balance_transaction"] }) : null;
    const bt = charge?.balance_transaction;
    if (bt && typeof bt === "object") processorFee = bt.fee;
  } catch { /* fee details are informational */ }
  const entries = [
    { order_id: orderId, merchant_id: o.merchant_id, kind: "commission", amount_cents: o.commission_cents, idempotency_key: `commission:${orderId}`, detail: { bps: o.commission_bps, basis: "item_subtotal", version: o.commission_version, chargeModel: destination ? "destination" : "platform", applicationFee: destination ? o.commission_cents : null } },
    { order_id: orderId, merchant_id: o.merchant_id, kind: "merchant_proceeds", amount_cents: o.total_cents - o.commission_cents, idempotency_key: `proceeds:${orderId}`, detail: { transferDestination: pi.transfer_data?.destination ?? null, note: destination ? "transferred via destination charge" : "payable to merchant; platform-managed ledger" } },
    ...(processorFee !== null ? [{ order_id: orderId, merchant_id: o.merchant_id, kind: "processor_fee", amount_cents: processorFee, idempotency_key: `fee:${orderId}`, detail: { source: "balance_transaction" } }] : []),
  ].map((e) => ({ ...e, currency: "USD", sandbox: !livemode() }));
  await sb.from("ledger_entries").upsert(entries, { onConflict: "idempotency_key", ignoreDuplicates: true });
}

/** Simulated fulfillment adapter: accepts paid orders and decrements demo stock. Idempotent. */
export async function runFulfillment(orderId: string): Promise<void> {
  const sb = supabaseAdmin();
  const { data: o } = await sb.from("orders").select("payment_status, fulfillment_status, merchant_id").eq("id", orderId).maybeSingle();
  if (!o || o.payment_status !== "succeeded" || o.fulfillment_status !== "pending") return;
  const { data: lines } = await sb.from("order_lines").select("sku, quantity").eq("order_id", orderId);
  for (const l of lines ?? []) {
    const { data: item } = await sb.from("merchant_catalog").select("stock").eq("merchant_id", o.merchant_id).eq("sku", l.sku).maybeSingle();
    if (item) await sb.from("merchant_catalog").update({ stock: Math.max(0, item.stock - l.quantity) }).eq("merchant_id", o.merchant_id).eq("sku", l.sku);
  }
  await sb.from("fulfillments").update({ status: "accepted", merchant_ref: `SIM-${orderId.slice(0, 8).toUpperCase()}`, detail: { simulated: true, acceptedAt: new Date().toISOString() } }).eq("order_id", orderId);
  await sb.from("orders").update({ fulfillment_status: "accepted", status: "accepted" }).eq("id", orderId);
  await sb.from("outbox").update({ done_at: new Date().toISOString() }).eq("kind", "fulfill").contains("payload", { orderId });
}

/** Full or partial refund with application-fee refund; idempotent per order+amount. */
export async function refundOrder(orderId: string, amountCents?: number): Promise<void> {
  const sb = supabaseAdmin();
  const { data: o } = await sb.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!o?.stripe_payment_intent_id || o.payment_status !== "succeeded") throw new HttpError(409, "Order is not refundable", "not_refundable");
  const amount = amountCents ?? o.total_cents;
  const refund = await stripe().refunds.create({ payment_intent: o.stripe_payment_intent_id, amount, refund_application_fee: true, reverse_transfer: true }, { idempotencyKey: `refund:${orderId}:${amount}` });
  const feeRefund = Math.round((o.commission_cents * amount) / o.total_cents);
  await sb.from("refunds").upsert({ order_id: orderId, stripe_refund_id: refund.id, amount_cents: amount, fee_refund_cents: feeRefund, status: refund.status ?? "pending" }, { onConflict: "stripe_refund_id" });
  await sb.from("ledger_entries").upsert([
    { order_id: orderId, merchant_id: o.merchant_id, kind: "refund", amount_cents: -amount, currency: "USD", sandbox: !livemode(), idempotency_key: `refund:${refund.id}` },
    { order_id: orderId, merchant_id: o.merchant_id, kind: "fee_reversal", amount_cents: -feeRefund, currency: "USD", sandbox: !livemode(), idempotency_key: `feerev:${refund.id}` },
  ], { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (amount >= o.total_cents) await sb.from("orders").update({ payment_status: "refunded", status: "refunded", fulfillment_status: "canceled" }).eq("id", orderId);
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

/** Persist event id first (dedupe), then apply. Out-of-order events cannot regress a verified success. */
export async function handleStripeEvent(event: Stripe.Event): Promise<"processed" | "duplicate" | "ignored"> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("provider_events").insert({ id: event.id, provider: "stripe", type: event.type, payload: { livemode: event.livemode, created: event.created } });
  if (error) return "duplicate";
  const obj = event.data.object as Stripe.PaymentIntent | Stripe.Charge | Stripe.Account | Stripe.Dispute | Stripe.Refund;
  switch (event.type) {
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed":
    case "payment_intent.requires_action":
    case "payment_intent.processing":
    case "payment_intent.canceled": {
      const pi = obj as Stripe.PaymentIntent;
      const orderId = pi.metadata?.glance_order_id;
      if (orderId) await applyIntentState(orderId, pi, "webhook");
      break;
    }
    case "charge.refunded": {
      const ch = obj as Stripe.Charge;
      const piId = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
      if (piId) {
        const { data: o } = await sb.from("orders").select("id, total_cents").eq("stripe_payment_intent_id", piId).maybeSingle();
        if (o && ch.amount_refunded >= o.total_cents) await sb.from("orders").update({ payment_status: "refunded", status: "refunded", fulfillment_status: "canceled" }).eq("id", o.id);
      }
      break;
    }
    case "charge.dispute.created": {
      const d = obj as Stripe.Dispute;
      const piId = typeof d.payment_intent === "string" ? d.payment_intent : d.payment_intent?.id;
      if (piId) {
        const { data: o } = await sb.from("orders").select("id, merchant_id").eq("stripe_payment_intent_id", piId).maybeSingle();
        if (o) await sb.from("ledger_entries").upsert({ order_id: o.id, merchant_id: o.merchant_id, kind: "ad_adjustment", amount_cents: 0, currency: "USD", sandbox: !livemode(), idempotency_key: `dispute:${d.id}`, detail: { dispute: d.id, status: d.status, note: "dispute opened; commission at risk" } }, { onConflict: "idempotency_key", ignoreDuplicates: true });
      }
      break;
    }
    case "account.updated": {
      const a = obj as Stripe.Account;
      await sb.from("merchants").update({ charges_enabled: !!a.charges_enabled, payouts_enabled: !!a.payouts_enabled }).eq("stripe_account_id", a.id);
      break;
    }
    default:
      await sb.from("provider_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
      return "ignored";
  }
  await sb.from("provider_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
  return "processed";
}

// ── Reconciliation (bounded polling fallback when webhooks are delayed) ──────

export async function reconcileOrder(userId: string, orderId: string): Promise<OrderView> {
  const sb = supabaseAdmin();
  const { data: o } = await sb.from("orders").select("stripe_payment_intent_id, payment_status, owner_id, updated_at").eq("id", orderId).maybeSingle();
  if (!o || o.owner_id !== userId) throw new HttpError(404, "Order not found", "order_not_found");
  if (o.stripe_payment_intent_id && (o.payment_status === "processing" || o.payment_status === "requires_action" || o.payment_status === "pending")) {
    const pi = await stripe().paymentIntents.retrieve(o.stripe_payment_intent_id);
    await applyIntentState(orderId, pi, "api");
  }
  return getOrderView(userId, orderId);
}

// ── Purchase rules ───────────────────────────────────────────────────────────

export async function pauseRules(userId: string, pause: boolean): Promise<void> {
  const sb = supabaseAdmin();
  const { data: rules } = await sb.from("purchase_rules").select("id, status").eq("owner_id", userId).in("status", ["active", "paused"]);
  for (const r of rules ?? []) {
    const next = pause ? "paused" : "active";
    if (r.status === next) continue;
    await sb.from("purchase_rules").update({ status: next }).eq("id", r.id);
    await sb.from("rule_events").insert({ rule_id: r.id, owner_id: userId, kind: pause ? "paused" : "resumed" });
  }
}

export async function createRule(userId: string, input: { merchantId: string; skus: string[]; perOrderLimitCents: number; cumulativeLimitCents: number; maxQuantity: number; expiresInDays: number; terms: Record<string, unknown> }): Promise<string> {
  const sb = supabaseAdmin();
  const { data: w } = await sb.from("wallets").select("default_payment_method_id").eq("owner_id", userId).maybeSingle();
  if (!w?.default_payment_method_id) throw new HttpError(409, "Set up a saved card before enabling Auto-buy", "wallet_not_ready");
  await getMerchant(input.merchantId);
  if (!input.skus.length || input.perOrderLimitCents <= 0 || input.cumulativeLimitCents < input.perOrderLimitCents) throw new HttpError(400, "Invalid rule", "bad_rule");
  // Only one active rule set at a time: supersede by revoking previous versions.
  await sb.from("purchase_rules").update({ status: "revoked" }).eq("owner_id", userId).in("status", ["active", "paused"]);
  const { data, error } = await sb.from("purchase_rules").insert({ owner_id: userId, merchant_allowlist: [input.merchantId], sku_allowlist: input.skus, max_quantity: input.maxQuantity, per_order_limit_cents: input.perOrderLimitCents, cumulative_limit_cents: input.cumulativeLimitCents, payment_method_id: w.default_payment_method_id, terms: { ...input.terms, consentVersion: "autobuy-2026-10-v1" }, expires_at: new Date(Date.now() + input.expiresInDays * 86400_000).toISOString() }).select("id").single();
  if (error || !data) throw new HttpError(500, error?.message ?? "Could not create rule");
  await sb.from("rule_events").insert({ rule_id: data.id, owner_id: userId, kind: "created", detail: input.terms });
  return data.id;
}

export const demoCatalogSeed = DEMO_CATALOG;
