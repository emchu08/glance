import { CATALOG_BY_ID, GROCERY_CATALOG, STORE_OFFERS, STORES } from "@/data/grocery";
import type { Offer } from "@/data/types";
import { cartTotals } from "@/domain/grocery/cart";
import { aisleStops } from "@/domain/grocery/list";
import { storesByDistance, walkingDirectionsUrl } from "@/domain/grocery/stores";
import { paginateSteps, scaleIngredients } from "@/domain/gourmet/list";
import { formatCents } from "@/domain/money";
import { groceryOnline } from "./groceryPrice";
import { onlineLineKey } from "./reducer";
import { MODE_META, type LensAction, type LensState, type Mode, type Screen } from "./types";

export { groceryOnline };

/**
 * Pure screen description: every focusable control on the current screen as an
 * action descriptor with row/x coordinates. Rendering, pointer activation, D-pad
 * focus, native selection, and presenter controls all derive from this list.
 *
 * Row conventions: 0 = header, 1..n = content rows, 90 = bottom action row.
 */

const HEADER_ROW = 0;
export const ACTION_ROW = 90;

export const COMPOSER_KEYS: string[][] = [
  "abcdefghijklm".split(""),
  "nopqrstuvwxyz".split(""),
  "0123456789 -&".split(""),
];

/**
 * Row layout follows the original Glance lens: the top bar is row 0, then content rows
 * (its rows shifted by 3, so its row -1.5 is 1.5 here), with fractional x positions so
 * left/right move between buttons the way they sit on the 600×600 display.
 */
const ROW = (r: number) => r + 3;

const act = (id: string, label: string, row: number, x: number, events: LensAction["events"], extra: Partial<LensAction> = {}): LensAction =>
  ({ id, label, row: ROW(row), x, variant: "secondary", events, ...extra });

/** What the top bar's search runs for on this screen (null: nothing to search for yet). */
export function listingQuery(state: LensState): string | null {
  const s = state.screen;
  if (s.id === "online-listings") return state.listings.query || null;
  if (state.mode === "glimpse") {
    if (s.id === "glimpse-cart-item") return state.glimpse.saved.find((o) => o.id === (s.params?.offerId ?? state.glimpse.offerId))?.candidateLabel ?? null;
    const item = state.glimpse.candidates.find((c) => c.id === state.glimpse.chosenId) ?? state.glimpse.candidates[0];
    return state.glimpse.offersQuery ?? item?.label ?? null;
  }
  if (state.mode === "grocery") {
    const key = String(s.params?.productKey ?? state.grocery.heldKey ?? state.grocery.cart.at(-1)?.productKey ?? "");
    return key ? groceryQuery(state, key) : null;
  }
  const recipe = recipeOf(state, String(s.params?.recipeId ?? ""));
  return recipe?.ingredients[0]?.name ?? state.gourmet.dish ?? state.gourmet.hypotheses[0]?.name ?? null;
}

/** A grocery item as a store would list it: name and package size. */
export function groceryQuery(state: LensState, productKey: string): string {
  const product = CATALOG_BY_ID[productKey];
  const line = state.grocery.cart.find((l) => l.productKey === productKey);
  const name = product?.name ?? line?.label ?? (state.grocery.heldKey === productKey ? state.grocery.heldLabel : null) ?? productKey;
  const size = product?.size ?? line?.packageSize ?? (state.grocery.heldKey === productKey ? state.grocery.heldSize : null);
  return size ? `${name} ${size}` : name;
}

const searchEvents = (query: string): Pick<LensAction, "events" | "effect"> => ({
  events: [{ type: "listings/query", query }, { type: "listings/loading", query }, { type: "nav/push", screen: { id: "online-listings" } }],
  effect: { kind: "listings-search", query },
});

/**
 * The top bar on every screen inside a mode: Back (one step), Modes (the picker), then on
 * the right the wallet, Online listings for whatever is in view, and in Glimpse the cart.
 * Press Up from anywhere to reach it.
 */
function header(state: LensState): LensAction[] {
  const atRoot = state.stack.length === 0 && state.composer === null;
  const actions: LensAction[] = [
    { id: "hdr-back", label: "Back", row: HEADER_ROW, x: 0.07, variant: "icon", events: atRoot ? [{ type: "nav/replace", screen: { id: "picker" } }] : [{ type: "nav/back" }] },
    { id: "hdr-modes", label: "Modes", row: HEADER_ROW, x: 0.26, variant: "icon", events: [{ type: "nav/replace", screen: { id: "picker" } }], hint: MODE_META[state.mode].label },
  ];
  const glimpse = state.mode === "glimpse";
  const walletLabel = state.wallet.status === "ready" && state.wallet.last4 ? `${state.wallet.brand ?? "Card"} •• ${state.wallet.last4}` : "Wallet";
  actions.push({ id: "hdr-wallet", label: walletLabel, row: HEADER_ROW, x: glimpse ? 0.7 : 0.82, variant: "icon", events: [{ type: "nav/push", screen: { id: "wallet" } }], effect: { kind: "wallet-refresh" } });
  const query = listingQuery(state);
  if (query && state.screen.id !== "online-listings") actions.push({ id: "hdr-search", label: "Online listings", row: HEADER_ROW, x: glimpse ? 0.82 : 0.94, variant: "icon", ...searchEvents(query) });
  if (glimpse) {
    const n = state.glimpse.saved.length;
    actions.push({ id: "hdr-cart", label: n ? `Cart, ${n} item${n === 1 ? "" : "s"}` : "Cart", row: HEADER_ROW, x: 0.94, variant: "icon", events: state.screen.id === "glimpse-cart" ? [] : [{ type: "nav/push", screen: { id: "glimpse-cart" } }] });
  }
  return actions;
}

