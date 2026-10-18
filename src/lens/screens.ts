import { CATALOG_BY_ID, GROCERY_CATALOG, STORES } from "@/data/grocery";
import type { Offer } from "@/data/types";
import { cartTotals } from "@/domain/grocery/cart";
import { aisleStops } from "@/domain/grocery/list";
import { storesByDistance, walkingDirectionsUrl } from "@/domain/grocery/stores";
import { paginateSteps, scaleIngredients } from "@/domain/gourmet/list";
import { formatCents } from "@/domain/money";
import { LIST_WINDOW } from "./reducer";
import { MODE_META, type LensAction, type LensState, type Mode, type Screen } from "./types";

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

function header(state: LensState): LensAction[] {
  const canBack = state.stack.length > 0 || state.composer !== null || (state.screen.id !== "picker" && state.screen.id !== rootOf(state.mode));
  const actions: LensAction[] = [];
  if (canBack) actions.push({ id: "hdr-back", label: "Back", row: HEADER_ROW, x: 0, variant: "icon", events: [{ type: "nav/back" }] });
  actions.push({ id: "hdr-modes", label: MODE_META[state.mode].label, row: HEADER_ROW, x: 1, variant: "icon", events: [{ type: "nav/replace", screen: { id: "picker" } }], hint: "Modes" });
  const walletLabel = state.wallet.status === "ready" && state.wallet.last4 ? `${state.wallet.brand ?? "Card"} •• ${state.wallet.last4}` : "Wallet";
  actions.push({ id: "hdr-wallet", label: walletLabel, row: HEADER_ROW, x: 2, variant: "icon", events: [{ type: "nav/push", screen: { id: "wallet" } }], effect: { kind: "wallet-refresh" } });
  return actions;
}

function rootOf(mode: Mode) {
  return mode === "glimpse" ? "glimpse" : mode === "grocery" ? "grocery" : "gourmet";
}

const primary = (id: string, label: string, events: LensAction["events"], effect?: LensAction["effect"], x = 0): LensAction =>
  ({ id, label, row: ACTION_ROW, x, variant: "primary", events, effect });
const secondary = (id: string, label: string, events: LensAction["events"], effect?: LensAction["effect"], x = 1): LensAction =>
  ({ id, label, row: ACTION_ROW, x, variant: "secondary", events, effect });
const more = (x = 1): LensAction => ({ id: "more", label: "More", row: ACTION_ROW, x, variant: "secondary", events: [{ type: "nav/more" }] });
const rowAction = (id: string, label: string, i: number, events: LensAction["events"], effect?: LensAction["effect"], hint?: string): LensAction =>
  ({ id, label, row: 1 + i, x: 0, variant: "row", events, effect, listIndex: i, hint });

export function currentOffer(state: LensState): Offer | null {
  if (state.screen.id === "online-listings") return state.listings.offers.find((o) => o.id === state.listings.offerId) ?? null;
  if (state.screen.id === "glimpse-cart-item") return state.glimpse.saved.find((o) => o.id === (state.screen.params?.offerId ?? state.glimpse.offerId)) ?? null;
  return state.glimpse.offers.find((o) => o.id === state.glimpse.offerId) ?? null;
}

export function isPayable(o: Offer | null): o is Offer & { merchantId: string; sku: string } {
  return !!o && o.kind === "connect_merchant" && !!o.merchantId && !!o.sku && o.priceCents !== null;
}

