import type { GroceryObservation, ObservationState } from "@/data/types";

/**
 * Pure temporal tracker for the physical grocery cart.
 *  - Minimum usable evidence 0.5.
 *  - Seeing/holding never adds. A hold followed by placing/in-cart evidence forms an episode.
 *  - in_cart ≥ 0.75 confirms automatically; weaker usable evidence asks once.
 *  - Held/placing item absent for three frames → put back.
 *  - Event ids are `productKey#episode`; repeated frames cannot re-add the same unit.
 *  - After an add (or the ask), the item only counts as picked up again once it has been out of
 *    hand for REARM_FRAMES frames in a row, so holding it up for a long time never re-prompts.
 */

export const MIN_EVIDENCE = 0.5;
export const AUTO_CONFIRM = 0.75;
export const ABSENT_FRAMES_PUT_BACK = 3;
export const REARM_FRAMES = 2;
/** A dismissed ("not it") identification can come back after this many frames, to rescan the same item. */
export const DISMISS_FRAMES = 3;

export interface Track {
  productKey: string;
  label: string;
  packageSize: string | null;
  priceCents: number | null;
  episode: number;
  phase: "idle" | "held" | "placing" | "added" | "pending-confirm" | "dismissed";
  absentFrames: number;
  lastState: ObservationState;
  lastConfidence: number;
  /** Set when a manual Add claimed the current hold so camera evidence cannot double-add. */
  claimedByManual: boolean;
  /** Frames in a row the item has been out of hand since its add (see REARM_FRAMES). */
  outOfHandFrames?: number;
  /** Frames since the wearer said this identification was wrong (see DISMISS_FRAMES). */
  sinceDismiss?: number;
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
      ? { ...prev, absentFrames: 0, sinceDismiss: (prev.sinceDismiss ?? 0) + 1, outOfHandFrames: obs.state === "held" || obs.state === "placing" ? 0 : (prev.outOfHandFrames ?? 0) + 1, lastState: obs.state, lastConfidence: obs.confidence, label: obs.label, packageSize: obs.packageSize ?? prev.packageSize, priceCents: obs.priceCents ?? prev.priceCents }
      : { productKey: obs.productKey, label: obs.label, packageSize: obs.packageSize, priceCents: obs.priceCents, episode: 0, phase: "idle", absentFrames: 0, lastState: obs.state, lastConfidence: obs.confidence, claimedByManual: false, outOfHandFrames: 0 };
    rearm(track);

    switch (obs.state) {
      case "on_shelf":
        // Seeing never adds. A finished episode's item goes idle once it has stayed out of hand (rearm).
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
    const t = { ...tracks[key], absentFrames: tracks[key].absentFrames + 1, sinceDismiss: (tracks[key].sinceDismiss ?? 0) + 1, outOfHandFrames: (tracks[key].outOfHandFrames ?? 0) + 1 };
    rearm(t);
    if ((t.phase === "held" || t.phase === "placing") && t.absentFrames >= ABSENT_FRAMES_PUT_BACK) {
      t.phase = "idle";
      events.push({ type: "put-back", productKey: t.productKey, label: t.label });
    }
    tracks[key] = t;
  }

  return { state: { frame: state.frame + 1, tracks, emitted }, events };
}

/** A finished episode's item can be picked up again (a new unit) once it has stayed out of hand. */
function rearm(t: Track) {
  if ((t.phase === "added" || t.phase === "pending-confirm") && (t.outOfHandFrames ?? 0) >= REARM_FRAMES) t.phase = "idle";
  if (t.phase === "dismissed" && ((t.outOfHandFrames ?? 0) >= REARM_FRAMES || (t.sinceDismiss ?? 0) >= DISMISS_FRAMES)) t.phase = "idle";
}

/** "Not it": the wearer says the camera named the wrong item. That hold is dropped (never auto-added). */
export function dismissHold(state: TrackerState, productKey: string): TrackerState {
  const t = state.tracks[productKey];
  if (!t || (t.phase !== "held" && t.phase !== "placing" && t.phase !== "pending-confirm")) return state;
  return { ...state, tracks: { ...state.tracks, [productKey]: { ...t, phase: "dismissed", outOfHandFrames: 0, sinceDismiss: 0 } } };
}

/** Manual Add on a held item: claims the current hold so later camera evidence does not double-add. */
export function claimHold(state: TrackerState, productKey: string): { state: TrackerState; alreadyCounted: boolean } {
  const t = state.tracks[productKey];
  if (!t) return { state, alreadyCounted: false };
  const eventId = `${t.productKey}#${t.episode}`;
  const alreadyCounted = state.emitted.includes(eventId) && (t.phase === "added" || t.phase === "pending-confirm");
  const emitted = state.emitted.includes(eventId) ? state.emitted : [...state.emitted, eventId];
  return {
    // Whatever the camera thought, this unit is now in the cart: it can't prompt again until put down.
    state: { ...state, emitted, tracks: { ...state.tracks, [productKey]: { ...t, claimedByManual: true, phase: "added", outOfHandFrames: 0 } } },
    alreadyCounted,
  };
}

export function currentlyHeld(state: TrackerState): Track | null {
  const held = Object.values(state.tracks).filter((t) => t.phase === "held" || t.phase === "placing");
  if (held.length === 0) return null;
  // Prefer the most recently observed hold, then the stronger evidence.
  return held.sort((a, b) => a.absentFrames - b.absentFrames || b.lastConfidence - a.lastConfidence)[0];
}
