import { GROCERY_CATALOG } from "@/data/grocery";
import type { GroceryProduct } from "@/data/types";

/**
 * Case-insensitive token matching: all required tokens present, no excluded tokens present.
 * Multiple matches → most required tokens wins; ties stay unresolved (null).
 */
export function matchCatalogProduct(label: string, catalog: GroceryProduct[] = GROCERY_CATALOG): GroceryProduct | null {
  const l = ` ${label.toLowerCase().replace(/\s+/g, " ").trim()} `;
  const hits = catalog.filter(
    (p) => p.required.every((t) => l.includes(t.toLowerCase())) && !p.excluded.some((t) => l.includes(t.toLowerCase())),
  );
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0];
  const sorted = [...hits].sort((a, b) => b.required.length - a.required.length);
  if (sorted[0].required.length === sorted[1].required.length) return null;
  return sorted[0];
}

/** Stable key for labels that do not match the sample catalog. */
export function normalizedLabelKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "-") || "unknown-item";
}
