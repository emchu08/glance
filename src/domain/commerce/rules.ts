/** Auto-buy purchase rule evaluation (pure). The server re-validates at execution time. */
export interface PurchaseRule {
  id: string;
  version: number;
  status: "active" | "paused" | "revoked" | "expired";
  merchantAllowlist: string[];
  skuAllowlist: string[];
  maxQuantity: number;
  perOrderLimitCents: number;
  cumulativeLimitCents: number;
  spentCents: number;
  reservedCents: number;
  currency: "USD";
  expiresAt: number;
  minConfidence: number;
}

export interface RuleCandidate {
  merchantId: string;
  sku: string;
  quantity: number;
  totalCents: number;
  currency: string;
  confidence: number;
  exactVariant: boolean;
}

export type RuleDecision =
  | { ok: true; reserveCents: number }
  | { ok: false; reason: string };

export function evaluateRule(rule: PurchaseRule, c: RuleCandidate, now = Date.now()): RuleDecision {
  if (rule.status !== "active") return { ok: false, reason: `Rule is ${rule.status}` };
  if (now >= rule.expiresAt) return { ok: false, reason: "Rule expired" };
  if (c.currency !== rule.currency) return { ok: false, reason: "Currency not allowed" };
  if (!rule.merchantAllowlist.includes(c.merchantId)) return { ok: false, reason: "Seller not allowed" };
  if (!rule.skuAllowlist.includes(c.sku)) return { ok: false, reason: "Item not in rule" };
  if (!c.exactVariant) return { ok: false, reason: "Variant uncertain" };
  if (c.confidence < rule.minConfidence) return { ok: false, reason: "Recognition confidence too low" };
  if (c.quantity > rule.maxQuantity) return { ok: false, reason: "Quantity exceeds rule" };
  if (c.totalCents > rule.perOrderLimitCents) return { ok: false, reason: "Over per-order limit" };
  if (rule.spentCents + rule.reservedCents + c.totalCents > rule.cumulativeLimitCents) return { ok: false, reason: "Budget exhausted" };
  return { ok: true, reserveCents: c.totalCents };
}
