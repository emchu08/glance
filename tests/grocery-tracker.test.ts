import { test } from "node:test";
import assert from "node:assert/strict";
import { claimHold, currentlyHeld, initialTrackerState, stepTracker } from "../src/domain/grocery/tracker.ts";
import { SAMPLE_GROCERY_PLAYBACK } from "../src/data/grocery.ts";
import type { GroceryObservation } from "../src/data/types.ts";

const obs = (productKey: string, state: GroceryObservation["state"], confidence: number): GroceryObservation => ({ productKey, label: productKey, state, confidence, packageSize: null, priceCents: null });

test("seeing or holding never adds; hold → in_cart adds exactly once", () => {
  let s = initialTrackerState();
  let r = stepTracker(s, [obs("yogurt", "on_shelf", 0.9)]); s = r.state;
  assert.equal(r.events.filter((e) => e.type === "add").length, 0);
  r = stepTracker(s, [obs("yogurt", "held", 0.92)]); s = r.state;
  assert.deepEqual(r.events.map((e) => e.type), ["held"]);
  r = stepTracker(s, [obs("yogurt", "in_cart", 0.9)]); s = r.state;
  assert.equal(r.events.filter((e) => e.type === "add").length, 1);
  assert.equal((r.events[0] as { eventId: string }).eventId, "yogurt#1");
  r = stepTracker(s, [obs("yogurt", "in_cart", 0.9)]); s = r.state;
  r = stepTracker(s, [obs("yogurt", "in_cart", 0.88)]); s = r.state;
  assert.equal(r.events.length, 0, "repeated frames cannot add the same unit");
  assert.equal(s.emitted.length, 1);
});

test("weak in_cart evidence asks once; evidence below 0.5 is ignored", () => {
  let s = initialTrackerState();
  s = stepTracker(s, [obs("chips", "held", 0.8)]).state;
  const r = stepTracker(s, [obs("chips", "in_cart", 0.6)]);
  assert.deepEqual(r.events.map((e) => e.type), ["ask"]);
  const again = stepTracker(r.state, [obs("chips", "in_cart", 0.6)]);
  assert.equal(again.events.length, 0);
  const ignored = stepTracker(initialTrackerState(), [obs("milk", "held", 0.4)]);
  assert.equal(ignored.events.length, 0);
});

test("held item absent for three frames is put back; new hold starts a new episode", () => {
  let s = initialTrackerState();
  s = stepTracker(s, [obs("lemonade", "held", 0.9)]).state;
  let r = stepTracker(s, []); s = r.state;
  r = stepTracker(s, []); s = r.state;
  assert.equal(r.events.length, 0);
  r = stepTracker(s, []); s = r.state;
  assert.deepEqual(r.events.map((e) => e.type), ["put-back"]);
  r = stepTracker(s, [obs("lemonade", "held", 0.9)]); s = r.state;
  assert.equal(s.tracks.lemonade.episode, 2);
});

test("manual Add claims the current hold so later camera evidence does not double-add", () => {
  let s = initialTrackerState();
  s = stepTracker(s, [obs("eggs", "held", 0.9)]).state;
  const claimed = claimHold(s, "eggs");
  assert.equal(claimed.alreadyCounted, false);
  const r = stepTracker(claimed.state, [obs("eggs", "in_cart", 0.95)]);
  assert.equal(r.events.filter((e) => e.type === "add").length, 0);
  // Camera already counted → first Add acknowledges
  let t = initialTrackerState();
  t = stepTracker(t, [obs("bread", "held", 0.9)]).state;
  t = stepTracker(t, [obs("bread", "in_cart", 0.9)]).state;
  assert.equal(claimHold(t, "bread").alreadyCounted, true);
});

test("the eleven scripted sample observations add yogurt once, never lemonade or sparkling water", () => {
  let s = initialTrackerState();
  const adds: string[] = [];
  const holds: string[] = [];
  for (const frame of SAMPLE_GROCERY_PLAYBACK) {
    const r = stepTracker(s, frame.observations);
    s = r.state;
    for (const e of r.events) { if (e.type === "add") adds.push(e.eventId); if (e.type === "held") holds.push(e.productKey); }
  }
  assert.deepEqual(adds, ["greek-yogurt-vanilla-32oz#1"]);
  assert.deepEqual(holds, ["greek-yogurt-vanilla-32oz", "lemonade-59oz", "sparkling-water-12pk"]);
  assert.equal(currentlyHeld(s)?.productKey, "sparkling-water-12pk");
});
