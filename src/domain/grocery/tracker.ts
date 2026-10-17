import type { GroceryObservation, ObservationState } from "@/data/types";

/**
 * Pure temporal tracker for the physical grocery cart.
 *  - Minimum usable evidence 0.5.
 *  - Seeing/holding never adds. A hold followed by placing/in-cart evidence forms an episode.
 *  - in_cart ≥ 0.75 confirms automatically; weaker usable evidence asks once.
 *  - Held/placing item absent for three frames → put back.
 *  - Event ids are `productKey#episode`; repeated frames cannot re-add the same unit.
 */

export const MIN_EVIDENCE = 0.5;
export const AUTO_CONFIRM = 0.75;
export const ABSENT_FRAMES_PUT_BACK = 3;

export interface Track {
  productKey: string;
  label: string;
  packageSize: string | null;
  priceCents: number | null;
  episode: number;
  phase: "idle" | "held" | "placing" | "added" | "pending-confirm";
  absentFrames: number;
  lastState: ObservationState;
  lastConfidence: number;
  /** Set when a manual Add claimed the current hold so camera evidence cannot double-add. */
  claimedByManual: boolean;
}

export interface TrackerState {
  frame: number;
  tracks: Record<string, Track>;
  /** Emitted event ids (productKey#episode) — the ledger that prevents duplicates. */
  emitted: string[];
}

export type TrackerEvent =
  | { type: "add"; eventId: string; productKey: string; label: string; packageSize: string | null; priceCents: number | null; confidence: number }
  | { type: "ask"; eventId: string; productKey: string; label: string; packageSize: string | null; priceCents: number | null; confidence: number }
  | { type: "held"; productKey: string; label: string; packageSize: string | null; priceCents: number | null }
  | { type: "put-back"; productKey: string; label: string };

export const initialTrackerState = (): TrackerState => ({ frame: 0, tracks: {}, emitted: [] });

export function stepTracker(state: TrackerState, observations: GroceryObservation[]): { state: TrackerState; events: TrackerEvent[] } {
  const events: TrackerEvent[] = [];
  const tracks: Record<string, Track> = { ...state.tracks };
  const emitted = [...state.emitted];
  const seen = new Set<string>();

  for (const obs of observations) {
    if (!(obs.confidence >= MIN_EVIDENCE)) continue;
    seen.add(obs.productKey);
    const prev = tracks[obs.productKey];
    const track: Track = prev
      ? { ...prev, absentFrames: 0, lastState: obs.state, lastConfidence: obs.confidence, label: obs.label, packageSize: obs.packageSize ?? prev.packageSize, priceCents: obs.priceCents ?? prev.priceCents }
      : { productKey: obs.productKey, label: obs.label, packageSize: obs.packageSize, priceCents: obs.priceCents, episode: 0, phase: "idle", absentFrames: 0, lastState: obs.state, lastConfidence: obs.confidence, claimedByManual: false };

    switch (obs.state) {
      case "on_shelf":
        // Seeing never adds. If a finished episode's item is back on the shelf, go idle.
        if (track.phase === "added" || track.phase === "pending-confirm") track.phase = "idle";
        break;
      case "held":
        if (track.phase === "idle") {
          track.episode += 1;
          track.phase = "held";
          track.claimedByManual = false;
          events.push({ type: "held", productKey: track.productKey, label: track.label, packageSize: track.packageSize, priceCents: track.priceCents });
        }
        break;
      case "placing":
        if (track.phase === "held") track.phase = "placing";
        break;
      case "in_cart": {
        const eventId = `${track.productKey}#${track.episode}`;
        if ((track.phase === "held" || track.phase === "placing") && !track.claimedByManual) {
          if (emitted.includes(eventId)) {
            track.phase = "added";
          } else if (obs.confidence >= AUTO_CONFIRM) {
            emitted.push(eventId);
            track.phase = "added";
            events.push({ type: "add", eventId, productKey: track.productKey, label: track.label, packageSize: track.packageSize, priceCents: track.priceCents, confidence: obs.confidence });
          } else {
            emitted.push(eventId);
            track.phase = "pending-confirm";
            events.push({ type: "ask", eventId, productKey: track.productKey, label: track.label, packageSize: track.packageSize, priceCents: track.priceCents, confidence: obs.confidence });
          }
        } else if ((track.phase === "held" || track.phase === "placing") && track.claimedByManual) {
          track.phase = "added";
        }
        // "added"/"pending-confirm"/"idle" + in_cart → nothing; same unit cannot add twice.
        break;
      }
    }
    tracks[obs.productKey] = track;
  }

  for (const key of Object.keys(tracks)) {
    if (seen.has(key)) continue;
    const t = { ...tracks[key], absentFrames: tracks[key].absentFrames + 1 };
    if ((t.phase === "held" || t.phase === "placing") && t.absentFrames >= ABSENT_FRAMES_PUT_BACK) {
      t.phase = "idle";
      events.push({ type: "put-back", productKey: t.productKey, label: t.label });
    }
    tracks[key] = t;
  }

  return { state: { frame: state.frame + 1, tracks, emitted }, events };
}

/** Manual Add on a held item: claims the current hold so later camera evidence does not double-add. */
export function claimHold(state: TrackerState, productKey: string): { state: TrackerState; alreadyCounted: boolean } {
  const t = state.tracks[productKey];
  if (!t) return { state, alreadyCounted: false };
  const eventId = `${t.productKey}#${t.episode}`;
  const alreadyCounted = state.emitted.includes(eventId) && (t.phase === "added" || t.phase === "pending-confirm");
  if (alreadyCounted) return { state, alreadyCounted: true };
  const emitted = state.emitted.includes(eventId) ? state.emitted : [...state.emitted, eventId];
  return {
    state: { ...state, emitted, tracks: { ...state.tracks, [productKey]: { ...t, claimedByManual: true, phase: t.phase === "idle" ? "idle" : "added" } } },
    alreadyCounted: false,
  };
}

export function currentlyHeld(state: TrackerState): Track | null {
  const held = Object.values(state.tracks).filter((t) => t.phase === "held" || t.phase === "placing");
  if (held.length === 0) return null;
  // Prefer the most recently observed hold, then the stronger evidence.
  return held.sort((a, b) => a.absentFrames - b.absentFrames || b.lastConfidence - a.lastConfidence)[0];
}
