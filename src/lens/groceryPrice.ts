import { CATALOG_BY_ID, HOME_STORE } from "@/data/grocery";
import type { Offer, PriceSource } from "@/data/types";
import type { LensState } from "./types";

export function groceryOnline(state: LensState, productKey: string) {
  if (state.capture === "sample") return null;
  const entry = state.grocery.online?.[productKey];
  if (!entry) return { status: "loading" as const, offers: [] as Offer[] };
  return { status: entry.status, offers: [...entry.offers].sort((a, b) => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity)) };
}

export interface CardPrice { cents: number; source: PriceSource; note: string; approx?: boolean }

/**
 * The price the held-item card shows, and so the price Add puts in the cart.
 * Sample: this store's price. Live: the shelf label Claude read, then the cheapest online
 * listing, then a marked "≈" typical price, then this store's catalog price.
 */
export function groceryCardPrice(state: LensState, key: string): CardPrice | null {
  const sample = state.capture === "sample";
  const product = CATALOG_BY_ID[key];
  const held = state.grocery.heldKey === key ? state.grocery.heldPrice ?? null : null;
  const shelf = held?.source === "shelf-label" ? held.cents : state.grocery.tracker.tracks[key]?.priceCents ?? null;
  const here = state.grocery.insights[key]?.data?.homePriceCents ?? product?.qfcPriceCents ?? null;
  const online = groceryOnline(state, key)?.offers.find((o) => o.priceCents !== null) ?? null;
  if (!sample && shelf !== null) return { cents: shelf, source: "shelf-label", note: "shelf label" };
  if (sample && here !== null) return { cents: here, source: "catalog", note: `${HOME_STORE} · sample` };
  if (online) return { cents: online.priceCents!, source: "online", note: `online · ${online.retailer}` };
  if (shelf !== null) return { cents: shelf, source: "shelf-label", note: "shelf label · est." };
  if (held) return { cents: held.cents, source: "estimate", note: "typical price", approx: true };
  if (here !== null) return { cents: here, source: "catalog", note: HOME_STORE };
  return null;
}
