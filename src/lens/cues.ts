import type { LensState } from "./types";

export type Tone = "found" | "added" | "paid" | "sent" | "error";

const cartCount = (s: LensState) => s.grocery.cart.reduce((n, l) => n + l.quantity, 0);
const paid = (s: string) => s === "confirmed" || s === "accepted";

/**
 * Tones for what just changed between two lens states. Pure, so the tests can cover it; LensProvider plays them.
 * Tones only, never speech: the screen carries the words.
 */
export function cuesFor(prev: LensState, next: LensState): Tone[] {
  const tones: Tone[] = [];

  const g0 = prev.glimpse, g1 = next.glimpse;
  if (g0.scan === "scanning" && g1.scan === "result") tones.push(g1.candidates.length ? "found" : "error");
  if (g0.scan === "scanning" && g1.scan === "error") tones.push("error");

  const d0 = prev.gourmet.scan, d1 = next.gourmet.scan;
  if (d0 === "scanning" && d1 === "result") tones.push("found");
  if (d0 === "scanning" && (d1 === "no-food" || d1 === "error")) tones.push("error");

  if (cartCount(next) > cartCount(prev)) tones.push("added");

  const p0 = prev.payment, p1 = next.payment;
  if (!paid(p0.status) && paid(p1.status)) tones.push("paid");
  if (p0.status === "pending" && p1.status === "error") tones.push("error");
  if (p1.demo && paid(p1.status) && p0.phoneLink !== p1.phoneLink) {
    if (p1.phoneLink === "sent") tones.push("sent");
    if (p1.phoneLink === "failed") tones.push("error");
  }
  return tones;
}
