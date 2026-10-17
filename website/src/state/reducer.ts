import { ALTERNATIVES, JACKETS, MEAL, PRODUCT_BY_ID, PRODUCTS, ROUTE_Z, type ScenarioId } from "./data";

export interface ListItem { productId: string; label: string; checked: boolean }
export interface State {
  entered: boolean;
  scene: ScenarioId;
  cart: Record<string, number>;
  list: ListItem[];
  savedJackets: string[];
  // grocery
  selected: string | null;
  recognizing: boolean;
  tab: "compare" | "nutrition";
  pref: "none" | "lower-sugar" | "dairy-free";
  route: { productId: string; z: number; progress: number } | null;
  lastAddAt: number;
  // jacket
  jacketSelected: boolean;
  jacketIndex: number;
  jacketRejected: boolean;
  // meal
  mealStep: "none" | "dish" | "recipe" | "list";
  mealAdded: boolean;
  // walkthrough
  walkthrough: { playing: boolean; index: number; startedAt: number; pausedAt: number | null; caption: string | null; complete: boolean };
  finished: boolean;
  drawer: "none" | "list" | "help";
}

export const initialList = (): ListItem[] => [
  { productId: "milk", label: "Whole dairy milk", checked: false },
  { productId: "cereal", label: "Honey oat cereal", checked: false },
];

export const initialState = (): State => ({
  entered: false, scene: "grocery", cart: {}, list: initialList(), savedJackets: [],
  selected: null, recognizing: false, tab: "compare", pref: "none", route: null, lastAddAt: 0,
  jacketSelected: false, jacketIndex: 0, jacketRejected: false,
  mealStep: "none", mealAdded: false,
  walkthrough: { playing: false, index: 0, startedAt: 0, pausedAt: null, caption: null, complete: false },
  finished: false, drawer: "none",
});

export type Action =
  | { type: "enter" } | { type: "exit" } | { type: "restart" }
  | { type: "scene"; scene: ScenarioId }
  | { type: "grocery/select"; productId: string | null } | { type: "grocery/recognized" } | { type: "grocery/tab"; tab: State["tab"] }
  | { type: "grocery/pref"; pref: State["pref"] } | { type: "grocery/choose"; productId: string }
  | { type: "grocery/add"; now: number } | { type: "grocery/remove"; productId: string } | { type: "grocery/putback" }
  | { type: "grocery/navigate" } | { type: "grocery/route-progress"; progress: number } | { type: "grocery/route-arrived" }
  | { type: "jacket/select" } | { type: "jacket/next" } | { type: "jacket/prev" } | { type: "jacket/save" } | { type: "jacket/none" }
  | { type: "meal/select" } | { type: "meal/step"; step: State["mealStep"] } | { type: "meal/add" }
  | { type: "list/toggle"; productId: string }
  | { type: "walk/start"; now: number } | { type: "walk/pause"; now: number } | { type: "walk/resume"; now: number } | { type: "walk/advance"; index: number; caption: string } | { type: "walk/complete" }
  | { type: "finish" } | { type: "drawer"; drawer: State["drawer"] };

export const cartCount = (s: State) => Object.values(s.cart).reduce((a, b) => a + b, 0);
export const cartTotal = (s: State) => Object.entries(s.cart).reduce((a, [id, q]) => a + PRODUCT_BY_ID[id].thisStore * q, 0);

export function nextRouteTarget(s: State): string | null {
  const unchecked = s.list.find((i) => !i.checked && PRODUCT_BY_ID[i.productId]);
  if (unchecked) return unchecked.productId;
  return PRODUCTS.find((p) => !s.cart[p.id])?.id ?? null;
}