export function currentOffer(state: LensState): Offer | null {
  if (state.screen.id === "online-listings") return state.listings.offers.find((o) => o.id === state.listings.offerId) ?? null;
  if (state.screen.id === "glimpse-cart-item") return state.glimpse.saved.find((o) => o.id === (state.screen.params?.offerId ?? state.glimpse.offerId)) ?? null;
  return state.glimpse.offers.find((o) => o.id === state.glimpse.offerId) ?? null;
}

export function isPayable(o: Offer | null): o is Offer & { merchantId: string; sku: string } {
  return !!o && o.kind === "connect_merchant" && !!o.merchantId && !!o.sku && o.priceCents !== null;
}

/** Payment underway for this offer: the card gives way to its status (described in paymentActions). */
export function payingFor(state: LensState, offer: Offer | null): boolean {
  const pay = state.payment;
  return !!offer && pay.offerId === offer.id && ["pending", "needs-action", "confirmed", "accepted", "error", "recovery"].includes(pay.status);
}

/**
 * An offer card's actions: the card itself opens the listing, then ‹ Buy [Add to cart | Remove] ›.
 * ‹ › are always there so focus doesn't jump as more listings stream in. Buy pays on the glasses
 * with Stripe's test card (no sign-in, no saved card), then sends the listing to the paired phone;
 * a listing without a price can't be charged, so its Buy only sends the page to the phone.
 */
function cardActions(state: LensState, offer: Offer | null, step: (d: 1 | -1) => LensAction["events"], secondary: LensAction): LensAction[] {
  if (!offer) return [];
  if (payingFor(state, offer)) return paymentActions(state);
  const buy: LensAction = offer.priceCents === null
    ? act("buy", "Buy", 2, 0.36, [], { variant: "primary", effect: { kind: "handoff", handoffKind: "buy", title: offer.name, url: offer.url } })
    : demoBuy(state, offer, `Buy ${formatCents(offer.priceCents)}`);
  return [
    buy,
    secondary,
    act("open-listing", "Open listing", 1, 0.5, [], { effect: { kind: "handoff", handoffKind: "view", title: offer.name, url: offer.url } }),
    act("offer-prev", "Previous offer", 2, 0.06, step(-1)),
    act("offer-next", "Next offer", 2, 0.94, step(1)),
  ];
}

/** Pay with Stripe's test card. Each press has its own attempt key; a repeat while paying is ignored. */
function demoBuy(state: LensState, offer: Offer, label: string, id = "buy", row = 2, x = 0.36): LensAction {
  const attemptKey = `${offer.id}:${state.session}:${state.revision}`;
  return act(id, label, row, x, [{ type: "payment/demo-start", offerId: offer.id, originMode: state.mode, attemptKey }], { variant: "pay", effect: { kind: "demo-purchase", offerId: offer.id, attemptKey } });
}

/** Add to cart: Grocery's own cart in Grocery (at the listing's price), the shopping cart in Glimpse and Gourmet. */
function cartAdd(state: LensState, offer: Offer | null): LensAction {
  const grocery = state.mode === "grocery";
  const inCart = !!offer && (grocery ? state.grocery.cart.some((l) => l.productKey === onlineLineKey(offer.id)) : state.glimpse.saved.some((s) => s.id === offer.id));
  const events: LensAction["events"] = !offer || inCart ? [] : grocery ? [{ type: "grocery/add-offer", offer }] : [{ type: "glimpse/save-toggle", offer }];
  return act("cart-add", inCart ? "In cart" : "Add to cart", 2, 0.66, events, { effect: inCart ? undefined : { kind: "persist" }, hint: inCart ? "pressed" : undefined });
}

