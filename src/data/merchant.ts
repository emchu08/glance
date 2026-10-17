import type { MerchantCatalogItem } from "./types";

/**
 * Glance Demo Market — the seeded connected sandbox seller.
 * These are demo merchandise with simulated fulfillment; never labeled as a real retailer's stock.
 */
export const DEMO_MERCHANT_ID = "glance-demo-market";
export const DEMO_MERCHANT_NAME = "Glance Demo Market";

export const DEMO_CATALOG: MerchantCatalogItem[] = [
  {
    merchantId: DEMO_MERCHANT_ID,
    sku: "demo-gray-tote",
    name: "Gray canvas tote",
    description: "Demo merchandise · simulated fulfillment",
    unitPriceCents: 1200,
    currency: "USD",
    satisfies: ["bags", "gray-sweater", "black-backpack", "apparel"],
    stock: 25,
  },
  {
    merchantId: DEMO_MERCHANT_ID,
    sku: "demo-tomatoes-300g",
    name: "Tomatoes, 300 g",
    description: "Demo grocery · simulated fulfillment",
    unitPriceCents: 320,
    currency: "USD",
    satisfies: ["cherry tomatoes", "tomatoes", "tomato"],
    stock: 40,
  },
  {
    merchantId: DEMO_MERCHANT_ID,
    sku: "demo-rigatoni-500g",
    name: "Rigatoni, 500 g",
    description: "Demo grocery · simulated fulfillment",
    unitPriceCents: 280,
    currency: "USD",
    satisfies: ["rigatoni", "fettuccine", "spaghetti", "pasta", "fettuccine-16oz", "spaghetti-16oz"],
    stock: 40,
  },
];

export const DEMO_CATALOG_BY_SKU: Record<string, MerchantCatalogItem> = Object.fromEntries(DEMO_CATALOG.map((i) => [i.sku, i]));

/** Sandbox example commission: 10% of item subtotal excluding tax/shipping. Configurable per merchant agreement. */
export const DEFAULT_COMMISSION_BPS = 1000;
export const COMMISSION_AGREEMENT_VERSION = "sandbox-2026-10-v1";
