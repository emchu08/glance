import type { Candidate, RankedCandidate } from "@/data/types";

export interface InterestContext {
  seenCounts: Record<string, number>;
  preferredCategories?: string[];
}

/** 0.45×center + 0.30×confidence + 0.15×min(1, seen/3) + 0.10 preference + 0.20 primary, capped at 1. */
export function rankCandidates(candidates: Candidate[], ctx: InterestContext): RankedCandidate[] {
  return candidates
    .map((c) => {
      const cx = c.box ? c.box.x + c.box.width / 2 : 0.5;
      const cy = c.box ? c.box.y + c.box.height / 2 : 0.5;
      const dist = Math.min(1, Math.hypot(cx - 0.5, cy - 0.5) / 0.7071);
      const center = 1 - dist;
      const seen = ctx.seenCounts[c.id] ?? 1;
      const persistence = Math.min(1, seen / 3);
      const pref = ctx.preferredCategories?.includes(c.category) ? 0.1 : 0;
      const primary = c.primary ? 0.2 : 0;
      const interest = Math.min(1, 0.45 * center + 0.3 * c.confidence + 0.15 * persistence + pref + primary);
      const reasons: string[] = [];
      if (c.primary) reasons.push("Centered");
      else if (center > 0.6) reasons.push("Near center");
      else reasons.push(cy > 0.6 ? "Lower in frame" : "Off to the side");
      if (seen >= 2) reasons.push(`seen in ${seen} frames`);
      return { ...c, interest, reason: reasons.join(", "), seen };
    })
    .sort((a, b) => b.interest - a.interest);
}

/** Candidates eligible for speculative prefetch: primary or seen ≥ 2, at most two. */
export function prefetchEligible(ranked: RankedCandidate[]): RankedCandidate[] {
  return ranked.filter((c) => c.primary || c.seen >= 2).slice(0, 2);
}

export function updateSeenCounts(prev: Record<string, number>, ids: string[], window: string[][]): { counts: Record<string, number>; window: string[][] } {
  const nextWindow = [...window, ids].slice(-5);
  const counts: Record<string, number> = {};
  for (const frame of nextWindow) for (const id of frame) counts[id] = (counts[id] ?? 0) + 1;
  return { counts, window: nextWindow };
}

export function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
