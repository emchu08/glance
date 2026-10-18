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
  s = lensReducer(s, { type: "grocery/add-offer", offer: { id: "https://shop.example/bananas", name: "Bananas", retailer: "Target", url: "https://shop.example/bananas", imageUrl: null, priceCents: 69, match: "exact", kind: "external_link", origin: "live" } });
  assert.equal(scanCoolingDown(s, Date.now()), true, "cooling down right after an add");
  assert.equal(scanCoolingDown(s, before + 2_100), false, "over after two seconds");
  s = lensReducer(groceryAt(), { type: "glimpse/save-toggle", offer: { id: "o9", name: "x", retailer: "r", url: "https://example.com", imageUrl: null, priceCents: 100, match: "similar", kind: "external_link", origin: "live" } });
  assert.equal(scanCoolingDown(s, Date.now()), true, "any add to cart");
});

const water = (state: "held" | "in_cart" | "on_shelf") =>
  [{ productKey: "arrowhead-spring-water", label: "Arrowhead spring water", state, confidence: 0.95, packageSize: "24 pk", priceCents: null, estimatedPriceCents: 599 }];
const liveGrocery = () => lensReducer(lensReducer(groceryAt(), { type: "capture/set", capture: "native" }), { type: "mode/set", mode: "grocery" });
const frame = (s: LensState, obs: ReturnType<typeof water>) => lensReducer(s, { type: "grocery/frame", observations: obs, frameIndex: s.grocery.frameIndex + 1 });
const offer = (priceCents: number) => ({ id: `https://shop.example/w${priceCents}`, name: "Arrowhead 24 pk", retailer: "Target", url: "https://shop.example/w", imageUrl: null, priceCents, match: "exact" as const, kind: "external_link" as const, origin: "live" as const });

test("Add puts the price the card shows into the cart, for items outside the catalog too", () => {
  // Only the camera's typical price is known: the cart gets it, marked as an estimate.
  let s = frame(liveGrocery(), water("held"));
  assert.equal(s.screen.id, "grocery-item");
  s = lensReducer(s, { type: "grocery/add-held" });
  let line = s.grocery.cart.find((l) => l.productKey === "arrowhead-spring-water");
  assert.equal(line?.unitPriceCents, 599);
  assert.equal(line?.priceSource, "estimate");
  // An online price that arrives afterwards replaces the estimate.
  s = lensReducer(s, { type: "grocery/online", productKey: "arrowhead-spring-water", status: "ready", offers: [offer(749), offer(679)] });
  line = s.grocery.cart.find((l) => l.productKey === "arrowhead-spring-water");
  assert.equal(line?.unitPriceCents, 679);
  assert.equal(line?.priceSource, "online");

  // Online prices already on the card: Add uses the one shown.
  let t = frame(liveGrocery(), water("held"));
  t = lensReducer(t, { type: "grocery/online", productKey: "arrowhead-spring-water", status: "ready", offers: [offer(649)] });
  t = lensReducer(t, { type: "grocery/add-held" });
  assert.equal(t.grocery.cart[0]?.unitPriceCents, 649);
});

test("holding an added item up for a long time never asks to add it again", () => {
  let s = frame(liveGrocery(), water("held"));
  s = lensReducer(s, { type: "grocery/add-held" });
  for (let i = 0; i < 10; i += 1) {
    s = frame(s, water("held"));
    assert.equal(s.screen.id, "grocery", "no new card while it's still in hand");
  }
  // One frame where the camera misreads it as on the shelf isn't a put-down.
  s = frame(frame(frame(s, water("on_shelf")), water("held")), water("held"));
  assert.equal(s.screen.id, "grocery");
  assert.equal(units(s, "arrowhead-spring-water"), 1);
  // Put down for two frames, then picked up again: that's another one.
  s = frame(frame(s, water("in_cart")), water("in_cart"));
  s = frame(s, water("held"));
  assert.equal(s.screen.id, "grocery-item", "a new pick-up opens the card");
  s = lensReducer(s, { type: "grocery/add-held" });
  assert.equal(units(s, "arrowhead-spring-water"), 2);

  // Camera-confirmed adds behave the same.
  let c = frame(frame(liveGrocery(), water("held")), water("in_cart"));
  assert.equal(units(c, "arrowhead-spring-water"), 1);
  c = lensReducer(c, { type: "nav/back" });
  for (let i = 0; i < 5; i += 1) c = frame(c, water("held"));
  assert.equal(c.screen.id, "grocery");
  assert.equal(units(c, "arrowhead-spring-water"), 1);
});