function paymentActions(state: LensState): LensAction[] {
  const p = state.payment;
  if (p.demo) {
    const offer = findPaidOffer(state, p.offerId);
    switch (p.status) {
      case "pending": return [act("pay-wait", "Paying…", 2, 0.5, [], { variant: "pay", disabled: true })];
      case "confirmed": case "accepted": return [act("pay-done", "Done", 2, 0.5, [{ type: "payment/clear" }], { variant: "primary" })];
      default: return [
        ...(offer && offer.priceCents !== null ? [demoBuy(state, offer, "Try again", "pay-retry", 2, 0.3)] : []),
        act("pay-back", "Back", 2, 0.72, [{ type: "payment/clear" }]),
      ];
    }
  }
  switch (p.status) {
    case "pending":
      return [act("pay-wait", "Paying…", 2, 0.5, [], { variant: "pay", disabled: true })];
    case "needs-action":
      return [
        act("pay-recover", "Verify on phone", 2, 0.3, [], { variant: "primary", effect: { kind: "handoff", handoffKind: "checkout", title: "Verify your payment", url: `/payments/recover/${p.orderId ?? ""}` } }),
        act("pay-back", "Back", 2, 0.72, [{ type: "nav/back" }]),
      ];
    case "confirmed":
    case "accepted":
      return [
        act("pay-done", "Done", 2, 0.3, [{ type: "payment/clear" }], { variant: "primary", effect: { kind: "orders-refresh" } }),
        act("pay-orders", "Orders", 2, 0.72, [{ type: "payment/clear" }, { type: "nav/push", screen: { id: "wallet-orders" } }], { effect: { kind: "orders-refresh" } }),
      ];
    case "error":
    case "recovery":
      return [
        act("pay-retry", "Try again", 2, 0.3, [{ type: "payment/quoting", offerId: p.offerId ?? "", originMode: p.originMode ?? state.mode }], { variant: "primary", effect: { kind: "quote", offerId: p.offerId ?? "" } }),
        act("pay-back", "Back", 2, 0.72, [{ type: "payment/clear" }]),
      ];
    default:
      return [];
  }
}

function findPaidOffer(state: LensState, id: string | null): Offer | null {
  if (!id) return null;
  return state.glimpse.offers.find((o) => o.id === id) ?? state.listings.offers.find((o) => o.id === id) ?? state.glimpse.saved.find((o) => o.id === id) ?? null;
}

function recipeOf(state: LensState, id: string) {
  return state.gourmet.recipes.find((x) => x.id === id) ?? state.gourmet.saved.find((x) => x.id === id) ?? null;
}

/** Sample stores for a product, same item first, then by price (the comparison list). */
export function compareOffers(state: LensState, productKey: string) {
  const live = state.grocery.insights[productKey]?.data?.comparisons;
  return [...(live ?? STORE_OFFERS.filter((o) => o.productId === productKey))].sort((a, b) => Number(b.match === "same") - Number(a.match === "same") || a.priceCents - b.priceCents);
}

/** Live online prices for a grocery item (from the listing search), cheapest priced first. */
/** No camera to scan with: the iPhone app's glasses camera is off, or no phone is sending pictures. */
export function cameraOff(state: LensState): boolean {
  return state.capture === "native" && ["none", "waiting", "camera-off", "reconnecting", "unavailable"].includes(state.pairing.status);
}

/** A scan control: with no camera it says so instead of starting a scan that can't get a picture. */
function scanAct(state: LensState, id: string, label: string, row: number, x: number, events: LensAction["events"], opts: Partial<LensAction> = {}): LensAction {
  if (!cameraOff(state)) return act(id, label, row, x, events, opts);
  const text = state.pairing.status === "camera-off" ? "Camera isn’t on yet · connect your glasses on your phone" : "No camera yet · open Glance on your phone";
  return act(id, label, row, x, [{ type: "toast", text }], { ...opts, effect: undefined });
}