/** Shared offer-card actions used by Glimpse offers, Online listings, and saved-cart detail. */
function offerActions(state: LensState, offer: Offer | null, stepEvent: (d: 1 | -1) => LensAction["events"], mode: "offers" | "listings" | "saved"): LensAction[] {
  const a: LensAction[] = [];
  if (!offer) return a;
  const pay = state.payment;
  const payingThis = pay.offerId === offer.id && pay.status !== "idle";
  if (payingThis && ["pending", "needs-action", "confirmed", "accepted", "error", "recovery"].includes(pay.status)) {
    // Payment surface replaces the card; its actions are described in paymentActions.
    return paymentActions(state);
  }
  a.push({ id: "offer-prev", label: "Previous", row: 5, x: 0, variant: "quiet", events: stepEvent(-1) });
  a.push({ id: "offer-next", label: "Next", row: 5, x: 2, variant: "quiet", events: stepEvent(1) });
  if (isPayable(offer)) {
    if (state.wallet.status === "ready") {
      if (pay.offerId === offer.id && pay.status === "ready" && pay.quote) {
        a.push({ id: "buy", label: `Buy ${formatCents(pay.quote.totalCents)}`, row: ACTION_ROW, x: 0, variant: "pay", events: [{ type: "payment/submit", attemptKey: `${pay.quote.version}:${state.session}` }], effect: { kind: "purchase", offerId: offer.id } });
      } else if (pay.offerId === offer.id && pay.status === "quoting") {
        a.push({ id: "buy", label: "Getting total…", row: ACTION_ROW, x: 0, variant: "pay", events: [], disabled: true });
      } else {
        a.push({ id: "get-total", label: "Get total", row: ACTION_ROW, x: 0, variant: "pay", events: [{ type: "payment/quoting", offerId: offer.id, originMode: state.mode }], effect: { kind: "quote", offerId: offer.id } });
      }
    } else if (state.wallet.status === "signed-out" || state.wallet.status === "not-ready" || state.wallet.status === "unknown") {
      a.push({ id: "wallet-setup", label: "Set up wallet", row: ACTION_ROW, x: 0, variant: "pay", events: [{ type: "nav/push", screen: { id: "wallet" } }], effect: { kind: "wallet-refresh" } });
    }
  } else if (mode === "saved") {
    a.push(primary("open-external", "Send to phone", [], { kind: "handoff", handoffKind: "view", title: offer.name, url: offer.url }));
  } else {
    const saved = state.glimpse.saved.some((s) => s.id === offer.id);
    a.push(saved
      ? primary("save", "In cart", [{ type: "nav/push", screen: { id: "glimpse-cart" } }])
      : primary("save", "Save", [{ type: "glimpse/save-toggle", offer }], { kind: "persist" }));
  }
  a.push(more());
  return a;
}

function paymentActions(state: LensState): LensAction[] {
  const p = state.payment;
  switch (p.status) {
    case "pending":
      return [{ id: "pay-wait", label: "Paying…", row: ACTION_ROW, x: 0, variant: "pay", events: [], disabled: true }];
    case "needs-action":
      return [
        primary("pay-recover", "Verify on phone", [], { kind: "handoff", handoffKind: "checkout", title: "Verify your payment", url: `/payments/recover/${p.orderId ?? ""}` }),
        secondary("pay-back", "Back", [{ type: "nav/back" }]),
      ];
    case "confirmed":
    case "accepted":
      return [primary("pay-done", "Done", [{ type: "payment/clear" }], { kind: "orders-refresh" }), secondary("pay-orders", "Orders", [{ type: "payment/clear" }, { type: "nav/push", screen: { id: "wallet-orders" } }], { kind: "orders-refresh" })];
    case "error":
    case "recovery":
      return [primary("pay-retry", "Try again", [{ type: "payment/quoting", offerId: p.offerId ?? "", originMode: p.originMode ?? state.mode }], { kind: "quote", offerId: p.offerId ?? "" }), secondary("pay-back", "Back", [{ type: "payment/clear" }])];
    default:
      return [];
  }
}

