import { CATALOG_BY_ID, PRIOR_MONTH_CATEGORY_CENTS, LAST_MONTH_TOTAL_CENTS } from "@/data/grocery";
import type { CartLine } from "@/data/types";
import { cartTotals } from "./cart";

export interface PieSegment { label: string; cents: number; highlight?: boolean }
export interface TripSummary {
  items: number;
  knownSubtotalCents: number;
  unknownLines: number;
  onlineOrdersCents: number;
  thisTripCents: number;
  monthToDateCents: number;
  lastMonthCents: number;
  segments: PieSegment[];
}

/** Donut: This trip + three largest prior-month categories + The rest (≤ 5 segments, zero segments omitted). */
export function buildTripSummary(lines: CartLine[], onlineOrdersCents = 0): TripSummary {
  const totals = cartTotals(lines);
  const thisTrip = totals.knownSubtotalCents + onlineOrdersCents;
  const cats = Object.entries(PRIOR_MONTH_CATEGORY_CENTS).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = cats.slice(0, 3);
  const rest = cats.slice(3).reduce((s, [, v]) => s + v, 0);
  const priorTotal = cats.reduce((s, [, v]) => s + v, 0);
  const segments: PieSegment[] = [];
  if (thisTrip > 0) segments.push({ label: "This trip", cents: thisTrip, highlight: true });
  for (const [label, cents] of top) segments.push({ label, cents });
  if (rest > 0) segments.push({ label: "The rest", cents: rest });
  return {
    items: totals.units,
    knownSubtotalCents: totals.knownSubtotalCents,
    unknownLines: totals.unknownLines,
    onlineOrdersCents,
    thisTripCents: thisTrip,
    monthToDateCents: priorTotal + thisTrip,
    lastMonthCents: LAST_MONTH_TOTAL_CENTS,
    segments,
  };
}

export function categoryOf(productKey: string): string {
  return CATALOG_BY_ID[productKey]?.category ?? "Other";
}