test("Back (or Not it) on a wrong pick returns to the cart and rescans; the wrong item never adds itself", () => {
  let s = frame(liveGrocery(), water("held"));
  assert.equal(s.screen.id, "grocery-item");
  const back = describeScreen(s).find((a) => a.id === "hdr-back")!;
  assert.deepEqual(back.events, [{ type: "grocery/dismiss-held" }], "the back gesture means not it");
  assert.ok(describeScreen(s).some((a) => a.id === "not-it"));
  for (const e of back.events) s = lensReducer(s, e);
  assert.equal(s.screen.id, "grocery", "back to the cart");
  // Still in hand: the same wrong pick doesn't pop straight back, and dropping it in the cart doesn't add it.
  s = frame(s, water("held"));
  assert.equal(s.screen.id, "grocery");
  s = frame(s, water("in_cart"));
  assert.equal(units(s, "arrowhead-spring-water"), 0);
  // A different identification of what's in hand opens its own card at once.
  s = lensReducer(s, { type: "grocery/frame", observations: [{ productKey: "smartwater", label: "Smartwater", state: "held", confidence: 0.95, packageSize: null, priceCents: null }], frameIndex: 9 });
  assert.equal(s.screen.id, "grocery-item");
  assert.equal(s.screen.params?.productKey, "smartwater");
});

test("with the glasses camera off, scan buttons say so instead of scanning", () => {
  let g = lensReducer(lensReducer(boot(), { type: "capture/set", capture: "native" }), { type: "mode/set", mode: "glimpse" });
  g = lensReducer(g, { type: "pairing/set", status: "camera-off" });
  const scan = describeScreen(g).find((a) => a.id === "scan")!;
  assert.equal(scan.effect, undefined, "no scan starts");
  assert.equal(scan.events[0]?.type, "toast");
  g = lensReducer(g, scan.events[0]);
  assert.match(g.toast?.text ?? "", /camera isn’t on/i);
  // Ready (or turning on for a scan): scanning works.
  for (const status of ["connected", "camera-starting"] as const) {
    const on = lensReducer(g, { type: "pairing/set", status });
    assert.equal(describeScreen(on).find((a) => a.id === "scan")?.effect?.kind, "glimpse-scan", status);
  }
  let gr = lensReducer(lensReducer(liveGrocery(), { type: "pairing/set", status: "camera-off" }), { type: "nav/root" });
  const start = describeScreen(gr).find((a) => a.id === "scan")!;
  for (const e of start.events) gr = lensReducer(gr, e);
  assert.equal(gr.grocery.scanning, false, "Grocery doesn't start scanning without a camera");
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
  s = lensReducer(s, { type: "grocery/add-offer", offer: { id: "https://shop.example/bananas", name: "Bananas", retailer: "Target", url: "https://shop.example/bananas", imageUrl: null, priceCents: 69, match: "exact", kind: "external_link", origin: "live" } });
  s = lensReducer(s, { type: "glimpse/save-toggle", offer: { id: "o1", name: "x", retailer: "r", url: "https://example.com", imageUrl: null, priceCents: 1, match: "similar", kind: "external_link", origin: "sample" } });
  s = lensReducer(s, { type: "payment/status", status: "pending", orderId: "ord" });
  s = lensReducer(s, { type: "reset" });
  assert.equal(s.grocery.cart.length, 0);
  assert.equal(s.glimpse.saved.length, 1);
  assert.equal(s.payment.status, "pending");
});