export function describeScreen(state: LensState): LensAction[] {
  if (state.composer) return describeComposer(state);
  const s = state.screen;
  const h = header(state);
  switch (s.id) {

    case "picker": {
      // The wheel owns the whole square; the wallet is one chip away inside every mode.
      return (["glimpse", "grocery", "gourmet"] as Mode[]).map((m, i): LensAction => ({ id: `mode-${m}`, label: MODE_META[m].label, row: 1 + i, x: 0, variant: "row", events: [{ type: "mode/set", mode: m }], listIndex: i, hint: MODE_META[m].hint }));
    }

    case "more":
      return [...h, ...describeMore(state)];

    // ── Glimpse ──
    case "glimpse": {
      const g = state.glimpse;
      if (g.scan === "scanning") return [...h, secondary("scan-cancel", "Cancel", [{ type: "glimpse/scan-cancel" }], undefined, 0)];
      if (g.scan === "result" && g.candidates.length) {
        const best = g.candidates.find((c) => c.id === g.chosenId) ?? g.candidates[0];
        return [...h,
          primary("see-offers", "See offers", [{ type: "glimpse/offers-loading", query: best.label }, { type: "nav/push", screen: { id: "glimpse-offers" } }], { kind: "glimpse-offers", candidateId: best.id }),
          secondary("not-this", "Not this", [{ type: "nav/push", screen: { id: "glimpse-candidates" } }]),
        ];
      }
      if (g.scan === "error") return [...h, primary("scan", "Scan again", [], { kind: "glimpse-scan" }), more()];
      return [...h, primary("scan", g.candidates.length ? "Scan again" : "Scan item", [], { kind: "glimpse-scan" }), more()];
    }
    case "glimpse-candidates": {
      const list = state.glimpse.frozenCandidates ?? state.glimpse.candidates;
      return [...h,
        ...list.map((c, i) => rowAction(`cand-${c.id}`, c.label, i, [{ type: "glimpse/choose", candidateId: c.id }, { type: "nav/back" }], undefined, c.reason)),
        secondary("scan", "Scan again", [{ type: "nav/back" }], { kind: "glimpse-scan" }, 0),
      ];
    }
    case "glimpse-offers": {
      const g = state.glimpse;
      if (g.offersStatus === "loading" && !g.offers.length) return [...h, secondary("cancel", "Cancel", [{ type: "nav/back" }], undefined, 0)];
      if (g.offersStatus === "error") return [...h, primary("retry", "Retry", [{ type: "glimpse/offers-loading", query: g.offersQuery ?? "" }], { kind: "glimpse-offers", candidateId: g.chosenId ?? "" }), secondary("back", "Back", [{ type: "nav/back" }])];
      if (g.offersStatus === "empty" || !g.offers.length) return [...h, primary("listings", "Online listings", [{ type: "listings/query", query: g.offersQuery ?? "" }, { type: "nav/push", screen: { id: "online-listings" } }]), secondary("back", "Back", [{ type: "nav/back" }])];
      return [...h, ...offerActions(state, currentOffer(state), (d) => [{ type: "glimpse/offer-step", delta: d }], "offers")];
    }
    case "glimpse-cart": {
      const saved = state.glimpse.saved;
      if (!saved.length) return [...h, primary("keep", "Keep shopping", [{ type: "nav/root" }])];
      return [...h, ...saved.map((o, i) => rowAction(`saved-${o.id}`, o.name, i, [{ type: "glimpse/offer-select", offerId: o.id }, { type: "nav/push", screen: { id: "glimpse-cart-item", params: { offerId: o.id } } }], undefined, `${o.retailer} · ${formatCents(o.priceCents)}`))];
    }
    case "glimpse-cart-item":
      return [...h, ...offerActions(state, currentOffer(state), (d) => [{ type: "glimpse/offer-step", delta: d }], "saved")];

    case "online-listings": {
      const l = state.listings;
      const search: LensAction = { id: "search", label: l.query || "Search products", row: 1, x: 0, variant: "row", events: [{ type: "composer/open", field: "listings-query", value: l.query }], field: "listings-query" };
      if (l.status === "idle" || (l.status === "loading" && !l.offers.length)) {
        return [...h, search, l.status === "loading"
          ? secondary("cancel", "Cancel", [{ type: "nav/back" }], undefined, 0)
          : primary("go", "Search", [{ type: "listings/loading", query: l.query }], { kind: "listings-search", query: l.query }, 0)];
      }
      if (l.status === "error") return [...h, search, primary("retry", "Retry", [{ type: "listings/loading", query: l.query }], { kind: "listings-search", query: l.query }), secondary("back", "Back", [{ type: "nav/back" }])];
      if (l.status === "empty") return [...h, search, primary("retry", "Search again", [{ type: "listings/loading", query: l.query }], { kind: "listings-search", query: l.query }), secondary("back", "Back", [{ type: "nav/back" }])];
      return [...h, ...offerActions(state, currentOffer(state), (d) => [{ type: "listings/step", delta: d }], "listings")];
    }

    case "handoff": {
      const hs = state.handoff.status;
      if (hs === "failed") return [...h, primary("retry", "Retry", [], state.handoff.url && state.handoff.kind ? { kind: "handoff", handoffKind: state.handoff.kind, title: state.handoff.title ?? "", url: state.handoff.url } : undefined), secondary("keep", "Keep shopping", [{ type: "nav/back" }])];
      if (hs === "sending") return [...h, secondary("keep", "Keep shopping", [{ type: "nav/back" }], undefined, 0)];
      return [...h, primary("done", "Done", [{ type: "nav/root" }]), secondary("keep", "Keep shopping", [{ type: "nav/back" }])];
    }

    // ── Grocery ──
    case "grocery": {
      const gr = state.grocery;
      const rows = gr.cart.map((l, i) => rowAction(`line-${l.productKey}`, l.label, i, [{ type: "nav/push", screen: { id: "grocery-edit", params: { productKey: l.productKey } } }], undefined, `${l.quantity} × ${formatCents(l.unitPriceCents)}`));
      if (gr.pendingAsk) {
        return [...h, primary("ask-yes", "Yes, add it", [{ type: "grocery/confirm-ask", yes: true }]), secondary("ask-no", "No", [{ type: "grocery/confirm-ask", yes: false }])];
      }
      const scan = gr.scanning
        ? primary("scan", "Pause scan", [{ type: "grocery/scan-toggle", on: false }], undefined, 0)
        : primary("scan", gr.cart.length ? "Scan more" : "Start scan", [{ type: "grocery/scan-toggle", on: true }], undefined, 0);
      return [...h, ...rows, gr.cart.length ? primary("finish", "Finish trip", [{ type: "grocery/finish" }], { kind: "grocery-exit" }, 0) : scan, more()];
    }
    case "grocery-item": {
      const key = String(s.params?.productKey ?? "");
      return [...h, primary("add", "Add", [{ type: "grocery/add-held" }], { kind: "persist" }), more()];
    }
    case "grocery-compare": {
      const key = String(s.params?.productKey ?? "");
      const ins = state.grocery.insights[key]?.data;
      const comps = ins?.comparisons ?? [];
      return [...h, ...comps.map((c, i) => rowAction(`cmp-${c.store}-${i}`, c.store, i, c.store === "Amazon" || c.store === "Temu"
        ? [{ type: "grocery/bought" as const, retailer: c.store, name: CATALOG_BY_ID[key]?.name ?? key, priceCents: c.priceCents, url: onlineSearchUrl(c.store, `${CATALOG_BY_ID[key]?.name ?? key} ${c.size}`) }]
        : [{ type: "toast" as const, text: `${c.store} · sample price, no ordering integration` }], undefined, `${c.match === "alternative" ? "Alternative · " : ""}${c.size}`))];
    }
    case "grocery-edit": {
      const key = String(s.params?.productKey ?? "");
      const line = state.grocery.cart.find((l) => l.productKey === key);
      if (!line) return [...h, primary("done", "Done", [{ type: "nav/back" }])];
      return [...h,
        { id: "qty-minus", label: "−", row: 1, x: 0, variant: "icon", events: [{ type: "grocery/qty", productKey: key, delta: -1 }] },
        { id: "qty-plus", label: "+", row: 1, x: 2, variant: "icon", events: [{ type: "grocery/qty", productKey: key, delta: 1 }] },
        { id: "price", label: line.unitPriceCents === null ? "Enter price" : formatCents(line.unitPriceCents), row: 2, x: 0, variant: "row", events: [{ type: "composer/open", field: `price:${key}`, value: line.unitPriceCents === null ? "" : (line.unitPriceCents / 100).toFixed(2) }], field: `price:${key}` },
        { id: "remove", label: "Remove", row: 3, x: 0, variant: "danger", events: [{ type: "grocery/remove", productKey: key }] },
        primary("done", "Done", [{ type: "nav/back" }]),
      ];
    }
    case "grocery-manual": {
      const text = state.grocery.manualText.trim();
      const matches = text ? GROCERY_CATALOG.filter((p) => p.name.toLowerCase().includes(text.toLowerCase())).slice(0, 12) : GROCERY_CATALOG;
      const typeAction: LensAction = { id: "manual-type", label: text || "Type an item", row: 1, x: 0, variant: "row", events: [{ type: "composer/open", field: "grocery-manual", value: text }], field: "grocery-manual" };
      const rows = matches.map((p, i) => rowAction(`manual-${p.id}`, p.name, i + 1, [{ type: "grocery/add-manual", productKey: p.id, label: p.name, packageSize: p.size, unitPriceCents: p.qfcPriceCents, source: "catalog" }], { kind: "persist" }, `${p.size} · ${formatCents(p.qfcPriceCents)}`));
      const custom = text && !matches.some((m) => m.name.toLowerCase() === text.toLowerCase())
        ? [primary("manual-add-custom", `Add “${text}”`, [{ type: "grocery/add-manual", productKey: `custom-${text.toLowerCase().replace(/\s+/g, "-")}`, label: text, packageSize: null, unitPriceCents: null, source: "unknown" }])]
        : [];
      return [...h, { ...typeAction, listIndex: 0 }, ...rows, ...custom];
    }
    case "grocery-list": {
      const rows = state.list.map((it, i) => rowAction(`list-${it.key}`, it.name, i, [{ type: "list/toggle", key: it.key }], { kind: "persist" }, it.recipes[0]));
      const stops = aisleStops(state.list);
      return [...h, ...rows, ...(stops.length ? [primary("find", "Find next item", [{ type: "nav/push", screen: { id: "grocery-find", params: { stop: 0 } } }])] : []), more()];
    }
    case "grocery-checkout":
      return [...h, primary("done", "Done", [{ type: "nav/root" }])];
    case "grocery-bought": {
      const b = state.grocery.bought[state.grocery.bought.length - 1];
      return [...h, primary("done", "Done", [{ type: "nav/root" }]), secondary("view", "View listing", [], b ? { kind: "handoff", handoffKind: "view", title: b.name, url: b.url } : undefined)];
    }
    case "grocery-find": {
      const stops = aisleStops(state.list);
      const i = Number(s.params?.stop ?? 0);
      const hasNext = i + 1 < stops.length;
      return [...h, primary("done", "Done", [{ type: "nav/back" }]), ...(hasNext ? [secondary("next", "Next item", [{ type: "nav/replace", screen: { id: "grocery-find", params: { stop: i + 1 } } }])] : [])];
    }

    // ── Gourmet ──
    case "gourmet": {
      const g = state.gourmet;
      if (g.scan === "scanning") return [...h, secondary("scan-cancel", "Cancel", [{ type: "gourmet/scan-cancel" }], undefined, 0)];
      if (g.scan === "result" && g.hypotheses.length) {
        return [...h,
          ...g.hypotheses.map((hy, i) => rowAction(`dish-${i}`, hy.name, i, [{ type: "gourmet/choose", dish: hy.name }], { kind: "gourmet-recipes", dish: hy.name }, i === 0 ? "Best match" : "Possible")),
          secondary("rescan", "Rescan", [], { kind: "gourmet-scan" }, 0),
        ];
      }
      if (g.scan === "no-food" || g.scan === "error") return [...h, primary("scan", "Scan again", [], { kind: "gourmet-scan" }), more()];
      return [...h, primary("scan", "Scan dish", [], { kind: "gourmet-scan" }), more()];
    }
    case "gourmet-recipes": {
      const g = state.gourmet;
      if (g.recipesStatus === "loading") return [...h, secondary("cancel", "Cancel", [{ type: "nav/back" }], undefined, 0)];
      if (g.recipesStatus === "error" || g.recipesStatus === "empty") return [...h, primary("retry", "Retry", [{ type: "gourmet/recipes-loading" }], { kind: "gourmet-recipes", dish: g.dish ?? "" }), secondary("back", "Back", [{ type: "nav/back" }])];
      return [...h, ...g.recipes.map((r, i) => rowAction(`recipe-${r.id}`, r.title, i, [{ type: "gourmet/open-recipe", recipeId: r.id }], undefined, `${r.minutes} min · serves ${r.servings} · ${r.ingredients.length} ingredients`))];
    }
    case "gourmet-recipe": {
      const id = String(s.params?.recipeId ?? "");
      const r = state.gourmet.recipes.find((x) => x.id === id) ?? state.gourmet.saved.find((x) => x.id === id);
      if (!r) return [...h, primary("back", "Back", [{ type: "nav/back" }])];
      const servings = state.gourmet.servings[id] ?? r.servings;
      const deselected = new Set(state.gourmet.deselected[id] ?? []);
      const ings = scaleIngredients(r.ingredients, r.servings, servings);
      const rows = ings.map((ing, i) => ({
        id: `ing-${i}`, label: ing.name, row: 1 + i, x: 0, variant: "row" as const, listIndex: i,
        events: [{ type: "gourmet/toggle-ingredient" as const, recipeId: id, name: ing.name }],
        hint: deselected.has(ing.name) ? "unchecked" : "checked",
      }));
      const selectedCount = ings.filter((i) => !deselected.has(i.name)).length;
      return [...h, ...rows, { ...primary("add-list", "Add to list", [{ type: "gourmet/add-to-list", recipeId: id }], { kind: "persist" }), disabled: selectedCount === 0 }, more()];
    }
    case "gourmet-steps": {
      const id = String(s.params?.recipeId ?? "");
      const page = Number(s.params?.page ?? 0);
      const r = state.gourmet.recipes.find((x) => x.id === id) ?? state.gourmet.saved.find((x) => x.id === id);
      const pages = r ? paginateSteps(r.steps) : [[]];
      const a: LensAction[] = [...h];
      if (page > 0) a.push(secondary("prev", "Previous", [{ type: "nav/replace", screen: { id: "gourmet-steps", params: { recipeId: id, page: page - 1 } } }], undefined, 0));
      if (page < pages.length - 1) a.push(primary("next", "Next", [{ type: "nav/replace", screen: { id: "gourmet-steps", params: { recipeId: id, page: page + 1 } } }], undefined, 1));
      else a.push(primary("done", "Done", [{ type: "nav/back" }], undefined, 1));
      return a;
    }
    case "gourmet-shop": {
      const id = String(s.params?.recipeId ?? "");
      const r = state.gourmet.recipes.find((x) => x.id === id) ?? state.gourmet.saved.find((x) => x.id === id);
      const rows = (r?.ingredients ?? []).map((ing, i) => rowAction(`shop-${i}`, ing.name, i, [{ type: "listings/query", query: ing.name }, { type: "listings/loading", query: ing.name }, { type: "nav/push", screen: { id: "online-listings" } }], { kind: "listings-search", query: ing.name }, "Search online"));
      return [...h, ...rows];
    }
    case "gourmet-added":
      return [...h,
        primary("shop-grocery", "Shop in Grocery", [{ type: "mode/set", mode: "grocery" }, { type: "nav/push", screen: { id: "grocery-list" } }]),
        secondary("stores", state.capture === "sample" ? "Stores near you" : "Find ingredients", state.capture === "sample" ? [{ type: "nav/push", screen: { id: "stores" } }] : [{ type: "mode/set", mode: "grocery" }, { type: "nav/push", screen: { id: "grocery-list" } }]),
      ];

    case "stores": {
      const sorted = storesByDistance(state.location.lat, state.location.lng, STORES);
      return [...h,
        ...sorted.map((st, i) => rowAction(`store-${st.id}`, st.name, i, [{ type: "nav/push", screen: { id: "nav", params: { storeId: st.id } } }], { kind: "handoff", handoffKind: "nav", title: `Directions to ${st.name}`, url: walkingDirectionsUrl(state.location, st) }, `${st.km.toFixed(1)} km · ${st.address}`)),
        ...(state.location.source === "demo" ? [secondary("locate", "Use my location", [], { kind: "locate" }, 0)] : []),
      ];
    }
    case "nav":
      return [...h, primary("done", "Done", [{ type: "nav/root" }])];

    // ── Wallet ──
    case "wallet": {
      const w = state.wallet;
      const a: LensAction[] = [...h];
      if (w.status === "ready") {
        a.push(rowAction("w-orders", "Orders", 0, [{ type: "nav/push", screen: { id: "wallet-orders" } }], { kind: "orders-refresh" }, w.orders.length ? `${w.orders.length} recent` : "None yet"));
        a.push(rowAction("w-autobuy", w.autoBuy === "on" ? "Auto-buy on" : w.autoBuy === "paused" ? "Auto-buy paused" : "Auto-buy off", 1,
          w.autoBuy === "off" ? [{ type: "toast", text: "Enable Auto-buy rules on your phone" }] : [], w.autoBuy === "off" ? undefined : { kind: "wallet-pause-rule", pause: w.autoBuy === "on" }, w.autoBuy === "on" ? "Pause" : w.autoBuy === "paused" ? "Resume" : w.ruleSummary ?? "Set up on phone"));
        a.push(primary("w-done", "Done", [{ type: "nav/back" }]));
      } else {
        a.push(primary("w-setup", w.status === "signed-out" ? "Set up on phone" : "Add a card on phone", [], { kind: "handoff", handoffKind: "checkout", title: "Set up your Glance wallet", url: "/wallet/setup" }));
        a.push(secondary("w-refresh", "Refresh", [], { kind: "wallet-refresh" }));
      }
      return a;
    }
    case "wallet-orders": {
      const orders = state.wallet.orders;
      if (!orders.length) return [...h, primary("back", "Back", [{ type: "nav/back" }])];
      return [...h, ...orders.map((o, i) => rowAction(`order-${o.id}`, o.merchantName, i, [{ type: "nav/push", screen: { id: "wallet-order", params: { orderId: o.id } } }], undefined, `${formatCents(o.totalCents)} · ${o.status}`))];
    }
    case "wallet-order":
      return [...h, primary("done", "Done", [{ type: "nav/back" }])];

    case "connect":
      return [...h, primary("w-refresh", "Refresh", [], { kind: "wallet-refresh" })];
  }
  return h;
}

