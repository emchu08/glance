import type { CartLine, Mode, Offer, PriceSource, ShoppingListItem } from "@/data/types";
import { addToCart, cartTotals, removeLine, setManualPrice, setQuantity } from "@/domain/grocery/cart";
import { buildTripSummary } from "@/domain/grocery/exit";
import { completeListFromCart } from "@/domain/grocery/list";
import { claimHold, currentlyHeld, dismissHold, stepTracker } from "@/domain/grocery/tracker";
import { CATALOG_BY_ID } from "@/data/grocery";
import { additionSignature, addIngredientsToList, scaleIngredients } from "@/domain/gourmet/list";
import { groceryCardPrice } from "./groceryPrice";
import { initialState as emptyLens } from "./initial";
import { ROOT_SCREEN, type LensEvent, type LensState, type Screen, type ScreenId } from "./types";

export { emptyLens as initialState };

const MAX_UNDO = 10;

function push(state: LensState, screen: Screen): LensState {
  return { ...state, stack: [...state.stack, state.screen], screen, focusId: null, windowStart: 0, revision: state.revision + 1 };
}

function replace(state: LensState, screen: Screen): LensState {
  return { ...state, screen, focusId: null, windowStart: 0, revision: state.revision + 1 };
}

/**
 * Where Back leads from each screen, nearest first. Back returns to the nearest of these still in
 * the history (dropping everything above it), else to the mode's main screen, so it never retraces
 * pop-ups or confirmations. Screens not listed here step back through the history.
 */
const BACK_TO: Partial<Record<ScreenId, ScreenId[]>> = {
  "glimpse-offers": ["glimpse"],
  "glimpse-candidates": ["glimpse-offers", "glimpse"],
  "glimpse-cart": ["glimpse"],
  "glimpse-cart-item": ["glimpse-cart", "glimpse"],
  "grocery-item": ["grocery"],
  "grocery-compare": ["grocery-item", "grocery"],
  "grocery-edit": ["grocery"],
  "grocery-manual": ["grocery"],
  "grocery-list": ["grocery"],
  "grocery-checkout": ["grocery"],
  "grocery-bought": ["grocery"],
  "grocery-find": ["grocery-list", "grocery"],
  "gourmet-recipes": ["gourmet"],
  "gourmet-recipe": ["gourmet-recipes", "gourmet"],
  "gourmet-steps": ["gourmet-recipe", "gourmet-recipes", "gourmet"],
  "gourmet-shop": ["gourmet-recipe", "gourmet-recipes", "gourmet"],
  "gourmet-added": ["gourmet-recipe", "gourmet-recipes", "gourmet"],
  "wallet-order": ["wallet-orders", "wallet"],
};
/** Pop-ups and confirmations: Back passes over them. */
const PASSING: ReadonlySet<ScreenId> = new Set<ScreenId>(["more", "handoff", "glimpse-candidates", "gourmet-added", "grocery-bought", "nav", "connect"]);

function back(state: LensState): LensState {
  if (state.composer) return { ...state, composer: null, revision: state.revision + 1 };
  const home = ROOT_SCREEN[state.mode];
  const stack = [...state.stack];
  const targets = BACK_TO[state.screen.id];
  let screen: Screen | undefined;
  if (targets) {
    const at = stack.findLastIndex((s) => targets.includes(s.id));
    screen = at >= 0 ? stack.splice(at)[0] : undefined;
    if (!screen) stack.length = 0;
  } else {
    do screen = stack.pop(); while (screen && PASSING.has(screen.id) && stack.length);
  }
  if (!screen) {
    if (state.screen.id === home) return state;
    screen = { id: home };
  }
  return { ...state, stack, screen, focusId: null, windowStart: 0, revision: state.revision + 1 };
}

function root(state: LensState, mode: Mode = state.mode): LensState {
  return { ...state, mode, stack: [], screen: { id: ROOT_SCREEN[mode] }, focusId: null, windowStart: 0, revision: state.revision + 1 };
}

/** Scans pause this long after anything is added to a cart. */
export const SCAN_COOLDOWN_MS = 2_000;