test("any priced listing is bought on the glasses with the Stripe test card, guarded against repeats", () => {
  let s = fixtureState("external-offer", false, boot());
  const buy = describeScreen(s).find((a) => a.id === "buy")!;
  const offer = s.glimpse.offers.find((o) => o.id === s.glimpse.offerId)!;
  assert.ok(offer.priceCents !== null && offer.kind === "external_link", "an ordinary store listing");
  assert.match(buy.label, /^Buy \$/);
  assert.equal(buy.effect?.kind, "demo-purchase", "pays here with the test card");
  for (const e of buy.events) s = lensReducer(s, e);
  assert.equal(s.payment.status, "pending");
  assert.equal(s.payment.demo, true);
  const key = s.payment.attemptKey;
  assert.equal(lensReducer(s, { type: "payment/demo-start", offerId: offer.id, originMode: "glimpse", attemptKey: "again" }).payment.attemptKey, key, "a second press while paying is ignored");
  assert.equal(describeScreen(s).find((a) => a.id === "pay-wait")?.disabled, true);

  const done = lensReducer(s, { type: "payment/status", status: "confirmed", orderId: "pi_1" });
  assert.deepEqual(describeScreen(done).filter((a) => a.id.startsWith("pay-")).map((a) => a.id), ["pay-done"]);
  const linked = lensReducer(lensReducer(done, { type: "payment/phone-link", status: "sending" }), { type: "payment/phone-link", status: "sent" });
  assert.equal(linked.payment.phoneLink, "sent", "the listing link goes to the phone after paying");
  assert.equal(linked.payment.status, "confirmed", "sending the link never changes the payment");
  const cleared = lensReducer(linked, { type: "payment/clear" });
  assert.equal(lensReducer(cleared, { type: "payment/phone-link", status: "failed" }).payment.phoneLink, undefined, "a late link result after Done is ignored");
  const failed = lensReducer(s, { type: "payment/status", status: "error", error: "Your card was declined." });
  const retry = describeScreen(failed).find((a) => a.id === "pay-retry")!;
  assert.equal(retry.effect?.kind, "demo-purchase");
  assert.notEqual(retry.effect?.kind === "demo-purchase" && retry.effect.attemptKey, key, "a retry is a new attempt");
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

test("Back goes to the page a screen belongs under, passing over pop-ups and confirmations", () => {
  const nav = (s: LensState, ...ids: LensState["screen"][]) => ids.reduce((x, screen) => lensReducer(x, { type: "nav/push", screen }), s);
  const back = (s: LensState) => lensReducer(s, { type: "nav/back" });

  // Gourmet: recipe → steps → added to list → More. Back: steps, the recipe, the recipe list, the scan.
  let s = lensReducer(boot(), { type: "mode/set", mode: "gourmet" });
  s = nav(s, { id: "gourmet-recipes" }, { id: "gourmet-recipe", params: { recipeId: "r1" } }, { id: "gourmet-steps", params: { recipeId: "r1", page: 0 } }, { id: "gourmet-added" }, { id: "more", params: { of: "gourmet-added" } });
  s = back(s);
  assert.equal(s.screen.id, "gourmet-steps", "More and the confirmation under it are passed over");
  s = back(s);
  assert.equal(s.screen.id, "gourmet-recipe");
  assert.equal(s.screen.params?.recipeId, "r1");
  s = back(s);
  assert.equal(s.screen.id, "gourmet-recipes");
  s = back(s);
  assert.equal(s.screen.id, "gourmet");
  assert.equal(s.stack.length, 0);

  // Grocery: compare reached through the list and a sent link still goes back to the item, then the cart.
  s = lensReducer(boot(), { type: "mode/set", mode: "grocery" });
  s = nav(s, { id: "grocery-list" }, { id: "grocery-item", params: { productKey: "k" } }, { id: "handoff" }, { id: "grocery-compare", params: { productKey: "k" } });
  s = back(s);
  assert.equal(s.screen.id, "grocery-item");
  s = back(s);
  assert.equal(s.screen.id, "grocery", "the cart, not the list it was opened over");
  assert.equal(s.stack.length, 0);

  // Glimpse: a cart item opened from offers goes back to the cart, then the scan.
  s = lensReducer(boot(), { type: "mode/set", mode: "glimpse" });
  s = nav(s, { id: "glimpse-offers" }, { id: "glimpse-candidates" }, { id: "glimpse-cart" }, { id: "glimpse-cart-item", params: { offerId: "o" } });
  s = back(s);
  assert.equal(s.screen.id, "glimpse-cart");
  s = back(s);
  assert.equal(s.screen.id, "glimpse");

  // A screen with no set parent steps back, skipping a confirmation under it.
  s = lensReducer(boot(), { type: "mode/set", mode: "glimpse" });
  s = nav(s, { id: "glimpse-offers" }, { id: "handoff" }, { id: "wallet" });
  s = back(s);
  assert.equal(s.screen.id, "glimpse-offers");
});