export function describeScreen(state: LensState): LensAction[] {
  if (state.composer) return describeComposer(state);
  const s = state.screen;
  const h = header(state);
  switch (s.id) {

    case "picker":
      return (["glimpse", "grocery", "gourmet"] as Mode[]).map((m, i): LensAction => ({ id: `mode-${m}`, label: MODE_META[m].label, row: 1 + i, x: 0.5, variant: "row", events: [{ type: "mode/set", mode: m }], listIndex: i, hint: MODE_META[m].hint }));

    // ── Glimpse ──
    case "glimpse": {
      const g = state.glimpse;
      if (g.scan === "scanning") return [...h, act("scan-cancel", "Cancel", 0, 0.5, [{ type: "glimpse/scan-cancel" }])];
      const top = g.scan === "result" ? g.candidates.find((c) => c.id === g.chosenId) ?? g.candidates[0] : undefined;
      const scan = scanAct(state, "scan", g.scan === "idle" && !g.candidates.length ? "Scan item" : "Scan again", top ? -1 : 0, 0.5, [], { variant: top ? "secondary" : "primary", effect: { kind: "glimpse-scan" } });
      if (!top) return [...h, scan];
      return [...h,
        act("see-offers", "See offers", 0, 0.36, [{ type: "glimpse/offers-loading", query: top.label }, { type: "nav/push", screen: { id: "glimpse-offers" } }], { variant: "primary", effect: { kind: "glimpse-offers", candidateId: top.id } }),
        act("not-this", "Not this", 0, 0.8, [{ type: "nav/push", screen: { id: "glimpse-candidates" } }]),
        scan,
      ];
    }
    case "glimpse-candidates": {
      const list = state.glimpse.frozenCandidates ?? state.glimpse.candidates;
      const fromOffers = state.stack.at(-1)?.id === "glimpse-offers";
      return [...h,
        ...list.map((c, i) => ({
          ...act(`cand-${c.id}`, c.label, i, 0.5, [{ type: "glimpse/choose", candidateId: c.id }, { type: "nav/back" }, ...(fromOffers ? [] : [{ type: "nav/push" as const, screen: { id: "glimpse-offers" as const } }]), { type: "glimpse/offers-loading", query: c.label }], { variant: "row", effect: { kind: "glimpse-offers", candidateId: c.id } }),
          listIndex: i,
        })),
        { ...scanAct(state, "keep-looking", "Scan again", list.length, 0.5, [{ type: "nav/back" }], { variant: "row", effect: { kind: "glimpse-scan" } }), listIndex: list.length },
      ];
    }
    case "glimpse-offers": {
      const g = state.glimpse;
      const change = act("change", "Change item", 0, 0.5, [{ type: "nav/push", screen: { id: "glimpse-candidates" } }]);
      if (!g.offers.length) {
        if (g.offersStatus === "loading" || !g.offersQuery) return [...h, change];
        return [...h,
          act("retry-offers", "Try again", 2, 0.26, [{ type: "glimpse/offers-loading", query: g.offersQuery }], { variant: "primary", effect: { kind: "glimpse-offers", candidateId: g.chosenId ?? g.candidates[0]?.id ?? "" } }),
          act("search-online", "Search online", 2, 0.72, searchEvents(g.offersQuery).events, { effect: searchEvents(g.offersQuery).effect }),
          change,
        ];
      }
      const offer = currentOffer(state);
      return [...h, ...cardActions(state, offer, (d) => [{ type: "glimpse/offer-step", delta: d }], cartAdd(state, offer)), ...(payingFor(state, offer) ? [] : [change])];
    }
    case "glimpse-cart": {
      const saved = state.glimpse.saved;
      if (!saved.length) return [...h, act("keep-shopping", "Keep shopping", 0, 0.5, [{ type: "nav/back" }], { variant: "primary" })];
      return [...h, ...saved.map((o, i) => ({ ...act(`saved-${o.id}`, `${o.name}, ${o.retailer}`, i, 0.5, [{ type: "glimpse/offer-select", offerId: o.id }, { type: "nav/push", screen: { id: "glimpse-cart-item", params: { offerId: o.id } } }], { variant: "row" }), listIndex: i }))];
    }
    case "glimpse-cart-item": {
      const offer = currentOffer(state);
      if (!offer) return [...h, act("keep-shopping", "Keep shopping", 0, 0.5, [{ type: "nav/back" }], { variant: "primary" })];
      return [...h, ...cardActions(state, offer, (d) => [{ type: "glimpse/offer-step", delta: d }], act("cart-remove", "Remove", 2, 0.66, [{ type: "glimpse/remove-saved", offerId: offer.id }, { type: "nav/back" }], { effect: { kind: "persist" } }))];
    }

    case "online-listings": {
      const l = state.listings;
      const search: LensAction = { ...act("search", l.query || "Search for an item", 0, 0.5, [{ type: "composer/open", field: "listings-query", value: l.query }]), variant: "row", field: "listings-query" };
      if (!l.offers.length) {
        if (l.status === "loading") return [...h, search];
        if (l.status === "idle") return [...h, search, act("go", "Search", 2, 0.5, [{ type: "listings/loading", query: l.query }], { variant: "primary", effect: { kind: "listings-search", query: l.query }, disabled: !l.query.trim() })];
        return [...h, search, act("retry", "Search again", 2, 0.5, [{ type: "listings/loading", query: l.query }], { variant: "primary", effect: { kind: "listings-search", query: l.query } })];
      }
      const offer = currentOffer(state);
      return [...h, ...cardActions(state, offer, (d) => [{ type: "listings/step", delta: d }], cartAdd(state, offer)), ...(payingFor(state, offer) ? [] : [search])];
    }

    case "handoff": {
      if (state.handoff.status === "failed") {
        return [...h,
          act("retry", "Try again", 0, 0.3, [], { variant: "primary", effect: state.handoff.url && state.handoff.kind ? { kind: "handoff", handoffKind: state.handoff.kind, title: state.handoff.title ?? "", url: state.handoff.url } : undefined }),
          act("done", "Done", 0, 0.72, [{ type: "nav/root" }]),
        ];
      }
      return [...h, act("done", "Done", 0, 0.3, [{ type: "nav/root" }], { variant: "primary" }), act("keep", "Keep shopping", 0, 0.72, [{ type: "nav/back" }])];
    }

    // ── Grocery ──
    case "grocery": {
      const gr = state.grocery;
      const out: LensAction[] = [...h];
      let row = 0;
      if (gr.pendingAsk) {
        out.push(act("ask-yes", "Yes, add it", row, 0.3, [{ type: "grocery/confirm-ask", yes: true }], { variant: "primary" }));
        out.push(act("ask-no", "No", row, 0.75, [{ type: "grocery/confirm-ask", yes: false }]));
        row += 1;
      }
      gr.cart.forEach((l, i) => {
        out.push({ ...act(`line-${l.productKey}`, l.label, row, 0.5, [{ type: "nav/push", screen: { id: "grocery-edit", params: { productKey: l.productKey } } }], { variant: "row" }), listIndex: i });
        row += 1;
      });
      const checkout = gr.cart.length > 0;
      out.push(act("list", "List", row, checkout ? 0.16 : 0.3, [{ type: "nav/push", screen: { id: "grocery-list" } }]));
      out.push(act("add", "Add", row, checkout ? 0.45 : 0.7, [{ type: "nav/push", screen: { id: "grocery-manual" } }]));
      if (checkout) out.push(act("finish", "Check out", row, 0.78, [{ type: "grocery/finish" }], { variant: "primary", effect: { kind: "grocery-exit" } }));
      if (gr.undo.length) out.push(act("undo", "Undo", -1, 0.85, [{ type: "grocery/undo" }]));
      out.push(gr.scanning ? act("scan", "Pause scan", -1.5, 0.82, [{ type: "grocery/scan-toggle", on: false }]) : scanAct(state, "scan", "Start scan", -1.5, 0.82, [{ type: "grocery/scan-toggle", on: true }]));
      return out;
    }
    case "grocery-item": {
      const key = String(s.params?.productKey ?? "");
      const ins = state.grocery.insights[key]?.data;
      const best = ins?.bestSame ?? null;
      const online = state.capture === "sample" && best && (best.store === "Amazon" || best.store === "Temu") && (ins?.homePriceCents ?? Infinity) > best.priceCents;
      const name = CATALOG_BY_ID[key]?.name ?? state.grocery.heldLabel ?? key;
      const hasCompare = state.capture !== "sample" || compareOffers(state, key).length > 0;
      // The camera's pick: Back (or Not it) means it named the wrong item, so look again.
      const fromCamera = state.grocery.heldKey === key;
      const notIt: LensAction["events"] = [{ type: "grocery/dismiss-held" }];
      return [...(fromCamera ? h.map((a) => (a.id === "hdr-back" ? { ...a, events: notIt } : a)) : h),
        act("add", "Add", 0, 0.3, [{ type: "grocery/add-held" }], { variant: "primary", effect: { kind: "persist" } }),
        ...(fromCamera ? [act("not-it", "Not it", 0, 0.92, notIt)] : []),
        ...(online && best
          ? [act("buy-amazon", `Buy on ${best.store}`, 0, 0.72, [{ type: "grocery/bought", retailer: best.store, name, priceCents: best.priceCents, url: onlineSearchUrl(best.store, `${name} ${best.size}`) }])]
          : hasCompare
            ? [act("compare", "Compare", 0, 0.72, [{ type: "nav/push", screen: { id: "grocery-compare", params: { productKey: key } } }])]
            : []),
      ];
    }
    case "grocery-compare": {
      const key = String(s.params?.productKey ?? "");
      const live = groceryOnline(state, key);
      const query = groceryQuery(state, key);
      if (live) {
        return [...h,
          ...live.offers.map((o, i) => ({ ...act(`online-${i}`, o.retailer, i, 0.5, [], { variant: "row", effect: { kind: "handoff", handoffKind: "view", title: o.name, url: o.url } }), listIndex: i })),
          ...(live.status !== "loading" && !live.offers.length ? [act("search-online", "Search online", 0, 0.5, searchEvents(query).events, { variant: "row", effect: searchEvents(query).effect })] : []),
        ];
      }
      const name = CATALOG_BY_ID[key]?.name ?? key;
      return [...h, ...compareOffers(state, key).map((c, i) => {
        const store = STORES.find((st) => st.name === c.store);
        const events: LensAction["events"] = c.store === "Amazon" || c.store === "Temu"
          ? [{ type: "grocery/bought", retailer: c.store, name, priceCents: c.priceCents, url: onlineSearchUrl(c.store, `${name} ${c.size}`) }]
          : store ? [{ type: "nav/push", screen: { id: "nav", params: { storeId: store.id } } }] : [{ type: "toast", text: `${c.store} · sample price` }];
        const effect: LensAction["effect"] = store && !(c.store === "Amazon" || c.store === "Temu") ? { kind: "handoff", handoffKind: "nav", title: `Directions to ${store.name}`, url: walkingDirectionsUrl(state.location, store) } : undefined;
        return { ...act(`cmp-${i}`, c.store, i, 0.5, events, { variant: "row", effect }), listIndex: i };
      })];
    }
    case "grocery-edit": {
      const key = String(s.params?.productKey ?? "");
      const line = state.grocery.cart.find((l) => l.productKey === key);
      if (!line) return [...h, act("done", "Done", 0, 0.5, [{ type: "nav/back" }], { variant: "primary" })];
      const priced = line.priceSource !== "unknown" && line.priceSource !== "shelf-label" && line.priceSource !== "estimate";
      return [...h,
        act("done", "Done", priced ? 1 : 2, 0.7, [{ type: "nav/back" }], { variant: "primary" }),
        act("qty-minus", "Fewer", 0, 0.3, [{ type: "grocery/qty", productKey: key, delta: -1 }]),
        act("qty-plus", "More", 0, 0.7, [{ type: "grocery/qty", productKey: key, delta: 1 }]),
        ...(priced ? [] : [{ ...act("price", line.unitPriceCents === null ? "Enter price" : formatCents(line.unitPriceCents), 1, 0.5, [{ type: "composer/open", field: `price:${key}`, value: line.unitPriceCents === null ? "" : (line.unitPriceCents / 100).toFixed(2) }]), variant: "row" as const, field: `price:${key}` }]),
        act("remove", "Remove", priced ? 1 : 2, 0.3, [{ type: "grocery/remove", productKey: key }, { type: "nav/back" }]),
      ];
    }
    case "grocery-manual": {
      const text = state.grocery.manualText.trim();
      const matches = text ? GROCERY_CATALOG.filter((p) => p.name.toLowerCase().includes(text.toLowerCase())) : GROCERY_CATALOG;
      const typeAction: LensAction = { ...act("manual-type", text || "Type any item", -1, 0.5, [{ type: "composer/open", field: "grocery-manual", value: text }]), variant: "row", field: "grocery-manual" };
      const custom = text && !matches.some((m) => m.name.toLowerCase() === text.toLowerCase())
        ? [{ ...act("manual-add-custom", `Add “${text}”`, 0, 0.5, [{ type: "grocery/add-manual", productKey: `custom-${text.toLowerCase().replace(/\s+/g, "-")}`, label: text, packageSize: null, unitPriceCents: null, source: "unknown" }], { variant: "row" }), listIndex: 0 }]
        : [];
      const rows = matches.map((p, i) => ({ ...act(`manual-${p.id}`, p.name, i + custom.length, 0.5, [{ type: "grocery/add-manual", productKey: p.id, label: p.name, packageSize: p.size, unitPriceCents: p.qfcPriceCents, source: "catalog" }], { variant: "row", effect: { kind: "persist" } }), listIndex: i + custom.length }));
      return [...h, typeAction, ...custom, ...rows];
    }
    case "grocery-list": {
      const rows = state.list.map((it, i) => ({ ...act(`list-${it.key}`, it.name, i, 0.5, [{ type: "list/toggle", key: it.key }], { variant: "row", effect: { kind: "persist" }, hint: it.done ? "pressed" : undefined }), listIndex: i }));
      const stops = aisleStops(state.list);
      return [...h, ...rows, ...(stops.length ? [{ ...act("find", "Find next item", state.list.length, 0.5, [{ type: "nav/push", screen: { id: "grocery-find", params: { stop: 0 } } }], { variant: "row" }), listIndex: state.list.length }] : [])];
    }
    case "grocery-checkout":
      return [...h, act("done", "Done", 0, 0.5, [{ type: "nav/root" }], { variant: "primary" })];
    case "grocery-bought": {
      const b = state.grocery.bought[state.grocery.bought.length - 1];
      return [...h, act("done", "Done", 0, 0.3, [{ type: "nav/root" }], { variant: "primary" }), act("view", "View listing", 0, 0.75, [], { effect: b ? { kind: "handoff", handoffKind: "view", title: b.name, url: b.url } : undefined })];
    }
    case "grocery-find": {
      const stops = aisleStops(state.list);
      const i = Number(s.params?.stop ?? 0);
      return [...h,
        act("done", "Done", 0, stops.length > 1 ? 0.3 : 0.5, [{ type: "nav/back" }], { variant: "primary" }),
        ...(stops.length > 1 ? [act("next", "Next item", 0, 0.75, [{ type: "nav/replace", screen: { id: "grocery-find", params: { stop: (i + 1) % stops.length } } }])] : []),
      ];
    }

    // ── Gourmet ──
    case "gourmet": {
      const g = state.gourmet;
      if (g.scan === "scanning") return [...h, act("scan-cancel", "Cancel", 0, 0.5, [{ type: "gourmet/scan-cancel" }])];
      if (g.scan === "result" && g.hypotheses.length) {
        return [...h,
          ...g.hypotheses.map((hy, i) => ({ ...act(`dish-${i}`, hy.name, i, 0.5, [{ type: "gourmet/choose", dish: hy.name }], { variant: "row", effect: { kind: "gourmet-recipes", dish: hy.name } }), listIndex: i })),
          { ...scanAct(state, "rescan", "Rescan", g.hypotheses.length, 0.5, [], { variant: "row", effect: { kind: "gourmet-scan" } }), listIndex: g.hypotheses.length },
        ];
      }
      return [...h, scanAct(state, "scan", g.scan === "no-food" || g.scan === "error" ? "Scan again" : "Scan dish", 0, 0.5, [], { variant: "primary", effect: { kind: "gourmet-scan" } })];
    }
    case "gourmet-recipes": {
      const g = state.gourmet;
      if (g.recipesStatus === "loading") return h;
      if (g.recipesStatus === "error" || g.recipesStatus === "empty" || !g.recipes.length) return [...h, act("retry", "Try again", 0, 0.5, [{ type: "gourmet/recipes-loading" }], { variant: "primary", effect: { kind: "gourmet-recipes", dish: g.dish ?? "" } })];
      return [...h, ...g.recipes.map((r, i) => ({ ...act(`recipe-${r.id}`, r.title, i, 0.5, [{ type: "gourmet/open-recipe", recipeId: r.id }], { variant: "row" }), listIndex: i }))];
    }
    case "gourmet-recipe": {
      const id = String(s.params?.recipeId ?? "");
      const r = recipeOf(state, id);
      if (!r) return [...h, act("back", "Back", 0, 0.5, [{ type: "nav/back" }], { variant: "primary" })];
      const servings = state.gourmet.servings[id] ?? r.servings;
      const deselected = new Set(state.gourmet.deselected[id] ?? []);
      const ings = scaleIngredients(r.ingredients, r.servings, servings);
      const last = ings.length + 1;
      const selectedCount = ings.filter((i) => !deselected.has(i.name)).length;
      const saved = state.gourmet.saved.some((x) => x.id === id);
      return [...h,
        ...(selectedCount ? [act("add-list", "Add to list", last, 0.2, [{ type: "gourmet/add-to-list", recipeId: id }], { variant: "primary", effect: { kind: "persist" } })] : []),
        act("shop-ingredients", "Shop ingredients", last + 1, 0.5, [{ type: "nav/push", screen: { id: "gourmet-shop", params: { recipeId: id } } }]),
        act("servings-down", "Fewer servings", 0, 0.62, [{ type: "gourmet/servings", recipeId: id, delta: -1 }]),
        act("servings-up", "More servings", 0, 0.9, [{ type: "gourmet/servings", recipeId: id, delta: 1 }]),
        ...ings.map((ing, i) => ({ ...act(`ing-${i}`, ing.name, i + 1, 0.5, [{ type: "gourmet/toggle-ingredient", recipeId: id, name: ing.name }], { variant: "row", hint: deselected.has(ing.name) ? undefined : "pressed" }), listIndex: i })),
        act("steps", "Steps", last, 0.55, [{ type: "nav/push", screen: { id: "gourmet-steps", params: { recipeId: id, page: 0 } } }]),
        act("save-recipe", saved ? "Saved" : "Save", last, 0.84, saved ? [] : [{ type: "gourmet/save", recipeId: id }], { effect: saved ? undefined : { kind: "persist" }, hint: saved ? "pressed" : undefined }),
      ];
    }
    case "gourmet-steps": {
      const id = String(s.params?.recipeId ?? "");
      const page = Number(s.params?.page ?? 0);
      const pages = paginateSteps(recipeOf(state, id)?.steps ?? []);
      return [...h,
        ...(page < pages.length - 1
          ? [act("next", "Next", 0, 0.75, [{ type: "nav/replace", screen: { id: "gourmet-steps", params: { recipeId: id, page: page + 1 } } }], { variant: "primary" })]
          : [act("done", "Done", 0, 0.75, [{ type: "nav/back" }], { variant: "primary" })]),
        ...(page > 0 ? [act("prev", "Previous", 0, 0.25, [{ type: "nav/replace", screen: { id: "gourmet-steps", params: { recipeId: id, page: page - 1 } } }])] : []),
      ];
    }
    case "gourmet-shop": {
      const r = recipeOf(state, String(s.params?.recipeId ?? ""));
      if (!r) return [...h, act("back", "Back", 0, 0.5, [{ type: "nav/back" }], { variant: "primary" })];
      return [...h, ...r.ingredients.map((ing, i) => ({ ...act(`shop-${i}`, ing.name, i, 0.5, searchEvents(ing.name).events, { variant: "row", effect: searchEvents(ing.name).effect }), listIndex: i }))];
    }
    case "gourmet-added": {
      const recipeId = state.stack.slice().reverse().find((x) => x.id === "gourmet-recipe")?.params?.recipeId;
      return [...h,
        act("shop-list", "Shop in Grocery", 0, 0.5, [{ type: "mode/set", mode: "grocery" }, { type: "nav/push", screen: { id: "grocery-list" } }], { variant: "primary" }),
        state.capture === "sample" || !recipeId
          ? act("stores", "Stores near you", 1, 0.3, [{ type: "nav/push", screen: { id: "stores" } }])
          : act("shop-ingredients", "Find ingredients", 1, 0.3, [{ type: "nav/push", screen: { id: "gourmet-shop", params: { recipeId: String(recipeId) } } }]),
        act("done", "Done", 1, 0.78, [{ type: "nav/back" }, { type: "nav/back" }]),
      ];
    }

    case "stores": {
      const sorted = storesByDistance(state.location.lat, state.location.lng, STORES).slice(0, 4);
      const geo = state.location.source === "demo" ? [{ ...act("locate", "Use my location", 0, 0.5, [], { variant: "row", effect: { kind: "locate" } }), listIndex: 0 }] : [];
      return [...h, ...geo, ...sorted.map((st, i) => ({
        ...act(`store-${st.id}`, st.name, i + geo.length, 0.5, [{ type: "nav/push", screen: { id: "nav", params: { storeId: st.id } } }], { variant: "row", effect: { kind: "handoff", handoffKind: "nav", title: `Directions to ${st.name}`, url: walkingDirectionsUrl(state.location, st) } }),
        listIndex: i + geo.length,
      }))];
    }
    case "nav":
      return [...h, act("done", "Done", 0, 0.5, [{ type: "nav/back" }], { variant: "primary" })];

    // ── Wallet ──
    case "wallet": {
      const w = state.wallet;
      if (w.status === "ready") {
        return [...h,
          { ...act("w-orders", "Orders", 0, 0.5, [{ type: "nav/push", screen: { id: "wallet-orders" } }], { variant: "row", effect: { kind: "orders-refresh" }, hint: w.orders.length ? `${w.orders.length} recent` : "None yet" }), listIndex: 0 },
          { ...act("w-autobuy", w.autoBuy === "on" ? "Auto-buy on" : w.autoBuy === "paused" ? "Auto-buy paused" : "Auto-buy off", 1, 0.5,
            w.autoBuy === "off" ? [{ type: "toast", text: "Turn on Auto-buy on your phone" }] : [], { variant: "row", effect: w.autoBuy === "off" ? undefined : { kind: "wallet-pause-rule", pause: w.autoBuy === "on" }, hint: w.autoBuy === "on" ? "Pause" : w.autoBuy === "paused" ? "Resume" : w.ruleSummary ?? "Set up on phone" }), listIndex: 1 },
          act("w-done", "Done", 3, 0.5, [{ type: "nav/back" }], { variant: "primary" }),
        ];
      }
      // No saved card needed: Buy pays with Stripe's test card on the glasses.
      return [...h, act("w-done", "Done", 3, 0.5, [{ type: "nav/back" }], { variant: "primary" })];
    }
    case "wallet-orders": {
      const orders = state.wallet.orders;
      if (!orders.length) return [...h, act("back", "Back", 0, 0.5, [{ type: "nav/back" }], { variant: "primary" })];
      return [...h, ...orders.map((o, i) => ({ ...act(`order-${o.id}`, o.merchantName, i, 0.5, [{ type: "nav/push", screen: { id: "wallet-order", params: { orderId: o.id } } }], { variant: "row", hint: `${formatCents(o.totalCents)} · ${o.status}` }), listIndex: i }))];
    }
    case "wallet-order":
      return [...h, act("done", "Done", 0, 0.5, [{ type: "nav/back" }], { variant: "primary" })];

    case "more":
    case "connect":
      return [...h, act("done", "Done", 0, 0.5, [{ type: "nav/back" }], { variant: "primary" })];
  }
  return h;
}