/** What a grocery add costs: the price the item's card shows, so the cart matches what you saw. */
function cartPrice(state: LensState, grocery: LensState["grocery"], key: string): { unitPriceCents: number | null; priceSource: PriceSource } {
  const p = groceryCardPrice({ ...state, grocery }, key);
  return p ? { unitPriceCents: p.cents, priceSource: p.source } : { unitPriceCents: null, priceSource: "unknown" };
}
const cooled = (state: LensState): LensState => ({ ...state, scanCooldownUntil: Date.now() + SCAN_COOLDOWN_MS });
/** A grocery cart line for an online listing. */
export const onlineLineKey = (offerId: string) => `online:${offerId}`;

function bump(state: LensState): LensState {
  return { ...state, revision: state.revision + 1 };
}

function selectedRecipeIngredients(state: LensState, recipeId: string) {
  const recipe = state.gourmet.recipes.find((r) => r.id === recipeId) ?? state.gourmet.saved.find((r) => r.id === recipeId);
  if (!recipe) return null;
  const servings = state.gourmet.servings[recipeId] ?? recipe.servings;
  const deselected = new Set(state.gourmet.deselected[recipeId] ?? []);
  const scaled = scaleIngredients(recipe.ingredients, recipe.servings, servings);
  return { recipe, servings, selected: scaled.filter((i) => !deselected.has(i.name)) };
}