export function onlineSearchUrl(store: string, query: string): string {
  if (store === "Temu") return `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(query)}`;
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
}

function describeMore(state: LensState): LensAction[] {
  const of = String(state.screen.params?.of ?? "");
  const items: LensAction[] = [];
  const add = (id: string, label: string, events: LensAction["events"], effect?: LensAction["effect"], hint?: string) =>
    items.push(rowAction(id, label, items.length, events, effect, hint));
  const offer = currentOfferFor(state, of);
  switch (of) {
    case "glimpse":
      add("m-cart", "Saved items", [{ type: "nav/back" }, { type: "nav/push", screen: { id: "glimpse-cart" } }], undefined, `${state.glimpse.saved.length} saved`);
      add("m-listings", "Online listings", [{ type: "nav/back" }, { type: "nav/push", screen: { id: "online-listings" } }], undefined, "Search by name");
      add("m-reset", "Reset scenario", [{ type: "reset" }]);
      break;
    case "glimpse-offers":
    case "online-listings":
    case "glimpse-cart-item": {
      if (offer) {
        const saved = state.glimpse.saved.some((s) => s.id === offer.id);
        if (of === "glimpse-cart-item") add("m-remove", "Remove from saved", [{ type: "glimpse/remove-saved", offerId: offer.id }], { kind: "persist" });
        else add("m-save", saved ? "In cart" : "Save", saved ? [{ type: "nav/back" }, { type: "nav/push", screen: { id: "glimpse-cart" } }] : [{ type: "glimpse/save-toggle", offer }, { type: "nav/back" }], saved ? undefined : { kind: "persist" });
        add("m-details", `Seller: ${offer.retailer}`, [{ type: "toast", text: offer.kind === "connect_merchant" ? `${offer.retailer} · in-lens checkout · demo fulfillment` : `${offer.retailer} · external retailer` }], undefined, offer.kind === "connect_merchant" ? "In-lens checkout" : "External retailer");
        if (offer.kind !== "connect_merchant") add("m-send", "Send link to phone", [{ type: "nav/back" }], { kind: "handoff", handoffKind: "view", title: offer.name, url: offer.url });
        if (of === "glimpse-offers") add("m-change", "Change item", [{ type: "nav/back" }, { type: "nav/back" }, { type: "nav/push", screen: { id: "glimpse-candidates" } }]);
        if (of !== "online-listings") add("m-listings", "Online listings", [{ type: "nav/back" }, { type: "listings/query", query: state.glimpse.offersQuery ?? offer.name }, { type: "nav/push", screen: { id: "online-listings" } }]);
      }
      break;
    }
    case "grocery":
      add("m-list", "Shopping list", [{ type: "nav/back" }, { type: "nav/push", screen: { id: "grocery-list" } }], undefined, `${state.list.filter((i) => !i.done).length} left`);
      add("m-manual", "Add by name", [{ type: "nav/back" }, { type: "nav/push", screen: { id: "grocery-manual" } }]);
      if (state.grocery.undo.length) add("m-undo", "Undo", [{ type: "grocery/undo" }, { type: "nav/back" }]);
      add("m-scan", state.grocery.scanning ? "Pause scan" : "Start scan", [{ type: "grocery/scan-toggle" }, { type: "nav/back" }]);
      add("m-stores", "Stores near you", [{ type: "nav/back" }, { type: "nav/push", screen: { id: "stores" } }]);
      add("m-reset", "Reset scenario", [{ type: "reset" }]);
      break;
    case "grocery-item": {
      const key = String(state.screen.params?.productKey ?? "");
      add("m-compare", "Compare prices", [{ type: "nav/back" }, { type: "nav/push", screen: { id: "grocery-compare", params: { productKey: key } } }]);
      add("m-nutrition", "Nutrition", [{ type: "nav/back" }, { type: "nav/push", screen: { id: "grocery-compare", params: { productKey: key, tab: "nutrition" } } }]);
      add("m-list", "Shopping list", [{ type: "nav/back" }, { type: "nav/push", screen: { id: "grocery-list" } }]);
      break;
    }
    case "grocery-list":
      add("m-cart", "Back to cart", [{ type: "nav/back" }, { type: "nav/back" }]);
      add("m-stores", "Stores near you", [{ type: "nav/back" }, { type: "nav/push", screen: { id: "stores" } }]);
      break;
    case "gourmet":
      add("m-saved", "Saved recipes", [{ type: "nav/back" }, { type: "nav/push", screen: { id: "gourmet-recipes" } }], undefined, `${state.gourmet.saved.length} saved`);
      add("m-list", "Shopping list", [{ type: "nav/back" }, { type: "nav/push", screen: { id: "grocery-list" } }]);
      add("m-reset", "Reset scenario", [{ type: "reset" }]);
      break;
    case "gourmet-recipe": {
      const id = String(state.screen.params?.recipeId ?? "");
      const r = state.gourmet.recipes.find((x) => x.id === id) ?? state.gourmet.saved.find((x) => x.id === id);
      const servings = state.gourmet.servings[id] ?? r?.servings ?? 4;
      items.push({ id: "m-serv-minus", label: "−", row: 1, x: 0, variant: "icon", events: [{ type: "gourmet/servings", recipeId: id, delta: -1 }] });
      items.push({ id: "m-serv-plus", label: "+", row: 1, x: 2, variant: "icon", events: [{ type: "gourmet/servings", recipeId: id, delta: 1 }], hint: `${servings} servings` });
      items.push(rowAction("m-steps", "Steps", 1, [{ type: "nav/back" }, { type: "nav/push", screen: { id: "gourmet-steps", params: { recipeId: id, page: 0 } } }]));
      items.push(rowAction("m-save", "Save recipe", 2, [{ type: "gourmet/save", recipeId: id }, { type: "nav/back" }], { kind: "persist" }));
      items.push(rowAction("m-shop", "Shop ingredients", 3, [{ type: "nav/back" }, { type: "nav/push", screen: { id: "gourmet-shop", params: { recipeId: id } } }]));
      break;
    }
    default:
      add("m-reset", "Reset scenario", [{ type: "reset" }]);
  }
  return items;
}

