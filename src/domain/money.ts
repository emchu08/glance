/** All commerce arithmetic uses integer cents. */
export function formatCents(cents: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "See price";
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  if (opts.compact && rem === 0) return `${sign}$${dollars.toLocaleString("en-US")}`;
  return `${sign}$${dollars.toLocaleString("en-US")}.${rem.toString().padStart(2, "0")}`;
}

export function dollarsToCents(value: number | string): number | null {
  const n = typeof value === "string" ? Number(value.replace(/[^0-9.\-]/g, "")) : value;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Parses a visible US dollar label like "$3.49" or "3.49" into cents; otherwise null. */
export function parseUsdLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = label.trim().match(/^\$?\s*(\d{1,5})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const dollars = Number(m[1]);
  const cents = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return dollars * 100 + cents;
}

/** Deterministic banker-free rounding for basis-point fees: round half up on integer math. */
export function applyBps(amountCents: number, bps: number): number {
  return Math.floor((amountCents * bps + 5000) / 10000);
}

export function sumKnown(values: Array<number | null | undefined>): { known: number; unknownCount: number } {
  let known = 0;
  let unknownCount = 0;
  for (const v of values) {
    if (v === null || v === undefined) unknownCount += 1;
    else known += v;
  }
  return { known, unknownCount };
}