export function lensReducer(state: LensState, event: LensEvent): LensState {
  switch (event.type) {
    case "init": {
      const next: LensState = {
        ...state,
        reducedMotion: event.reducedMotion ?? state.reducedMotion,
        capture: event.capture ?? state.capture,
      };
      return next;
    }

    case "nav/push":
      return push(state, event.screen);
    case "nav/replace":
      return replace(state, event.screen);
    case "nav/back":
      return back(state);
    case "nav/root":
      return root(state);
    case "nav/more":
      return push(state, { id: "more", params: { of: state.screen.id, ...(state.screen.params ?? {}) } });

    case "mode/set": {
      if (event.mode === state.mode && state.screen.id === ROOT_SCREEN[state.mode]) return state;
      // Mode switching keeps shopping state and cancels stale analysis (session bump).
      return {
        ...root(state, event.mode),
        session: state.session + 1,
        glimpse: state.glimpse.scan === "scanning" ? { ...state.glimpse, scan: "idle" } : state.glimpse,
        gourmet: state.gourmet.scan === "scanning" ? { ...state.gourmet, scan: "idle" } : state.gourmet,
      };
    }
    case "capture/set":
      return { ...state, capture: event.capture, session: state.session + 1, revision: state.revision + 1 };

    case "focus/set": {
      let windowStart = state.windowStart;
      if (event.listIndex !== undefined) {
        if (event.listIndex < windowStart) windowStart = event.listIndex;
        else if (event.listIndex >= windowStart + LIST_WINDOW) windowStart = event.listIndex - LIST_WINDOW + 1;
      }
      if (state.focusId === event.id && windowStart === state.windowStart) return state;
      return { ...state, focusId: event.id, windowStart, revision: state.revision + 1 };
    }
    case "window/set":
      return { ...state, windowStart: Math.max(0, event.start), revision: state.revision + 1 };

    case "toast":
      return { ...state, toast: event.text ? { text: event.text, at: Date.now() } : null, revision: state.revision + 1 };

    case "reset": {
      // Clears transient mode data, physical cart, pending observations, listings/handoff display, toasts.
      // Preserves saved offers/recipes/shared list and store-entry context; invalidates the session.
      const fresh = emptyLens();
      return {
        ...fresh,
        mode: state.mode,
        capture: state.capture,
        reducedMotion: state.reducedMotion,
        screen: { id: ROOT_SCREEN[state.mode] },
        session: state.session + 1,
        revision: state.revision + 1,
        pairing: state.pairing,
        wallet: state.wallet,
        location: state.location,
        list: state.list,
        glimpse: { ...fresh.glimpse, saved: state.glimpse.saved },
        gourmet: { ...fresh.gourmet, saved: state.gourmet.saved },
        grocery: { ...fresh.grocery, storeEntry: state.grocery.storeEntry },
        // Durable orders survive reset; only the in-lens payment surface is dismissed.
        payment: state.payment.status === "pending" || state.payment.status === "needs-action" ? state.payment : fresh.payment,
      };
    }

    case "hydrate":
      return bump({ ...state, glimpse: { ...state.glimpse, saved: event.saved }, gourmet: { ...state.gourmet, saved: event.recipes }, list: event.list });

    case "pairing/set":
      return { ...state, pairing: { status: event.status, code: event.code === undefined ? state.pairing.code : event.code }, revision: state.revision + 1 };
    case "location/set":
      return { ...state, location: { lat: event.lat, lng: event.lng, label: event.label, source: event.source }, revision: state.revision + 1 };

    // ── Glimpse ──────────────────────────────────────────────────────────────
    case "glimpse/scan-start":
      return bump({ ...state, glimpse: { ...state.glimpse, scan: "scanning", scanId: event.scanId, error: null, frozenCandidates: null } });
    case "glimpse/scan-cancel":
      return bump({ ...state, glimpse: { ...state.glimpse, scan: state.glimpse.candidates.length ? "result" : "idle", scanId: state.glimpse.scanId + 1 } });
    case "glimpse/scan-result": {
      if (event.scanId !== state.glimpse.scanId || state.glimpse.scan !== "scanning") return state; // stale
      const best = event.candidates[0] ?? null;
      return bump({
        ...state,
        glimpse: {
          ...state.glimpse,
          scan: "result",
          candidates: event.candidates,
          chosenId: best?.id ?? null,
          frameIndex: event.frameIndex,
          offers: [],
          offersStatus: "idle",
          offersQuery: null,
          offerId: null,
        },
      });
    }
    case "glimpse/scan-error":
      if (event.scanId !== state.glimpse.scanId) return state;
      return bump({ ...state, glimpse: { ...state.glimpse, scan: "error", error: event.error } });
    case "glimpse/choose": {
      if (!state.glimpse.candidates.some((c) => c.id === event.candidateId)) return state;
      return bump({ ...state, glimpse: { ...state.glimpse, chosenId: event.candidateId, offers: [], offersStatus: "idle", offersQuery: null, offerId: null, frozenCandidates: null } });
    }
    case "glimpse/offers-loading":
      return bump({ ...state, glimpse: { ...state.glimpse, offersStatus: "loading", offersQuery: event.query, offers: [] } });
    case "glimpse/offers-result": {
      if (state.glimpse.offersQuery !== event.query) return state; // stale query
      const offers = event.replace ? event.offers : mergeOffers(state.glimpse.offers, event.offers);
      const offerId = state.glimpse.offerId && offers.some((o) => o.id === state.glimpse.offerId) ? state.glimpse.offerId : offers[0]?.id ?? null;
      return bump({ ...state, glimpse: { ...state.glimpse, offers, offerId, offersStatus: event.done ? (offers.length ? "ready" : "empty") : "loading" } });
    }
    case "glimpse/offers-error":
      if (state.glimpse.offersQuery !== event.query) return state;
      return bump({ ...state, glimpse: { ...state.glimpse, offersStatus: state.glimpse.offers.length ? "ready" : "error", error: event.error } });
    case "glimpse/offer-select":
      return bump({ ...state, glimpse: { ...state.glimpse, offerId: event.offerId } });
    case "glimpse/offer-step": {
      const list = state.screen.id === "glimpse-cart-item" ? state.glimpse.saved : state.glimpse.offers;
      const i = Math.max(0, list.findIndex((o) => o.id === state.glimpse.offerId));
      const n = (i + event.delta + list.length) % Math.max(1, list.length);
      const next = list[n];
      if (!next) return state;
      return bump({ ...state, glimpse: { ...state.glimpse, offerId: next.id } });
    }
    case "glimpse/save-toggle": {
      const exists = state.glimpse.saved.some((o) => o.id === event.offer.id);
      if (exists) return state; // activating an already-saved item opens the cart (handled by action)
      const candidateLabel = state.glimpse.candidates.find((c) => c.id === event.offer.candidateId)?.label ?? event.offer.name;
      return bump({ ...cooled(state), glimpse: { ...state.glimpse, saved: [...state.glimpse.saved, { ...event.offer, savedAt: Date.now(), candidateLabel }] }, toast: { text: "Added to cart", at: Date.now() } });
    }
    case "glimpse/remove-saved": {
      const saved = state.glimpse.saved.filter((o) => o.id !== event.offerId);
      const idx = state.glimpse.saved.findIndex((o) => o.id === event.offerId);
      const nextOffer = saved[Math.min(idx, saved.length - 1)] ?? null;
      const s = bump({ ...state, glimpse: { ...state.glimpse, saved, offerId: nextOffer?.id ?? null } });
      if (state.screen.id === "glimpse-cart-item") {
        return nextOffer ? replace(s, { id: "glimpse-cart-item", params: { offerId: nextOffer.id } }) : replace({ ...s, stack: s.stack.filter((x) => x.id !== "more") }, { id: "glimpse-cart" });
      }
      return s;
    }

    // ── Grocery ──────────────────────────────────────────────────────────────
    case "grocery/scan-toggle":
      return bump({ ...state, grocery: { ...state.grocery, scanning: event.on ?? !state.grocery.scanning } });
    case "grocery/frame": {
      const { state: tracker, events } = stepTracker(state.grocery.tracker, event.observations);
      let grocery = { ...state.grocery, tracker, frameIndex: event.frameIndex };
      let list = state.list;
      let screen = state.screen;
      let stack = state.stack;
      let toast = state.toast;
      let cooldown = state.scanCooldownUntil;
      for (const e of events) {
        if (e.type === "add") {
          const cart = addToCart(grocery.cart, { productKey: e.productKey, label: e.label, packageSize: e.packageSize, ...cartPrice(state, grocery, e.productKey), eventId: e.eventId });
          if (cart !== grocery.cart) {
            grocery = { ...grocery, undo: [grocery.cart, ...grocery.undo].slice(0, MAX_UNDO), cart, lastAddKey: e.productKey, heldKey: null, heldLabel: null, heldSize: null, heldPrice: null };
            list = completeListFromCart(list, cart);
            toast = { text: `Added ${e.label}`, at: Date.now() };
            cooldown = Date.now() + SCAN_COOLDOWN_MS;
            // The camera confirmed the placement: the held-item card returns to the cart.
            if (screen.id === "grocery-item" && screen.params?.productKey === e.productKey) {
              screen = { id: "grocery" };
              stack = stack.filter((s) => s.id !== "grocery");
            }
          }
        } else if (e.type === "ask") {
          grocery = { ...grocery, pendingAsk: { eventId: e.eventId, productKey: e.productKey, label: e.label, packageSize: e.packageSize, priceCents: e.priceCents } };
        } else if (e.type === "held") {
          const estimate = event.observations.find((o) => o.productKey === e.productKey)?.estimatedPriceCents ?? null;
          const heldPrice = e.priceCents ? { cents: e.priceCents, source: "shelf-label" as const } : estimate ? { cents: estimate, source: "estimate" as const } : null;
          grocery = { ...grocery, heldKey: e.productKey, heldLabel: e.label, heldSize: e.packageSize, heldPrice };
          // The held-item card opens once per hold, only from the grocery root.
          if (screen.id === "grocery") {
            stack = [...stack, screen];
            screen = { id: "grocery-item", params: { productKey: e.productKey } };
          }
        } else if (e.type === "put-back") {
          if (grocery.heldKey === e.productKey) grocery = { ...grocery, heldKey: null, heldLabel: null, heldSize: null, heldPrice: null };
          if (screen.id === "grocery-item" && screen.params?.productKey === e.productKey) {
            screen = { id: "grocery" };
            stack = stack.filter((s) => s.id !== "grocery");
          }
        }
      }
      return { ...state, grocery, list, screen, stack, toast, scanCooldownUntil: cooldown, focusId: screen === state.screen ? state.focusId : null, revision: state.revision + 1 };
    }
    case "grocery/add-held": {
      // The item on the card is what's added (the camera may since have seen another one held).
      const shown = state.screen.id === "grocery-item" ? (state.screen.params?.productKey as string | undefined) : undefined;
      const held = currentlyHeld(state.grocery.tracker);
      const key = shown ?? held?.productKey ?? state.grocery.heldKey;
      if (!key) return state;
      const heldNow = held?.productKey === key ? held : null;
      const isHeldKey = state.grocery.heldKey === key;
      const track = state.grocery.tracker.tracks[key];
      const eventId = track && track.episode > 0 ? `${key}#${track.episode}` : `${key}#manual-${Date.now()}`;
      // "Already in your cart" only when the cart itself has this hold, not when the camera merely asked about it.
      const already = !!state.grocery.cart.find((l) => l.productKey === key)?.events.includes(eventId);
      const { state: tracker } = claimHold(state.grocery.tracker, key);
      const label = heldNow?.label ?? (isHeldKey ? state.grocery.heldLabel : null) ?? CATALOG_BY_ID[key]?.name ?? track?.label ?? key;
      const size = heldNow?.packageSize ?? (isHeldKey ? state.grocery.heldSize : null) ?? CATALOG_BY_ID[key]?.size ?? null;
      const pendingAsk = state.grocery.pendingAsk?.productKey === key ? null : state.grocery.pendingAsk;
      let grocery = { ...state.grocery, tracker, pendingAsk, heldKey: null, heldLabel: null, heldSize: null, heldPrice: null };
      if (already) {
        grocery = { ...grocery, acknowledgement: "Already in your cart" };
      } else {
        // The price on the card (computed before the held item is cleared).
        const cart = addToCart(grocery.cart, { productKey: key, label, packageSize: size, ...cartPrice(state, state.grocery, key), eventId });
        grocery = { ...grocery, undo: [grocery.cart, ...grocery.undo].slice(0, MAX_UNDO), cart, lastAddKey: key, acknowledgement: `Added ${label}` };
      }
      const list = completeListFromCart(state.list, grocery.cart);
      // Add on the held-item card returns immediately to the grocery cart.
      return { ...root({ ...cooled(state), grocery, list }, "grocery") };
    }
    case "grocery/add-offer": {
      // An online listing added from Grocery is a line in the grocery cart, at the listing's price.
      const productKey = onlineLineKey(event.offer.id);
      if (state.grocery.cart.some((l) => l.productKey === productKey)) return state;
      const cart = addToCart(state.grocery.cart, { productKey, label: event.offer.name, packageSize: null, unitPriceCents: event.offer.priceCents, priceSource: "online", eventId: `${productKey}#${Date.now()}` });
      return bump({ ...cooled(state), grocery: { ...state.grocery, undo: [state.grocery.cart, ...state.grocery.undo].slice(0, MAX_UNDO), cart, lastAddKey: productKey }, toast: { text: "Added to cart", at: Date.now() } });
    }
    case "grocery/dismiss-held": {
      // Wrong item: back to the cart and look again; this identification can't add itself meanwhile.
      const key = state.screen.id === "grocery-item" ? String(state.screen.params?.productKey ?? "") : state.grocery.heldKey ?? "";
      const tracker = key ? dismissHold(state.grocery.tracker, key) : state.grocery.tracker;
      const pendingAsk = state.grocery.pendingAsk?.productKey === key ? null : state.grocery.pendingAsk;
      const grocery = { ...state.grocery, tracker, pendingAsk, heldKey: null, heldLabel: null, heldSize: null, heldPrice: null, acknowledgement: state.grocery.scanning ? "Rescanning…" : null };
      return root({ ...cooled(state), grocery }, "grocery");
    }
    case "grocery/add-manual": {
      const eventId = `${event.productKey}#manual-${Date.now()}`;
      const cart = addToCart(state.grocery.cart, { productKey: event.productKey, label: event.label, packageSize: event.packageSize, unitPriceCents: event.unitPriceCents, priceSource: event.source, eventId });
      const grocery = { ...state.grocery, undo: [state.grocery.cart, ...state.grocery.undo].slice(0, MAX_UNDO), cart, lastAddKey: event.productKey, acknowledgement: `Added ${event.label}`, manualText: "" };
      return root({ ...cooled(state), grocery, list: completeListFromCart(state.list, cart) }, "grocery");
    }
    case "grocery/confirm-ask": {
      const ask = state.grocery.pendingAsk;
      if (!ask) return state;
      let grocery = { ...state.grocery, pendingAsk: null };
      let list = state.list;
      if (event.yes) {
        const price = ask.priceCents !== null ? { unitPriceCents: ask.priceCents, priceSource: "shelf-label" as const } : cartPrice(state, grocery, ask.productKey);
        const cart = addToCart(grocery.cart, { productKey: ask.productKey, label: ask.label, packageSize: ask.packageSize, ...price, eventId: ask.eventId });
        grocery = { ...grocery, undo: [grocery.cart, ...grocery.undo].slice(0, MAX_UNDO), cart, lastAddKey: ask.productKey };
        list = completeListFromCart(list, cart);
      }
      return bump({ ...(event.yes ? cooled(state) : state), grocery, list });
    }
    case "grocery/qty": {
      const line = state.grocery.cart.find((l) => l.productKey === event.productKey);
      if (!line) return state;
      const cart = setQuantity(state.grocery.cart, event.productKey, line.quantity + event.delta);
      const s = bump({ ...state, grocery: { ...state.grocery, undo: [state.grocery.cart, ...state.grocery.undo].slice(0, MAX_UNDO), cart } });
      return cart.some((l) => l.productKey === event.productKey) ? s : back(s);
    }
    case "grocery/remove": {
      const cart = removeLine(state.grocery.cart, event.productKey);
      return back(bump({ ...state, grocery: { ...state.grocery, undo: [state.grocery.cart, ...state.grocery.undo].slice(0, MAX_UNDO), cart } }));
    }
    case "grocery/price":
      return bump({ ...state, grocery: { ...state.grocery, cart: setManualPrice(state.grocery.cart, event.productKey, event.cents), priceText: "" } });
    case "grocery/undo": {
      const [prev, ...rest] = state.grocery.undo;
      if (!prev) return state;
      return bump({ ...state, grocery: { ...state.grocery, cart: prev, undo: rest, acknowledgement: "Undone" } });
    }
    case "grocery/insight": {
      const current = state.grocery.insights[event.productKey];
      if (current && current.status === event.status && event.data === undefined) return state;
      return bump({ ...state, grocery: { ...state.grocery, insights: { ...state.grocery.insights, [event.productKey]: { status: event.status, data: event.data ?? current?.data ?? null } }, nudgedKeys: state.grocery.nudgedKeys.includes(event.productKey) ? state.grocery.nudgedKeys : [...state.grocery.nudgedKeys, event.productKey] } });
    }
    case "grocery/online": {
      // Prices that arrive after the add fill in a cart line that had none (or only a typical price).
      const cheapest = event.offers.reduce<number | null>((m, o) => (o.priceCents !== null && (m === null || o.priceCents < m) ? o.priceCents : m), null);
      const cart = cheapest === null || state.capture === "sample" ? state.grocery.cart : state.grocery.cart.map((l) => (l.productKey === event.productKey && (l.priceSource === "unknown" || l.priceSource === "estimate") ? { ...l, unitPriceCents: cheapest, priceSource: "online" as const } : l));
      return bump({ ...state, grocery: { ...state.grocery, cart, online: { ...state.grocery.online, [event.productKey]: { status: event.status, offers: event.offers } } } });
    }
    case "grocery/finish": {
      if (state.grocery.cart.length === 0) return state;
      const summary = buildTripSummary(state.grocery.cart, state.grocery.bought.reduce((s, b) => s + b.priceCents, 0));
      const list = state.list.filter((i) => !i.done);
      return push(
        { ...state, grocery: { ...state.grocery, summary, cart: [], undo: [], bought: [], pendingAsk: null, lastAddKey: null, acknowledgement: null }, list },
        { id: "grocery-checkout" },
      );
    }
    case "grocery/bought":
      return replace({ ...state, grocery: { ...state.grocery, bought: [...state.grocery.bought, { retailer: event.retailer, name: event.name, priceCents: event.priceCents, url: event.url }] } }, { id: "grocery-bought" });
    case "grocery/store-entry":
      return bump({ ...state, grocery: { ...state.grocery, storeEntry: event.store ? { store: event.store, active: true } : null } });
    case "grocery/manual-text":
      return bump({ ...state, grocery: { ...state.grocery, manualText: event.text } });
    case "grocery/clear-ack":
      return state.grocery.acknowledgement ? bump({ ...state, grocery: { ...state.grocery, acknowledgement: null } }) : state;

    // ── Shared list ──────────────────────────────────────────────────────────
    case "list/toggle":
      return bump({ ...state, list: state.list.map((i) => (i.key === event.key ? { ...i, done: !i.done } : i)) });

    // ── Gourmet ──────────────────────────────────────────────────────────────
    case "gourmet/scan-start":
      return bump({ ...state, gourmet: { ...state.gourmet, scan: "scanning", scanId: event.scanId, error: null, hypotheses: [], dish: null, recipes: [], recipesStatus: "idle", recipeId: null, servings: {}, deselected: {}, lastSignature: null } });
    case "gourmet/scan-cancel":
      return bump({ ...state, gourmet: { ...state.gourmet, scan: state.gourmet.hypotheses.length ? "result" : "idle", scanId: state.gourmet.scanId + 1 } });
    case "gourmet/scan-result":
      if (event.scanId !== state.gourmet.scanId || state.gourmet.scan !== "scanning") return state;
      return bump({ ...state, gourmet: { ...state.gourmet, scan: event.isFood && event.hypotheses.length ? "result" : "no-food", hypotheses: event.hypotheses } });
    case "gourmet/scan-error":
      if (event.scanId !== state.gourmet.scanId) return state;
      return bump({ ...state, gourmet: { ...state.gourmet, scan: "error", error: event.error } });
    case "gourmet/choose":
      return push({ ...state, gourmet: { ...state.gourmet, dish: event.dish, recipes: [], recipesStatus: "idle" } }, { id: "gourmet-recipes" });
    case "gourmet/recipes-loading":
      return bump({ ...state, gourmet: { ...state.gourmet, recipesStatus: "loading" } });
    case "gourmet/recipes-result":
      if (event.dish !== state.gourmet.dish) return state;
      return bump({ ...state, gourmet: { ...state.gourmet, recipes: event.recipes, recipesStatus: event.recipes.length ? "ready" : "empty" } });
    case "gourmet/recipes-error":
      return bump({ ...state, gourmet: { ...state.gourmet, recipesStatus: "error", error: event.error } });
    case "gourmet/open-recipe":
      return push({ ...state, gourmet: { ...state.gourmet, recipeId: event.recipeId, ingredientPage: 0 } }, { id: "gourmet-recipe", params: { recipeId: event.recipeId } });
    case "gourmet/servings": {
      const r = state.gourmet.recipes.find((x) => x.id === event.recipeId) ?? state.gourmet.saved.find((x) => x.id === event.recipeId);
      if (!r) return state;
      const cur = state.gourmet.servings[event.recipeId] ?? r.servings;
      const next = Math.min(12, Math.max(1, cur + event.delta));
      if (next === cur) return state;
      return bump({ ...state, gourmet: { ...state.gourmet, servings: { ...state.gourmet.servings, [event.recipeId]: next } } });
    }
    case "gourmet/toggle-ingredient": {
      const cur = state.gourmet.deselected[event.recipeId] ?? [];
      const next = cur.includes(event.name) ? cur.filter((n) => n !== event.name) : [...cur, event.name];
      return bump({ ...state, gourmet: { ...state.gourmet, deselected: { ...state.gourmet.deselected, [event.recipeId]: next } } });
    }
    case "gourmet/ingredient-page":
      return bump({ ...state, gourmet: { ...state.gourmet, ingredientPage: Math.max(0, state.gourmet.ingredientPage + event.delta) } });
    case "gourmet/add-to-list": {
      const sel = selectedRecipeIngredients(state, event.recipeId);
      if (!sel || sel.selected.length === 0) return bump({ ...state, toast: { text: "Nothing selected", at: Date.now() } });
      const sig = additionSignature(event.recipeId, sel.selected);
      if (sig === state.gourmet.lastSignature) return push(state, { id: "gourmet-added" });
      const list = addIngredientsToList(state.list, sel.recipe, sel.selected);
      return push({ ...state, list, gourmet: { ...state.gourmet, lastSignature: sig } }, { id: "gourmet-added" });
    }
    case "gourmet/save": {
      const r = state.gourmet.recipes.find((x) => x.id === event.recipeId);
      if (!r || state.gourmet.saved.some((x) => x.id === r.id)) return bump({ ...state, toast: { text: "Already saved", at: Date.now() } });
      return bump({ ...state, gourmet: { ...state.gourmet, saved: [...state.gourmet.saved, r] }, toast: { text: "Recipe saved", at: Date.now() } });
    }

    // ── Online listings ──────────────────────────────────────────────────────
    case "listings/query":
      return bump({ ...state, listings: { ...state.listings, query: event.query } });
    case "listings/loading":
      return bump({ ...state, listings: { query: event.query, status: "loading", offers: [], offerId: null, error: null } });
    case "listings/result": {
      if (state.listings.query !== event.query) return state;
      const offers = event.replace ? event.offers : mergeOffers(state.listings.offers, event.offers);
      const offerId = state.listings.offerId && offers.some((o) => o.id === state.listings.offerId) ? state.listings.offerId : offers[0]?.id ?? null;
      return bump({ ...state, listings: { ...state.listings, offers, offerId, status: event.done ? (offers.length ? "ready" : "empty") : "loading" } });
    }
    case "listings/error":
      if (state.listings.query !== event.query) return state;
      return bump({ ...state, listings: { ...state.listings, status: state.listings.offers.length ? "ready" : "error", error: event.error } });
    case "listings/select":
      return bump({ ...state, listings: { ...state.listings, offerId: event.offerId } });
    case "listings/step": {
      const list = state.listings.offers;
      const i = Math.max(0, list.findIndex((o) => o.id === state.listings.offerId));
      const next = list[(i + event.delta + list.length) % Math.max(1, list.length)];
      return next ? bump({ ...state, listings: { ...state.listings, offerId: next.id } }) : state;
    }

    // ── Handoff ──────────────────────────────────────────────────────────────
    case "handoff/set": {
      const handoff = { status: event.status, kind: event.kind ?? state.handoff.kind, title: event.title ?? state.handoff.title, url: event.url ?? state.handoff.url, error: event.error ?? null };
      const s = bump({ ...state, handoff });
      return state.screen.id === "handoff" ? s : push(s, { id: "handoff" });
    }

    // ── Wallet / payment ─────────────────────────────────────────────────────
    case "wallet/set":
      return bump({ ...state, wallet: { ...state.wallet, ...event.wallet } });
    case "payment/quoting":
      if (state.payment.status === "pending" || state.payment.status === "needs-action") return state;
      return bump({ ...state, payment: { ...state.payment, status: "quoting", offerId: event.offerId, quote: null, error: null, originMode: event.originMode } });
    case "payment/quote":
      if (state.payment.offerId !== event.offerId || state.payment.status !== "quoting") return state;
      return bump({ ...state, payment: { ...state.payment, status: "ready", quote: event.quote } });
    case "payment/submit":
      if (state.payment.status !== "ready" && state.payment.status !== "error") return state; // prevents repeated submission
      return bump({ ...state, payment: { ...state.payment, status: "pending", attemptKey: event.attemptKey, error: null } });
    case "payment/status":
      return bump({ ...state, payment: { ...state.payment, status: event.status, orderId: event.orderId ?? state.payment.orderId, order: event.order === undefined ? state.payment.order : event.order, error: event.error ?? null } });
    case "payment/demo-start":
      if (state.payment.status === "pending") return state; // prevents repeated submission
      return bump({ ...state, payment: { status: "pending", offerId: event.offerId, quote: null, orderId: null, order: null, error: null, attemptKey: event.attemptKey, originMode: event.originMode, demo: true } });
    case "payment/phone-link":
      if (!state.payment.demo) return state; // a link for a payment the wearer already dismissed
      return bump({ ...state, payment: { ...state.payment, phoneLink: event.status } });
    case "payment/clear": {
      const originMode = state.payment.originMode ?? state.mode;
      const cleared = { ...state, payment: { ...emptyLens().payment } };
      return root(cleared, originMode);
    }

    // ── Composer ─────────────────────────────────────────────────────────────
    case "composer/open":
      return bump({ ...state, composer: { field: event.field, value: event.value, page: 0, returnTo: state.screen } });
    case "composer/type":
      if (!state.composer) return state;
      return bump({ ...state, composer: { ...state.composer, value: (state.composer.value + event.char).slice(0, 40) } });
    case "composer/delete":
      if (!state.composer) return state;
      return bump({ ...state, composer: { ...state.composer, value: state.composer.value.slice(0, -1) } });
    case "composer/page":
      if (!state.composer) return state;
      return bump({ ...state, composer: { ...state.composer, page: (state.composer.page + event.delta + COMPOSER_PAGES) % COMPOSER_PAGES } });
    case "composer/done": {
      if (!state.composer) return state;
      const { field, value } = state.composer;
      const s = bump({ ...state, composer: null });
      if (field === "listings-query") return { ...s, listings: { ...s.listings, query: value.trim() } };
      if (field === "grocery-manual") return { ...s, grocery: { ...s.grocery, manualText: value.trim() } };
      if (field.startsWith("price:")) return { ...s, grocery: { ...s.grocery, priceText: value.trim() } };
      return s;
    }
    case "composer/cancel":
      return state.composer ? bump({ ...state, composer: null }) : state;
  }
  return state;
}

export const LIST_WINDOW = 3;
export const COMPOSER_PAGES = 3;

/** Merge streamed offers by stable id, preserving order of first appearance. */
export function mergeOffers(existing: Offer[], incoming: Offer[]): Offer[] {
  const byId = new Map(existing.map((o) => [o.id, o]));
  for (const o of incoming) byId.set(o.id, { ...(byId.get(o.id) ?? {}), ...o });
  return [...byId.values()];
}

export function cartSubtotal(cart: CartLine[]) {
  return cartTotals(cart);
}

export function unfinishedList(list: ShoppingListItem[]) {
  return list.filter((i) => !i.done);
}
