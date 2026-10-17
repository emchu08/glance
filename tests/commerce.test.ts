import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuote, QuoteError } from "../src/domain/commerce/quote.ts";
import { evaluateRule, type PurchaseRule } from "../src/domain/commerce/rules.ts";
import { applyBps, formatCents, parseUsdLabel } from "../src/domain/money.ts";

test("quotes are server-priced with a 10% sandbox commission on item subtotal", () => {
  const q = buildQuote([{ sku: "demo-gray-tote", quantity: 1 }, { sku: "demo-tomatoes-300g", quantity: 2 }], { now: 1 });
  assert.equal(q.subtotalCents, 1840);
  assert.equal(q.totalCents, 1840);
  assert.equal(q.commission.amountCents, 184);
  assert.equal(applyBps(2000, 1000), 200);
  assert.throws(() => buildQuote([{ sku: "nope", quantity: 1 }]), (e: unknown) => e instanceof QuoteError && e.code === "unknown_sku");
  assert.throws(() => buildQuote([{ sku: "demo-gray-tote", quantity: 0 }]), (e: unknown) => e instanceof QuoteError && e.code === "bad_quantity");
});

test("money helpers", () => {
  assert.equal(formatCents(1200), "$12.00");
  assert.equal(formatCents(null), "See price");
  assert.equal(parseUsdLabel("$3.49"), 349);
  assert.equal(parseUsdLabel("3.5"), 350);
  assert.equal(parseUsdLabel("three"), null);
});

test("auto-buy rules reject uncertain variants, unknown sellers, exhausted budgets, and expiry", () => {
  const rule: PurchaseRule = { id: "r", version: 1, status: "active", merchantAllowlist: ["glance-demo-market"], skuAllowlist: ["demo-tomatoes-300g"], maxQuantity: 1, perOrderLimitCents: 1000, cumulativeLimitCents: 4000, spentCents: 3500, reservedCents: 0, currency: "USD", expiresAt: 2_000, minConfidence: 0.9 };
  const ok = { merchantId: "glance-demo-market", sku: "demo-tomatoes-300g", quantity: 1, totalCents: 320, currency: "USD", confidence: 0.95, exactVariant: true };
  assert.deepEqual(evaluateRule(rule, ok, 1_000), { ok: true, reserveCents: 320 });
  assert.equal(evaluateRule(rule, { ...ok, exactVariant: false }, 1_000).ok, false);
  assert.equal(evaluateRule(rule, { ...ok, merchantId: "other" }, 1_000).ok, false);
  assert.equal(evaluateRule(rule, { ...ok, totalCents: 600 }, 1_000).ok, false, "cumulative budget");
  assert.equal(evaluateRule(rule, ok, 3_000).ok, false, "expired");
  assert.equal(evaluateRule({ ...rule, status: "paused" }, ok, 1_000).ok, false);
  assert.equal(evaluateRule(rule, { ...ok, confidence: 0.5 }, 1_000).ok, false);
});