function currentOfferFor(state: LensState, of: string): Offer | null {
  if (of === "online-listings") return state.listings.offers.find((o) => o.id === state.listings.offerId) ?? null;
  if (of === "glimpse-cart-item") return state.glimpse.saved.find((o) => o.id === state.glimpse.offerId) ?? null;
  return state.glimpse.offers.find((o) => o.id === state.glimpse.offerId) ?? null;
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

/** Row window for list screens: which listIndex range is visible. */
export function visibleWindow(actions: LensAction[], windowStart: number): { start: number; end: number; total: number } {
  const total = actions.filter((a) => a.listIndex !== undefined).length;
  const start = Math.max(0, Math.min(windowStart, Math.max(0, total - LIST_WINDOW)));
  return { start, end: Math.min(total, start + LIST_WINDOW), total };
}

export function screenTitle(state: LensState): string {
  const s = state.screen;
  switch (s.id) {
    case "glimpse": return state.glimpse.scan === "scanning" ? "Scanning item…" : state.glimpse.candidates.length ? "Looks like" : "Shop what you see";
    case "glimpse-candidates": return "What caught your eye?";
    case "glimpse-offers": return state.glimpse.offersStatus === "loading" && !state.glimpse.offers.length ? "Finding offers…" : "Offers";
    case "glimpse-cart": return "Saved items";
    case "glimpse-cart-item": return "Saved";
    case "online-listings": return "Online listings";
    case "handoff": return "";
    case "grocery": return "Your cart";
    case "grocery-item": return "You're holding";
    case "grocery-compare": return s.params?.tab === "nutrition" ? "Nutrition" : "Nearby & online";
    case "grocery-edit": return "Edit item";
    case "grocery-manual": return "Add by name";
    case "grocery-list": return "Shopping list";
    case "grocery-checkout": return "Trip summary";
    case "grocery-bought": return "";
    case "grocery-find": return "Find next item";
    case "gourmet": return state.gourmet.scan === "scanning" ? "Scanning dish…" : state.gourmet.hypotheses.length ? "Looks like" : "Cook what you see";
    case "gourmet-recipes": return "Recipes";
    case "gourmet-recipe": return "Recipe";
    case "gourmet-steps": return "Steps";
    case "gourmet-shop": return "Shop ingredients";
    case "gourmet-added": return "";
    case "stores": return "Stores near you";
    case "nav": return "";
    case "wallet": return "Wallet";
    case "wallet-orders": return "Orders";
    case "wallet-order": return "Receipt";
    case "more": return "More";
    case "connect": return "Connect";
    default: return "";
  }
}

export const cartTotal = (state: LensState) => cartTotals(state.grocery.cart);
export type { Screen };