export function onlineSearchUrl(store: string, query: string): string {
  if (store === "Temu") return `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(query)}`;
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
}

function describeComposer(state: LensState): LensAction[] {
  const c = state.composer!;
  const keys = COMPOSER_KEYS[c.page] ?? COMPOSER_KEYS[0];
  const a: LensAction[] = keys.map((k, i) => ({ id: `key-${k === " " ? "space" : k}`, label: k === " " ? "␣" : k, row: 1 + Math.floor(i / 7), x: i % 7, variant: "icon" as const, events: [{ type: "composer/type" as const, char: k }] }));
  a.push({ id: "key-page", label: "More keys", row: 3, x: 0, variant: "secondary", events: [{ type: "composer/page", delta: 1 }] });
  a.push({ id: "key-delete", label: "Delete", row: 3, x: 1, variant: "secondary", events: [{ type: "composer/delete" }] });
  a.push({ id: "key-done", label: "Done", row: ACTION_ROW, x: 0, variant: "primary", events: [{ type: "composer/done" }] });
  a.push({ id: "key-cancel", label: "Cancel", row: ACTION_ROW, x: 1, variant: "secondary", events: [{ type: "composer/cancel" }] });
  return a;
}

export const cartTotal = (state: LensState) => cartTotals(state.grocery.cart);

/**
 * Actions as the iPhone app receives them. Its decoder (installed builds included) reads `row` and
 * `x` as integers, and a fraction would fail the whole message, so the phone would never see the
 * lens as loaded. Rows are rounded; x is sent in hundredths.
 */
export function publishedActions(actions: LensAction[], rects: { id: string; x: number; y: number; width: number; height: number }[]) {
  return actions.filter((a) => !a.disabled).map((a) => ({
    id: a.id, label: a.label, row: Math.round(a.row), x: Math.round(a.x * 100), variant: a.variant, rect: rects.find((r) => r.id === a.id) ?? null,
  }));
}
export type { Screen };

/** True for two seconds after anything was added to a cart: scans wait, so the item just added doesn't pop back up. */
export function scanCoolingDown(state: LensState, now: number): boolean {
  return (state.scanCooldownUntil ?? 0) > now;
}
