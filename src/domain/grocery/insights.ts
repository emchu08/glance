import {
  CATALOG_BY_ID, HEALTHIER_SWAPS, NUTRITION_BY_ID, PURCHASE_HISTORY, SAMPLE_SHOPPER, STORE_OFFERS, ONLINE_RETAILERS, HOME_STORE,
} from "@/data/grocery";
import type { Allergen, Nutrition, StoreOffer } from "@/data/types";
import { formatCents } from "@/domain/money";

export interface DietFlag {
  kind: "allergy" | "diet";
  severity: "warn" | "info";
  text: string;
}

export interface ItemInsight {
  productId: string;
  isFood: boolean;
  nutrition: Nutrition | null;
  nutritionOrigin: "label" | "estimate" | "none";
  allergens: Allergen[];
  allergenOrigin: "label" | "typical" | "none";
  flags: DietFlag[];
  nudge: string | null;
  homePriceCents: number | null;
  comparisons: StoreOffer[];
  bestSame: StoreOffer | null;
  cheapestOnline: StoreOffer | null;
}

/** Deterministic diet flags: allergies first, then diets. At most two. */
export function deriveFlags(n: Nutrition | null, shopper = SAMPLE_SHOPPER): DietFlag[] {
  if (!n) return [];
  const flags: DietFlag[] = [];
  for (const a of shopper.allergies) {
    if (n.allergens.includes(a as Allergen)) flags.push({ kind: "allergy", severity: "warn", text: `Contains ${a} · your allergy` });
  }
  if (shopper.diets.includes("gluten-free") && n.allergens.includes("gluten")) {
    flags.push({ kind: "diet", severity: "warn", text: "Contains gluten · not gluten-free" });
  }
  if (shopper.diets.includes("keto") && n.carbs > shopper.ketoCarbThresholdG) {
    flags.push({ kind: "diet", severity: "info", text: `Not keto-friendly · ≈ ${n.carbs} g carbs` });
  }
  return flags.slice(0, 2);
}

/** One friendly sentence, ≤ 18 words, using only supplied history/comparison facts. */
export function deriveNudge(productId: string): string | null {
  const history = PURCHASE_HISTORY[productId];
  const swap = HEALTHIER_SWAPS[productId];
  const product = CATALOG_BY_ID[productId];
  if (!product) return null;
  if (history && swap) {
    const swapProduct = CATALOG_BY_ID[swap.productId];
    const nth = ordinal(history.thisMonth + 1);
    const text = `Your ${nth} this month; last month's ${history.lastMonth} cost ${formatCents(history.lastMonth * history.lastMonthUnitCents)}. Try ${swapProduct.name.toLowerCase()}, ${swap.reason}.`;
    return clampWords(text, 18);
  }
  const cheaper = cheapestSameOffer(productId, (o) => ONLINE_RETAILERS.has(o.store));
  if (cheaper && cheaper.priceCents < product.qfcPriceCents) {
    return clampWords(`${cheaper.store} lists the same ${product.size} pack for ${formatCents(cheaper.priceCents)}, ${formatCents(product.qfcPriceCents - cheaper.priceCents)} less.`, 18);
  }
  if (history) {
    return clampWords(`This would be your ${ordinal(history.thisMonth + 1)} this month; you bought ${history.lastMonth} last month.`, 18);
  }
  return null;
}

function clampWords(s: string, max: number): string {
  const words = s.split(/\s+/);
  return words.length <= max ? s : words.slice(0, max).join(" ").replace(/[,;]$/, "") + ".";
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function comparisonsFor(productId: string): StoreOffer[] {
  return STORE_OFFERS.filter((o) => o.productId === productId).sort((a, b) => a.priceCents - b.priceCents);
}

export function cheapestSameOffer(productId: string, filter: (o: StoreOffer) => boolean = () => true): StoreOffer | null {
  const same = comparisonsFor(productId).filter((o) => o.match === "same" && filter(o));
  return same[0] ?? null;
}

export function sampleInsight(productId: string): ItemInsight | null {
  const product = CATALOG_BY_ID[productId];
  if (!product) return null;
  const nutrition = NUTRITION_BY_ID[productId] ?? null;
  const comparisons = comparisonsFor(productId);
  return {
    productId,
    isFood: true,
    nutrition,
    nutritionOrigin: nutrition ? "estimate" : "none",
    allergens: nutrition?.allergens ?? [],
    allergenOrigin: nutrition && nutrition.allergens.length ? "typical" : "none",
    flags: deriveFlags(nutrition),
    nudge: deriveNudge(productId),
    homePriceCents: product.qfcPriceCents,
    comparisons,
    bestSame: cheapestSameOffer(productId),
    cheapestOnline: cheapestSameOffer(productId, (o) => ONLINE_RETAILERS.has(o.store)),
  };
}

export const homeStoreName = HOME_STORE;
