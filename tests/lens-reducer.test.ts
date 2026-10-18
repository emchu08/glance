import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, lensReducer } from "../src/lens/reducer.ts";
import { describeScreen, publishedActions, scanCoolingDown } from "../src/lens/screens.ts";
import { defaultFocus, moveFocus } from "../src/lens/navigation.ts";
import { fixtureState, FIXTURE_IDS, PAYMENT_FIXTURE_IDS } from "../src/lens/fixtures.ts";
import type { LensState } from "../src/lens/types.ts";
import { SAMPLE_GROCERY_PLAYBACK } from "../src/data/grocery.ts";
import { rankCandidates } from "../src/domain/glimpse/interest.ts";
import { STREET_CANDIDATES } from "../src/data/glimpse.ts";

const boot = (): LensState => lensReducer(initialState(), { type: "init" });

test("mode switch keeps shopping state and cancels stale scans; stale results are ignored", () => {
  let s = boot();
  s = lensReducer(s, { type: "mode/set", mode: "glimpse" });
  s = lensReducer(s, { type: "glimpse/scan-start", scanId: 1 });
  s = lensReducer(s, { type: "mode/set", mode: "grocery" });
  assert.equal(s.glimpse.scan, "idle");
  const ranked = rankCandidates(Object.values(STREET_CANDIDATES), { seenCounts: {} });
  s = lensReducer(s, { type: "glimpse/scan-result", scanId: 1, candidates: ranked, frameIndex: 1 });
  assert.equal(s.glimpse.candidates.length, 0, "late result after cancel must be ignored");
});

test("grocery frames drive the held card and additions; finish trip clears the cart and keeps the list", () => {
  let s = boot();
  s = lensReducer(s, { type: "mode/set", mode: "grocery" });
  SAMPLE_GROCERY_PLAYBACK.forEach((f, i) => { s = lensReducer(s, { type: "grocery/frame", observations: f.observations, frameIndex: i + 1 }); });
  assert.equal(s.grocery.cart.length, 1);
  assert.equal(s.grocery.cart[0].productKey, "greek-yogurt-vanilla-32oz");
  assert.equal(s.screen.id, "grocery-item", "held sparkling water opens the card");
  s = lensReducer(s, { type: "grocery/add-held" });
  assert.equal(s.screen.id, "grocery");
  assert.equal(s.grocery.cart.length, 2);
  s = lensReducer(s, { type: "grocery/finish" });
  assert.equal(s.screen.id, "grocery-checkout");
  assert.equal(s.grocery.cart.length, 0);
  assert.equal(s.grocery.summary?.items, 2);
  assert.equal(lensReducer(s, { type: "grocery/finish" }), s, "empty trip cannot finish");
});


const seen = (productKey: string, state: "held" | "in_cart" | "on_shelf", confidence = 0.95) =>
  [{ productKey, label: productKey, state, confidence, packageSize: null, priceCents: 399 }] as const;
const groceryAt = () => lensReducer(boot(), { type: "mode/set", mode: "grocery" });
const units = (s: LensState, key: string) => s.grocery.cart.find((l) => l.productKey === key)?.quantity ?? 0;

test("Add on the item card always adds that item, unless this very hold is already in the cart", () => {
  // The camera asked "did it go in?" (unanswered): it is not in the cart, so Add adds it.
  let s = groceryAt();
  s = lensReducer(s, { type: "grocery/frame", observations: [...seen("oat-milk", "held")], frameIndex: 1 });
  assert.equal(s.screen.id, "grocery-item");
  s = lensReducer(s, { type: "grocery/frame", observations: [...seen("oat-milk", "in_cart", 0.6)], frameIndex: 2 });
  assert.ok(s.grocery.pendingAsk, "the camera asks");
  s = lensReducer({ ...s, screen: { id: "grocery-item", params: { productKey: "oat-milk" } } }, { type: "grocery/add-held" });
  assert.equal(units(s, "oat-milk"), 1, "Add adds it");
  assert.equal(s.grocery.pendingAsk, null, "and answers the question");
  assert.equal(s.grocery.acknowledgement, "Added oat-milk");

  // Pressing Add again for the same hold doesn't double-count, and says so.
  s = lensReducer({ ...s, screen: { id: "grocery-item", params: { productKey: "oat-milk" } } }, { type: "grocery/add-held" });
  assert.equal(units(s, "oat-milk"), 1);
  assert.equal(s.grocery.acknowledgement, "Already in your cart");

  // The card's item is what's added, even if the camera now thinks another item is held.
  let t = groceryAt();
  t = lensReducer(t, { type: "grocery/frame", observations: [...seen("bread", "held")], frameIndex: 1 });
  t = lensReducer(t, { type: "grocery/frame", observations: [...seen("eggs", "held")], frameIndex: 2 });
  t = lensReducer({ ...t, screen: { id: "grocery-item", params: { productKey: "bread" } } }, { type: "grocery/add-held" });
  assert.equal(units(t, "bread"), 1);
  assert.equal(units(t, "eggs"), 0);
});

test("adding starts a 2 s scan cooldown, so the item just added doesn't pop straight back up", () => {
  const before = Date.now();
  let s = groceryAt();
  assert.equal(scanCoolingDown(s, before), false);
  s = lensReducer(s, { type: "grocery/add-manual", productKey: "bananas-lb", label: "Bananas", packageSize: "per lb", unitPriceCents: 69, source: "catalog" });
  assert.equal(scanCoolingDown(s, Date.now()), true, "cooling down right after an add");
  assert.equal(scanCoolingDown(s, before + 2_100), false, "over after two seconds");
  s = lensReducer(groceryAt(), { type: "glimpse/save-toggle", offer: { id: "o9", name: "x", retailer: "r", url: "https://example.com", imageUrl: null, priceCents: 100, match: "similar", kind: "external_link", origin: "live" } });
  assert.equal(scanCoolingDown(s, Date.now()), true, "any add to cart");
});

