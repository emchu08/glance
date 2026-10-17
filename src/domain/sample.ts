import { SAMPLE_LATENCY_MS, STREET_CANDIDATES, STREET_FRAMES, sampleOffersFor } from "@/data/glimpse";
import { SAMPLE_GROCERY_PLAYBACK } from "@/data/grocery";
import { SAMPLE_DISH_HYPOTHESES, sampleRecipesFor } from "@/data/gourmet";
import { DEMO_CATALOG, DEMO_MERCHANT_NAME } from "@/data/merchant";
import type { Candidate, DishHypothesis, GroceryObservation, Offer, Recipe } from "@/data/types";
import { rankCandidates, updateSeenCounts } from "./glimpse/interest";

export { SAMPLE_LATENCY_MS };

/** Deterministic Glimpse sample: frame n → candidate set, ranked with the shared formula. */
export function sampleGlimpseFrame(frameIndex: number, seenWindow: string[][]): { candidates: Candidate[]; ranked: ReturnType<typeof rankCandidates>; window: string[][] } {
  const ids = STREET_FRAMES[frameIndex % STREET_FRAMES.length];
  const candidates = ids.map((id) => STREET_CANDIDATES[id]);
  const { counts, window } = updateSeenCounts({}, ids, seenWindow);
  return { candidates, ranked: rankCandidates(candidates, { seenCounts: counts }), window };
}

/** Sample offers for a candidate label plus the eligible demo-merchant offer when applicable. */
export function sampleOffersForLabel(label: string, candidateId?: string): Offer[] {
  const external = sampleOffersFor(label).map((o) => ({ ...o, candidateId: candidateId ?? o.candidateId }));
  const demo = demoMerchantOffersFor(label, candidateId);
  // Demo-merchant offers are honest sandbox purchases; keep them after the best external match
  // so the lens does not present them as the "best price" — ranking stays evidence-based.
  return [...external.slice(0, 1), ...demo, ...external.slice(1)];
}

export function demoMerchantOffersFor(label: string, candidateId?: string): Offer[] {
  const l = label.toLowerCase();
  return DEMO_CATALOG.filter((item) => item.satisfies.some((t) => l.includes(t) || candidateId === t)).map((item) => ({
    id: `demo-${item.sku}`,
    candidateId,
    name: item.name,
    retailer: DEMO_MERCHANT_NAME,
    url: `/merchant#${item.sku}`,
    imageUrl: `/samples/${item.sku}.svg`,
    priceCents: item.unitPriceCents,
    match: "similar" as const,
    evidence: item.description,
    badge: "Buy in lens",
    kind: "connect_merchant" as const,
    merchantId: item.merchantId,
    sku: item.sku,
    variant: "Standard",
    origin: "sample" as const,
  }));
}

export function sampleGroceryFrame(frameIndex: number): { observations: GroceryObservation[]; scene: "aisle" | "cart" | "juice"; caption: string } {
  return SAMPLE_GROCERY_PLAYBACK[frameIndex % SAMPLE_GROCERY_PLAYBACK.length];
}

export function sampleDish(): { isFood: boolean; hypotheses: DishHypothesis[] } {
  return { isFood: true, hypotheses: SAMPLE_DISH_HYPOTHESES };
}

export function sampleRecipes(dish: string): Recipe[] {
  return sampleRecipesFor(dish);
}

export const SAMPLE_SCENES = {
  street: "/samples/street.svg",
  aisle: "/samples/aisle.svg",
  cart: "/samples/cart.svg",
  juice: "/samples/aisle.svg",
  meal: "/samples/meal.svg",
} as const;
