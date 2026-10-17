import type { CartLine, PriceSource } from "@/data/types";
import { sumKnown } from "@/domain/money";

export interface AddLineInput {
  productKey: string;
  label: string;
  packageSize: string | null;
  unitPriceCents: number | null;
  priceSource: PriceSource;
  eventId: string;
  confirmed?: boolean;
}

const PRICE_PRECEDENCE: Record<PriceSource, number> = { manual: 5, "shelf-label": 4, catalog: 3, online: 2, unknown: 0 };

export function addToCart(lines: CartLine[], input: AddLineInput): CartLine[] {
  const idx = lines.findIndex((l) => l.productKey === input.productKey);
  if (idx >= 0) {
    const line = lines[idx];
    if (line.events.includes(input.eventId)) return lines; // duplicate unit event
    const next: CartLine = {
      ...line,
      quantity: line.quantity + 1,
      events: [...line.events, input.eventId],
      confirmed: line.confirmed || input.confirmed !== false,
      ...pickPrice(line, input),
    };
    return lines.map((l, i) => (i === idx ? next : l));
  }
  return [
    ...lines,
    {
      productKey: input.productKey,
      label: input.label,
      packageSize: input.packageSize,
      quantity: 1,
      unitPriceCents: input.unitPriceCents,
      currency: "USD",
      priceSource: input.unitPriceCents === null ? "unknown" : input.priceSource,
      confirmed: input.confirmed !== false,
      events: [input.eventId],
    },
  ];
}

/** Prefer confirmed manual/shelf evidence; never overwrite them with catalog/online prices. */
function pickPrice(line: CartLine, input: AddLineInput): Pick<CartLine, "unitPriceCents" | "priceSource"> {
  if (input.unitPriceCents === null) return { unitPriceCents: line.unitPriceCents, priceSource: line.priceSource };
  if (line.unitPriceCents === null) return { unitPriceCents: input.unitPriceCents, priceSource: input.priceSource };
  return PRICE_PRECEDENCE[input.priceSource] > PRICE_PRECEDENCE[line.priceSource]
    ? { unitPriceCents: input.unitPriceCents, priceSource: input.priceSource }
    : { unitPriceCents: line.unitPriceCents, priceSource: line.priceSource };
}

export function setQuantity(lines: CartLine[], productKey: string, quantity: number): CartLine[] {
  if (!Number.isInteger(quantity)) return lines;
  if (quantity <= 0) return lines.filter((l) => l.productKey !== productKey);
  return lines.map((l) => (l.productKey === productKey ? { ...l, quantity } : l));
}

export function setManualPrice(lines: CartLine[], productKey: string, unitPriceCents: number | null): CartLine[] {
  return lines.map((l) =>
    l.productKey === productKey
      ? { ...l, unitPriceCents, priceSource: unitPriceCents === null ? "unknown" : "manual" }
      : l,
  );
}

export function removeLine(lines: CartLine[], productKey: string): CartLine[] {
  return lines.filter((l) => l.productKey !== productKey);
}

export function cartTotals(lines: CartLine[]): { knownSubtotalCents: number; unknownLines: number; units: number } {
  const { known, unknownCount } = sumKnown(lines.map((l) => (l.unitPriceCents === null ? null : l.unitPriceCents * l.quantity)));
  return { knownSubtotalCents: known, unknownLines: unknownCount, units: lines.reduce((s, l) => s + l.quantity, 0) };
}
