import { test } from "node:test";
import assert from "node:assert/strict";
import { cuesFor } from "../src/lens/cues.ts";
import { initialState, lensReducer } from "../src/lens/reducer.ts";
import { describeScreen } from "../src/lens/screens.ts";
import { fixtureState } from "../src/lens/fixtures.ts";
import { STREET_CANDIDATES } from "../src/data/glimpse.ts";
import { rankCandidates } from "../src/domain/glimpse/interest.ts";
import type { LensEvent, LensState } from "../src/lens/types.ts";

const boot = (): LensState => lensReducer(initialState(), { type: "init" });
const step = (s: LensState, e: LensEvent) => ({ prev: s, next: lensReducer(s, e) });

test("a scan that finds something chimes; one that finds nothing or fails sounds an error", () => {
  const scanning = lensReducer(lensReducer(boot(), { type: "mode/set", mode: "glimpse" }), { type: "glimpse/scan-start", scanId: 1 });
  const found = step(scanning, { type: "glimpse/scan-result", scanId: 1, candidates: rankCandidates(Object.values(STREET_CANDIDATES), { seenCounts: {} }), frameIndex: 1 });
  assert.deepEqual(cuesFor(found.prev, found.next), ["found"]);
  const empty = step(scanning, { type: "glimpse/scan-result", scanId: 1, candidates: [], frameIndex: 1 });
  assert.deepEqual(cuesFor(empty.prev, empty.next), ["error"]);
  const failed = step(scanning, { type: "glimpse/scan-error", scanId: 1, error: "Scan failed" });
  assert.deepEqual(cuesFor(failed.prev, failed.next), ["error"]);
  const stale = step(scanning, { type: "glimpse/scan-result", scanId: 7, candidates: [], frameIndex: 1 });
  assert.deepEqual(cuesFor(stale.prev, stale.next), [], "an ignored stale result is silent");
});

test("adding to the grocery cart chimes; nothing else does", () => {
  const s = lensReducer(boot(), { type: "mode/set", mode: "grocery" });
  const add = step(s, { type: "grocery/add-offer", offer: { id: "https://shop.example/milk", name: "Milk", retailer: "Target", url: "https://shop.example/milk", imageUrl: null, priceCents: 399, match: "exact", kind: "external_link", origin: "live" } });
  assert.deepEqual(cuesFor(add.prev, add.next), ["added"]);
  const nav = step(s, { type: "mode/set", mode: "glimpse" });
  assert.deepEqual(cuesFor(nav.prev, nav.next), []);
});

test("a test-card buy chimes when paid, pings when the link reaches the phone, and never speaks", () => {
  let s = fixtureState("external-offer", false, boot());
  for (const e of describeScreen(s).find((a) => a.id === "buy")!.events) s = lensReducer(s, e);
  const paid = step(s, { type: "payment/status", status: "confirmed", orderId: "pi_1" });
  assert.deepEqual(cuesFor(paid.prev, paid.next), ["paid"]);
  const sending = step(paid.next, { type: "payment/phone-link", status: "sending" });
  assert.deepEqual(cuesFor(sending.prev, sending.next), []);
  const sent = step(sending.next, { type: "payment/phone-link", status: "sent" });
  assert.deepEqual(cuesFor(sent.prev, sent.next), ["sent"]);
  const lost = step(sending.next, { type: "payment/phone-link", status: "failed" });
  assert.deepEqual(cuesFor(lost.prev, lost.next), ["error"]);
  const alone = step(paid.next, { type: "payment/phone-link", status: "unpaired" });
  assert.deepEqual(cuesFor(alone.prev, alone.next), [], "no phone paired is not an error");

  const declined = step(s, { type: "payment/status", status: "error", error: "Your card was declined." });
  assert.deepEqual(cuesFor(declined.prev, declined.next), ["error"]);
});
