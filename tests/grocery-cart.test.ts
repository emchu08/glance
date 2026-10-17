import { test } from "node:test";
import assert from "node:assert/strict";
import { addToCart, cartTotals, setManualPrice, setQuantity } from "../src/domain/grocery/cart.ts";
import { matchCatalogProduct } from "../src/domain/grocery/matching.ts";
import { buildTripSummary } from "../src/domain/grocery/exit.ts";
import { deriveFlags, deriveNudge, sampleInsight } from "../src/domain/grocery/insights.ts";
import { aisleStops, homeStoreStock } from "../src/domain/grocery/list.ts";
import { NUTRITION_BY_ID } from "../src/data/grocery.ts";

test("integer-cent totals keep unknown prices unknown", () => {
  let cart = addToCart([], { productKey: "a", label: "A", packageSize: null, unitPriceCents: 549, priceSource: "catalog", eventId: "a#1" });
  cart = addToCart(cart, { productKey: "b", label: "B", packageSize: null, unitPriceCents: null, priceSource: "unknown", eventId: "b#1" });
  cart = addToCart(cart, { productKey: "a", label: "A", packageSize: null, unitPriceCents: 549, priceSource: "catalog", eventId: "a#2" });
  cart = addToCart(cart, { productKey: "a", label: "A", packageSize: null, unitPriceCents: 549, priceSource: "catalog", eventId: "a#2" }); // duplicate event
  const t = cartTotals(cart);
  assert.equal(t.knownSubtotalCents, 1098);
  assert.equal(t.unknownLines, 1);
  assert.equal(t.units, 3);
});

test("manual and shelf prices are not overwritten by catalog prices", () => {
  let cart = addToCart([], { productKey: "a", label: "A", packageSize: null, unitPriceCents: 500, priceSource: "catalog", eventId: "1" });
  cart = setManualPrice(cart, "a", 450);
  cart = addToCart(cart, { productKey: "a", label: "A", packageSize: null, unitPriceCents: 500, priceSource: "catalog", eventId: "2" });
  assert.equal(cart[0].unitPriceCents, 450);
  assert.equal(cart[0].priceSource, "manual");
  assert.equal(setQuantity(cart, "a", 0).length, 0);
});

test("catalog matching uses required/excluded tokens and leaves ties unresolved", () => {
  assert.equal(matchCatalogProduct("Zero sugar lemonade 59oz")?.id, "lemonade-zero-59oz");
  assert.equal(matchCatalogProduct("Simply Lemonade")?.id, "lemonade-59oz");
  assert.equal(matchCatalogProduct("Diet lemonade"), null);
  assert.equal(matchCatalogProduct("Sea salt potato chips")?.id, "potato-chips-8oz");
  assert.equal(matchCatalogProduct("peanut butter")?.id, "peanut-butter-16oz");
  assert.equal(matchCatalogProduct("ice cream"), null);
  assert.equal(matchCatalogProduct("eggplant"), null);
});

test("trip summary: this trip + three largest categories + the rest, zero segments omitted", () => {
  const s = buildTripSummary([{ productKey: "x", label: "X", packageSize: null, quantity: 2, unitPriceCents: 300, currency: "USD", priceSource: "catalog", confirmed: true, events: ["1", "2"] }], 449);
  assert.equal(s.thisTripCents, 1049);
  assert.equal(s.segments.length, 5);
  assert.deepEqual(s.segments.map((x) => x.label), ["This trip", "Dairy", "Meat", "Beverages", "The rest"]);
  assert.equal(s.segments[4].cents, 4120 + 1290 + 4460 + 2870 + 2210);
  const empty = buildTripSummary([], 0);
  assert.equal(empty.segments[0].label, "Dairy");
});

test("diet flags prioritize allergy, then gluten, then keto; nudge uses only supplied facts", () => {
  assert.deepEqual(deriveFlags(NUTRITION_BY_ID["peanut-butter-16oz"]).map((f) => f.kind), ["allergy"]);
  assert.deepEqual(deriveFlags(NUTRITION_BY_ID["fettuccine-16oz"]).map((f) => f.text.split(" ")[0]), ["Contains", "Not"]);
  assert.equal(deriveFlags(NUTRITION_BY_ID["chicken-breast-1lb"]).length, 0);
  const nudge = deriveNudge("lemonade-59oz")!;
  assert.match(nudge, /3rd this month/);
  assert.match(nudge, /\$27\.92/);
  assert.ok(nudge.split(/\s+/).length <= 18);
  assert.match(deriveNudge("sparkling-water-12pk")!, /Amazon/);
  assert.equal(deriveNudge("garlic-head"), null);
  assert.equal(sampleInsight("sparkling-water-12pk")?.cheapestOnline?.priceCents, 449);
});

test("home store stock explains the Parmesan gap and suggests a store with all items; aisle stops ordered", () => {
  const list = [
    { key: "parmesan", name: "Parmesan, grated", amounts: [], recipes: [], done: false },
    { key: "fettuccine", name: "Fettuccine", amounts: [], recipes: [], done: false },
    { key: "saffron", name: "Saffron", amounts: [], recipes: [], done: false },
  ];
  const stock = homeStoreStock(list);
  assert.deepEqual(stock.unavailable, ["Parmesan, grated"]);
  assert.deepEqual(stock.unknown, ["Saffron"]);
  assert.ok(["Trader Joe's", "WinCo Foods"].includes(stock.suggestedStore!));
  assert.deepEqual(aisleStops(list).map((s) => s.aisle), [5, 12]);
});
