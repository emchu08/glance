import { test } from "node:test";
import assert from "node:assert/strict";
import { prefetchEligible, rankCandidates, updateSeenCounts } from "../src/domain/glimpse/interest.ts";
import { STREET_CANDIDATES, sampleOffersFor } from "../src/data/glimpse.ts";
import { sampleGlimpseFrame, sampleOffersForLabel } from "../src/domain/sample.ts";
import { mergeOffers } from "../src/lens/reducer.ts";

test("interest ranking formula and five-frame persistence window", () => {
  const ranked = rankCandidates(Object.values(STREET_CANDIDATES), { seenCounts: { "gray-sweater": 3, "black-backpack": 3, "red-shoulder-bag": 1 } });
  assert.equal(ranked[0].id, "gray-sweater");
  assert.ok(ranked[0].interest > ranked[1].interest && ranked[1].interest > ranked[2].interest);
  assert.ok(ranked.every((c) => c.interest <= 1));
  let w: string[][] = [];
  let counts: Record<string, number> = {};
  for (let i = 0; i < 7; i += 1) ({ counts, window: w } = updateSeenCounts(counts, ["a"], w));
  assert.equal(counts.a, 5);
  assert.equal(prefetchEligible(ranked).length, 2);
});

test("sample frames progress 2 → 3 → 2 candidates and offers map by label tokens", () => {
  assert.equal(sampleGlimpseFrame(0, []).candidates.length, 2);
  assert.equal(sampleGlimpseFrame(1, []).candidates.length, 3);
  assert.equal(sampleGlimpseFrame(2, []).candidates.length, 2);
  assert.equal(sampleOffersFor("Gray crewneck sweater").length, 4);
  assert.equal(sampleOffersFor("Black rucksack").length, 3);
  assert.equal(sampleOffersFor("Lamp").length, 0);
  const withDemo = sampleOffersForLabel("Black backpack", "black-backpack");
  assert.equal(withDemo[0].kind, "external_link", "best external match stays first");
  assert.ok(withDemo.some((o) => o.kind === "connect_merchant"));
  for (const o of withDemo.filter((x) => x.kind === "external_link")) assert.match(o.url, /^https:\/\//);
});

test("streamed offers merge by stable id preserving first-seen order", () => {
  const a = sampleOffersFor("sweater");
  const merged = mergeOffers(a.slice(0, 2), [{ ...a[0], priceCents: 1 }, a[3]]);
  assert.deepEqual(merged.map((o) => o.id), [a[0].id, a[1].id, a[3].id]);
  assert.equal(merged[0].priceCents, 1);
});
