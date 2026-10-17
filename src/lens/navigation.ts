import type { LensAction } from "./types";

export type Direction = "up" | "down" | "left" | "right";

/**
 * Nearest-direction focus navigation over the action descriptor list.
 * Up/down pick the nearest row in that direction, preferring the closest x.
 * Left/right stay on the row; if nothing is there, they fall through to the
 * nearest action in that horizontal direction on any row (keeps the header reachable).
 */
export function moveFocus(actions: LensAction[], currentId: string | null, dir: Direction): string | null {
  const enabled = actions.filter((a) => !a.disabled);
  if (enabled.length === 0) return null;
  const current = enabled.find((a) => a.id === currentId) ?? null;
  if (!current) return defaultFocus(enabled);

  const score = (a: LensAction) => {
    const dr = a.row - current.row;
    const dx = a.x - current.x;
    switch (dir) {
      case "up": return dr < 0 ? Math.abs(dr) * 10 + Math.abs(dx) : Infinity;
      case "down": return dr > 0 ? Math.abs(dr) * 10 + Math.abs(dx) : Infinity;
      case "left": return dr === 0 && dx < 0 ? Math.abs(dx) : dx < 0 ? 100 + Math.abs(dr) * 10 + Math.abs(dx) : Infinity;
      case "right": return dr === 0 && dx > 0 ? Math.abs(dx) : dx > 0 ? 100 + Math.abs(dr) * 10 + Math.abs(dx) : Infinity;
    }
  };
  let best: LensAction | null = null;
  let bestScore = Infinity;
  for (const a of enabled) {
    if (a.id === current.id) continue;
    const s = score(a);
    if (s < bestScore) { best = a; bestScore = s; }
  }
  return best?.id ?? current.id;
}

/** Linear move for temple swipes: next/previous in reading order. */
export function moveLinear(actions: LensAction[], currentId: string | null, delta: 1 | -1): string | null {
  const ordered = [...actions.filter((a) => !a.disabled)].sort((a, b) => a.row - b.row || a.x - b.x);
  if (!ordered.length) return null;
  const i = ordered.findIndex((a) => a.id === currentId);
  if (i < 0) return defaultFocus(ordered);
  return ordered[(i + delta + ordered.length) % ordered.length].id;
}

/**
 * Default focus: the first non-header, non-payment action in reading order.
 * Never default onto Buy; never default onto an input/composer field.
 */
export function defaultFocus(actions: LensAction[]): string | null {
  const enabled = actions.filter((a) => !a.disabled);
  const body = enabled.filter((a) => a.row > 0 && a.variant !== "pay" && !a.field);
  const pick = (body.find((a) => a.variant === "primary") ?? [...body].sort((a, b) => a.row - b.row || a.x - b.x)[0]) ?? enabled[0];
  return pick?.id ?? null;
}

/** Keep the focused id if still present; otherwise fall back deterministically. */
export function reconcileFocus(actions: LensAction[], focusId: string | null): string | null {
  if (focusId && actions.some((a) => a.id === focusId && !a.disabled)) return focusId;
  return defaultFocus(actions);
}