export function effectiveAlternative(s: State): string | null {
  if (!s.selected) return null;
  const alt = ALTERNATIVES[s.selected];
  if (!alt) return null;
  const cur = PRODUCT_BY_ID[s.selected]; const a = PRODUCT_BY_ID[alt];
  if (s.pref === "lower-sugar" && a.sugar < cur.sugar) return alt;
  if (s.pref === "dairy-free" && cur.dairy === "dairy" && a.dairy === "plant") return alt;
  return null;
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "enter": return { ...s, entered: true };
    case "exit": return { ...s, entered: false, drawer: "none" };
    case "restart": return { ...initialState(), entered: true };
    case "scene": return { ...s, scene: a.scene, selected: null, recognizing: false, route: null, drawer: "none", jacketSelected: false, jacketRejected: false, mealStep: "none" };
    case "grocery/select": return a.productId ? { ...s, selected: a.productId, recognizing: true, tab: "compare", drawer: "none" } : { ...s, selected: null, recognizing: false };
    case "grocery/recognized": return s.recognizing ? { ...s, recognizing: false } : s;
    case "grocery/tab": return { ...s, tab: a.tab };
    case "grocery/pref": return { ...s, pref: a.pref };
    case "grocery/choose": {
      const prev = s.selected;
      const list = prev && prev !== a.productId ? s.list.map((i) => (i.productId === prev ? { ...i, productId: a.productId, label: PRODUCT_BY_ID[a.productId].name } : i)) : s.list;
      return { ...s, selected: a.productId, recognizing: false, list, route: s.route && s.route.productId === prev ? { ...s.route, productId: a.productId, z: ROUTE_Z(PRODUCT_BY_ID[a.productId].aisle) } : s.route };
    }
    case "grocery/add": {
      if (!s.selected || a.now - s.lastAddAt < 650) return s; // repeat-click guard
      const id = s.selected;
      const cart = { ...s.cart, [id]: (s.cart[id] ?? 0) + 1 };
      const list = s.list.map((i) => (i.productId === id ? { ...i, checked: true } : i));
      return { ...s, cart, list, lastAddAt: a.now, selected: null, recognizing: false, route: null };
    }
    case "grocery/remove": {
      const q = (s.cart[a.productId] ?? 0) - 1;
      const cart = { ...s.cart };
      if (q <= 0) delete cart[a.productId]; else cart[a.productId] = q;
      const list = q <= 0 ? s.list.map((i) => (i.productId === a.productId ? { ...i, checked: false } : i)) : s.list;
      return { ...s, cart, list };
    }
    case "grocery/putback": return { ...s, selected: null, recognizing: false };
    case "grocery/navigate": {
      const target = nextRouteTarget(s);
      if (!target) return s;
      return { ...s, scene: "grocery", drawer: "none", selected: null, recognizing: false, route: { productId: target, z: ROUTE_Z(PRODUCT_BY_ID[target].aisle), progress: 0 } };
    }
    case "grocery/route-progress": return s.route ? { ...s, route: { ...s.route, progress: a.progress } } : s;
    case "grocery/route-arrived": return s.route ? { ...s, route: { ...s.route, progress: 1 }, selected: s.route.productId, recognizing: true, tab: "compare" } : s;
    case "jacket/select": return { ...s, jacketSelected: true, jacketRejected: false, jacketIndex: 0 };
    case "jacket/next": return { ...s, jacketIndex: (s.jacketIndex + 1) % JACKETS.length };
    case "jacket/prev": return { ...s, jacketIndex: (s.jacketIndex - 1 + JACKETS.length) % JACKETS.length };
    case "jacket/save": { const id = JACKETS[s.jacketIndex].id; return { ...s, savedJackets: s.savedJackets.includes(id) ? s.savedJackets.filter((x) => x !== id) : [...s.savedJackets, id] }; }
    case "jacket/none": return { ...s, jacketSelected: false, jacketRejected: true };
    case "meal/select": return { ...s, mealStep: "dish" };
    case "meal/step": return { ...s, mealStep: a.step };
    case "meal/add": {
      if (s.mealAdded) return { ...s, mealStep: "list" };
      let list = [...s.list];
      for (const ing of MEAL.ingredients) if (!list.some((i) => i.productId === ing.productId)) list.push({ productId: ing.productId, label: PRODUCT_BY_ID[ing.productId].name, checked: !!s.cart[ing.productId] });
      return { ...s, list, mealAdded: true, mealStep: "list" };
    }
    case "list/toggle": return { ...s, list: s.list.map((i) => (i.productId === a.productId ? { ...i, checked: !i.checked } : i)) };
    case "walk/start": return { ...initialState(), entered: true, walkthrough: { playing: true, index: 0, startedAt: a.now, pausedAt: null, caption: null, complete: false } };
    case "walk/pause": return s.walkthrough.playing ? { ...s, walkthrough: { ...s.walkthrough, playing: false, pausedAt: a.now } } : s;
    case "walk/resume": { const w = s.walkthrough; if (w.playing || w.complete) return s; const shift = w.pausedAt ? a.now - w.pausedAt : 0; return { ...s, walkthrough: { ...w, playing: true, pausedAt: null, startedAt: w.startedAt + shift } }; }
    case "walk/advance": return { ...s, walkthrough: { ...s.walkthrough, index: a.index, caption: a.caption } };
    case "walk/complete": return { ...s, walkthrough: { ...s.walkthrough, playing: false, complete: true } };
    case "finish": return { ...s, finished: true, drawer: "none" };
    case "drawer": return { ...s, drawer: a.drawer };
  }
}

/** Walkthrough action strings map to reducer actions (same as manual interaction). */
export function walkAction(action: string, now: number): Action | null {
  const [a, b, c] = action.split(":");
  switch (a) {
    case "scene": return { type: "scene", scene: b as ScenarioId };
    case "jacket": return b === "select" ? { type: "jacket/select" } : b === "next" ? { type: "jacket/next" } : { type: "jacket/save" };
    case "meal": return b === "select" ? { type: "meal/select" } : b === "recipe" ? { type: "meal/step", step: "recipe" } : b === "ingredients" ? { type: "meal/step", step: "list" } : { type: "meal/add" };
    case "grocery":
      if (b === "select") return { type: "grocery/select", productId: c };
      if (b === "tab") return { type: "grocery/tab", tab: "nutrition" };
      if (b === "add") return { type: "grocery/add", now };
      if (b === "pref") return { type: "grocery/pref", pref: "dairy-free" };
      if (b === "choose") return { type: "grocery/choose", productId: c };
      if (b === "navigate") return { type: "grocery/navigate" };
      return null;
    case "finish": return { type: "finish" };
    case "complete": return { type: "walk/complete" };
  }
  return null;
}
