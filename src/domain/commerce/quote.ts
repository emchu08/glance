import { DEMO_CATALOG_BY_SKU, DEMO_MERCHANT_ID, DEFAULT_COMMISSION_BPS, COMMISSION_AGREEMENT_VERSION } from "@/data/merchant";
import { applyBps } from "@/domain/money";

export interface QuoteLineInput { sku: string; quantity: number }

export interface QuoteLine {
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface Quote {
  merchantId: string;
  currency: "USD";
  lines: QuoteLine[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  commission: { bps: number; amountCents: number; basis: "item_subtotal"; version: string };
  /** ms since epoch */
  expiresAt: number;
  version: string;
}

export const QUOTE_TTL_MS = 10 * 60 * 1000;
/** Demo merchant: flat sandbox shipping and no tax, disclosed before Buy. */
export const DEMO_SHIPPING_CENTS = 0;
export const DEMO_TAX_BPS = 0;

export class QuoteError extends Error {
  code: "unknown_sku" | "mixed_merchants" | "bad_quantity" | "out_of_stock";
  constructor(code: "unknown_sku" | "mixed_merchants" | "bad_quantity" | "out_of_stock", message: string) {
    super(message);
    this.code = code;
  }
}

export function buildQuote(input: QuoteLineInput[], opts: { now?: number; commissionBps?: number; version?: string } = {}): Quote {
  if (!input.length) throw new QuoteError("bad_quantity", "No lines");
  const lines: QuoteLine[] = [];
  let merchantId: string | null = null;
  for (const l of input) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0 || l.quantity > 20) throw new QuoteError("bad_quantity", `Bad quantity for ${l.sku}`);
    const item = DEMO_CATALOG_BY_SKU[l.sku];
    if (!item) throw new QuoteError("unknown_sku", `Unknown SKU ${l.sku}`);
    if (merchantId && merchantId !== item.merchantId) throw new QuoteError("mixed_merchants", "One seller per order");
    merchantId = item.merchantId;
    if (item.stock < l.quantity) throw new QuoteError("out_of_stock", `${item.name} is out of stock`);
    lines.push({ sku: item.sku, name: item.name, quantity: l.quantity, unitPriceCents: item.unitPriceCents, lineTotalCents: item.unitPriceCents * l.quantity });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const tax = applyBps(subtotal, DEMO_TAX_BPS);
  const bps = opts.commissionBps ?? DEFAULT_COMMISSION_BPS;
  const now = opts.now ?? Date.now();
  return {
    merchantId: merchantId ?? DEMO_MERCHANT_ID,
    currency: "USD",
    lines,
    subtotalCents: subtotal,
    shippingCents: DEMO_SHIPPING_CENTS,
    taxCents: tax,
    totalCents: subtotal + DEMO_SHIPPING_CENTS + tax,
    commission: { bps, amountCents: applyBps(subtotal, bps), basis: "item_subtotal", version: COMMISSION_AGREEMENT_VERSION },
    expiresAt: now + QUOTE_TTL_MS,
    version: opts.version ?? `q_${now.toString(36)}_${subtotal}`,
  };
}