test("Add to cart from online listings: Grocery's cart in Grocery, the shopping cart elsewhere", () => {
  const offer = { id: "https://shop.example/oat", name: "Oat milk 64 oz", retailer: "Shop", url: "https://shop.example/oat", imageUrl: null, priceCents: 449, match: "exact" as const, kind: "external_link" as const, origin: "live" as const };
  let s = groceryAt();
  s = lensReducer(s, { type: "listings/query", query: "oat milk" });
  s = lensReducer(s, { type: "listings/result", query: "oat milk", offers: [offer], done: true });
  s = lensReducer(s, { type: "nav/push", screen: { id: "online-listings" } });
  const add = describeScreen(s).find((a) => a.id === "cart-add")!;
  assert.equal(add.label, "Add to cart");
  for (const e of add.events) s = lensReducer(s, e);
  const line = s.grocery.cart.find((l) => l.label === offer.name);
  assert.ok(line, "the item is in the grocery cart");
  assert.equal(line?.unitPriceCents, 449);
  assert.equal(line?.priceSource, "online");
  assert.equal(describeScreen(s).find((a) => a.id === "cart-add")?.label, "In cart");

  let g = lensReducer(boot(), { type: "mode/set", mode: "gourmet" });
  g = lensReducer(g, { type: "listings/query", query: "oat milk" });
  g = lensReducer(g, { type: "listings/result", query: "oat milk", offers: [offer], done: true });
  g = lensReducer(g, { type: "nav/push", screen: { id: "online-listings" } });
  const gAdd = describeScreen(g).find((a) => a.id === "cart-add")!;
  assert.equal(gAdd.label, "Add to cart");
  for (const e of gAdd.events) g = lensReducer(g, e);
  assert.equal(g.glimpse.saved.length, 1, "in the shopping cart");
});

test("reset preserves saved offers, recipes, list and pending payment but clears the physical cart", () => {
  let s = boot();
  s = lensReducer(s, { type: "mode/set", mode: "grocery" });
  s = lensReducer(s, { type: "grocery/add-manual", productKey: "bananas-lb", label: "Bananas", packageSize: "per lb", unitPriceCents: 69, source: "catalog" });
  s = lensReducer(s, { type: "glimpse/save-toggle", offer: { id: "o1", name: "x", retailer: "r", url: "https://example.com", imageUrl: null, priceCents: 1, match: "similar", kind: "external_link", origin: "sample" } });
  s = lensReducer(s, { type: "payment/status", status: "pending", orderId: "ord" });
  s = lensReducer(s, { type: "reset" });
  assert.equal(s.grocery.cart.length, 0);
  assert.equal(s.glimpse.saved.length, 1);
  assert.equal(s.payment.status, "pending");
});

test("payment submit is guarded against repeats and the Buy label equals the quote total", () => {
  let s = fixtureState("payment-ready", false, boot());
  const buy = describeScreen(s).find((a) => a.id === "buy")!;
  assert.equal(buy.label, "Buy $12.00");
  assert.equal(buy.variant, "pay");
  assert.notEqual(defaultFocus(describeScreen(s)), "buy", "focus never defaults onto Buy");
  s = lensReducer(s, { type: "payment/submit", attemptKey: "k" });
  assert.equal(s.payment.status, "pending");
  assert.equal(lensReducer(s, { type: "payment/submit", attemptKey: "k2" }).payment.attemptKey, "k");
  assert.equal(describeScreen(s).find((a) => a.id === "pay-wait")?.disabled, true);
});

test("every fixture describes a screen with reachable header and at least one enabled action", () => {
  for (const id of [...FIXTURE_IDS, ...PAYMENT_FIXTURE_IDS]) {
    for (const live of [false, true]) {
      const s = fixtureState(id, live, boot());
      const actions = describeScreen(s);
      assert.ok(actions.some((a) => !a.disabled), `${id} ${live} has an enabled action`);
      const ids = new Set(actions.map((a) => a.id));
      assert.equal(ids.size, actions.length, `${id}: action ids are unique`);
      // The iPhone app decodes row and x as integers; one fraction fails the whole message.
      for (const p of publishedActions(actions, [])) assert.ok(Number.isInteger(p.row) && Number.isInteger(p.x), `${id}: ${p.id} publishes integer row/x`);
      // D-pad can reach the header from the default focus.
      if (s.screen.id !== "picker") {
        let cur = defaultFocus(actions);
        for (let i = 0; i < 14 && cur && !cur.startsWith("hdr-"); i += 1) cur = moveFocus(actions, cur, "up");
        assert.ok(cur?.startsWith("hdr-"), `${id}: header reachable with Up`);
      }
    }
  }
});

test("composer edits the listings query and Done commits it", () => {
  let s = boot();
  s = lensReducer(s, { type: "nav/push", screen: { id: "online-listings" } });
  s = lensReducer(s, { type: "composer/open", field: "listings-query", value: "" });
  for (const ch of "tote") s = lensReducer(s, { type: "composer/type", char: ch });
  s = lensReducer(s, { type: "composer/delete" });
  s = lensReducer(s, { type: "composer/done" });
  assert.equal(s.listings.query, "tot");
  assert.equal(s.composer, null);
});
