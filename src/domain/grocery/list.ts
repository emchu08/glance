import { AISLE_BY_ID, CATALOG_BY_ID, QFC_OUT_OF_STOCK, STORE_OFFERS, STORES } from "@/data/grocery";
import type { CartLine, ShoppingListItem } from "@/data/types";
import { matchCatalogProduct } from "./matching";

/** A cart item covers an unchecked list entry when all normalized words of the key are in the product label. */
export function cartCoversListEntry(line: CartLine, item: ShoppingListItem): boolean {
  const label = line.label.split("·")[0].toLowerCase();
  const words = item.key.split(/[\s-]+/).filter(Boolean);
  return words.length > 0 && words.every((w) => label.includes(w));
}

export function completeListFromCart(list: ShoppingListItem[], lines: CartLine[]): ShoppingListItem[] {
  return list.map((item) => (item.done ? item : lines.some((l) => cartCoversListEntry(l, item)) ? { ...item, done: true } : item));
}

export interface StockSummary {
  store: string;
  covered: string[];
  unavailable: string[];
  unknown: string[];
  suggestedStore: string | null;
}

/** Sample home-store stock check: QFC carries mapped catalog items except Parmesan. Never real-time inventory. */
export function homeStoreStock(list: ShoppingListItem[]): StockSummary {
  const covered: string[] = [];
  const unavailable: string[] = [];
  const unknown: string[] = [];
  const unavailableIds: string[] = [];
  for (const item of list.filter((i) => !i.done)) {
    const p = matchCatalogProduct(item.name);
    if (!p) { unknown.push(item.name); continue; }
    if (QFC_OUT_OF_STOCK.has(p.id)) { unavailable.push(item.name); unavailableIds.push(p.id); } else covered.push(item.name);
  }
  let suggestedStore: string | null = null;
  if (unavailableIds.length) {
    const neededIds = list.filter((i) => !i.done).map((i) => matchCatalogProduct(i.name)?.id).filter(Boolean) as string[];
    for (const store of STORES.map((s) => s.name).filter((n) => n !== "QFC")) {
      const carriesAll = neededIds.every((id) => STORE_OFFERS.some((o) => o.productId === id && o.store === store && o.match === "same"));
      if (carriesAll) { suggestedStore = store; break; }
    }
    if (!suggestedStore) {
      // fall back to any store that carries the unavailable items
      const s = STORE_OFFERS.find((o) => unavailableIds.includes(o.productId) && o.match === "same" && !["Amazon", "Temu"].includes(o.store));
      suggestedStore = s?.store ?? null;
    }
  }
  return { store: "QFC", covered, unavailable, unknown, suggestedStore };
}

export interface AisleStop { productId: string; name: string; aisle: number; section: string; side: "left" | "right" }

/** Ordered aisle stops for unfinished list entries that map to the scripted QFC layout. */
export function aisleStops(list: ShoppingListItem[]): AisleStop[] {
  const stops: AisleStop[] = [];
  for (const item of list.filter((i) => !i.done)) {
    const p = matchCatalogProduct(item.name);
    if (!p) continue;
    const loc = AISLE_BY_ID[p.id];
    if (!loc) continue;
    if (stops.some((s) => s.productId === p.id)) continue;
    stops.push({ productId: p.id, name: CATALOG_BY_ID[p.id].name, aisle: loc.aisle, section: loc.section, side: loc.side });
  }
  return stops.sort((a, b) => a.aisle - b.aisle);
}
