import type {
  CaptureKind, CartLine, DishHypothesis, Mode, Offer, RankedCandidate, Recipe, ShoppingListItem,
} from "@/data/types";

export type { Mode };
import type { TrackerState } from "@/domain/grocery/tracker";
import type { ItemInsight } from "@/domain/grocery/insights";
import type { TripSummary } from "@/domain/grocery/exit";
import type { Quote } from "@/domain/commerce/quote";

export type ScreenId =
  | "picker" | "online-listings" | "composer" | "more"
  | "glimpse" | "glimpse-candidates" | "glimpse-offers" | "glimpse-cart" | "glimpse-cart-item" | "handoff"
  | "grocery" | "grocery-item" | "grocery-compare" | "grocery-edit" | "grocery-manual" | "grocery-list"
  | "grocery-checkout" | "grocery-bought" | "grocery-find"
  | "gourmet" | "gourmet-recipes" | "gourmet-recipe" | "gourmet-steps" | "gourmet-shop" | "gourmet-added"
  | "stores" | "nav" | "wallet" | "wallet-orders" | "wallet-order" | "connect";

export interface Screen {
  id: ScreenId;
  params?: Record<string, string | number>;
}

export type ActionVariant = "primary" | "secondary" | "row" | "icon" | "pay" | "quiet" | "danger";

export interface LensAction {
  id: string;
  label: string;
  row: number;
  x: number;
  variant: ActionVariant;
  events: LensEvent[];
  effect?: LensEffect;
  /** Index within a scrolling list, used to keep the focused row visible. */
  listIndex?: number;
  disabled?: boolean;
  hint?: string;
  /** Visually editable field (composer target). */
  field?: string;
}

export type ScanStatus = "idle" | "scanning" | "result" | "error" | "no-food";
export type AsyncStatus = "idle" | "loading" | "ready" | "error" | "empty";
export type HandoffStatus = "idle" | "sending" | "queued" | "sent" | "failed";
export type PairingStatus = "none" | "waiting" | "connected" | "awaiting-camera" | "reconnecting" | "stale" | "denied" | "unavailable";
export type WalletStatus = "unknown" | "signed-out" | "not-ready" | "ready";
export type AutoBuyStatus = "off" | "on" | "paused";
export type PaymentStatus =
  | "idle" | "quoting" | "ready" | "pending" | "needs-action" | "confirmed" | "accepted" | "error" | "recovery";

export interface SavedOffer extends Offer { savedAt: number; candidateLabel: string }

export interface OrderSummary {
  id: string;
  merchantName: string;
  totalCents: number;
  currency: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
  lines: { name: string; quantity: number; lineTotalCents: number }[];
  reference: string;
  cardSummary?: string;
  mode?: Mode;
}

export interface GlimpseState {
  scan: ScanStatus;
  scanId: number;
  candidates: RankedCandidate[];
  frozenCandidates: RankedCandidate[] | null;
  chosenId: string | null;
  seenWindow: string[][];
  offers: Offer[];
  offersStatus: AsyncStatus;
  offersQuery: string | null;
  offerId: string | null;
  saved: SavedOffer[];
  frameIndex: number;
  error: string | null;
}

export interface GroceryState {
  scanning: boolean;
  tracker: TrackerState;
  cart: CartLine[];
  undo: CartLine[][];
  heldKey: string | null;
  heldLabel: string | null;
  heldSize: string | null;
  /** Price known at recognition time (shelf label, else model estimate) so the card never waits on insight. */
  heldPrice?: { cents: number; source: "shelf-label" | "estimate" } | null;
  pendingAsk: { eventId: string; productKey: string; label: string; packageSize: string | null; priceCents: number | null } | null;
  insights: Record<string, { status: AsyncStatus; data: ItemInsight | null }>;
  nudgedKeys: string[];
  lastAddKey: string | null;
  acknowledgement: string | null;
  summary: TripSummary | null;
  bought: { retailer: string; name: string; priceCents: number; url: string }[];
  frameIndex: number;
  storeEntry: { store: string; active: boolean } | null;
  manualText: string;
  priceText: string;
}

export interface GourmetState {
  scan: ScanStatus;
  scanId: number;
  hypotheses: DishHypothesis[];
  dish: string | null;
  recipes: Recipe[];
  recipesStatus: AsyncStatus;
  recipeId: string | null;
  servings: Record<string, number>;
  deselected: Record<string, string[]>;
  saved: Recipe[];
  lastSignature: string | null;
  ingredientPage: number;
  error: string | null;
}

export interface PaymentState {
  status: PaymentStatus;
  offerId: string | null;
  quote: Quote | null;
  orderId: string | null;
  order: OrderSummary | null;
  error: string | null;
  attemptKey: string | null;
  originMode: Mode | null;
}

export interface WalletState {
  status: WalletStatus;
  brand: string | null;
  last4: string | null;
  autoBuy: AutoBuyStatus;
  ruleSummary: string | null;
  orders: OrderSummary[];
  email: string | null;
}

export interface ListingsState {
  query: string;
  status: AsyncStatus;
  offers: Offer[];
  offerId: string | null;
  error: string | null;
}

export interface HandoffState {
  status: HandoffStatus;
  kind: "buy" | "view" | "nav" | "checkout" | null;
  title: string | null;
  url: string | null;
  error: string | null;
}

export interface LensState {
  mode: Mode;
  capture: CaptureKind;
  screen: Screen;
  stack: Screen[];
  focusId: string | null;
  windowStart: number;
  revision: number;
  session: number;
  reducedMotion: boolean;
  pairing: { status: PairingStatus; code: string | null };
  glimpse: GlimpseState;
  grocery: GroceryState;
  gourmet: GourmetState;
  list: ShoppingListItem[];
  wallet: WalletState;
  payment: PaymentState;
  listings: ListingsState;
  handoff: HandoffState;
  toast: { text: string; at: number } | null;
  composer: { field: string; value: string; page: number; returnTo: Screen } | null;
  location: { lat: number; lng: number; label: string; source: "demo" | "device" } ;
}

// ──────────────────────────────────────────────────────────────────────────────
// Events: pure state transitions.
// ──────────────────────────────────────────────────────────────────────────────

export type LensEvent =
  | { type: "init"; reducedMotion?: boolean; capture?: CaptureKind }
  | { type: "nav/push"; screen: Screen }
  | { type: "nav/replace"; screen: Screen }
  | { type: "nav/back" }
  | { type: "nav/root" }
  | { type: "nav/more" }
  | { type: "mode/set"; mode: Mode }
  | { type: "capture/set"; capture: CaptureKind }
  | { type: "focus/set"; id: string | null; listIndex?: number }
  | { type: "window/set"; start: number }
  | { type: "toast"; text: string | null }
  | { type: "reset" }
  | { type: "hydrate"; saved: SavedOffer[]; recipes: Recipe[]; list: ShoppingListItem[] }
  | { type: "pairing/set"; status: PairingStatus; code?: string | null }
  | { type: "location/set"; lat: number; lng: number; label: string; source: "demo" | "device" }
  // glimpse
  | { type: "glimpse/scan-start"; scanId: number }
  | { type: "glimpse/scan-cancel" }
  | { type: "glimpse/scan-result"; scanId: number; candidates: RankedCandidate[]; frameIndex: number }
  | { type: "glimpse/scan-error"; scanId: number; error: string }
  | { type: "glimpse/choose"; candidateId: string }
  | { type: "glimpse/offers-loading"; query: string }
  | { type: "glimpse/offers-result"; query: string; offers: Offer[]; done: boolean }
  | { type: "glimpse/offers-error"; query: string; error: string }
  | { type: "glimpse/offer-select"; offerId: string }
  | { type: "glimpse/offer-step"; delta: 1 | -1 }
  | { type: "glimpse/save-toggle"; offer: Offer }
  | { type: "glimpse/remove-saved"; offerId: string }
  // grocery
  | { type: "grocery/scan-toggle"; on?: boolean }
  | { type: "grocery/frame"; observations: import("@/data/types").GroceryObservation[]; frameIndex: number }
  | { type: "grocery/add-held" }
  | { type: "grocery/add-manual"; productKey: string; label: string; packageSize: string | null; unitPriceCents: number | null; source: import("@/data/types").PriceSource }
  | { type: "grocery/confirm-ask"; yes: boolean }
  | { type: "grocery/qty"; productKey: string; delta: 1 | -1 }
  | { type: "grocery/remove"; productKey: string }
  | { type: "grocery/price"; productKey: string; cents: number | null }
  | { type: "grocery/undo" }
  | { type: "grocery/insight"; productKey: string; status: AsyncStatus; data?: ItemInsight | null }
  | { type: "grocery/finish" }
  | { type: "grocery/bought"; retailer: string; name: string; priceCents: number; url: string }
  | { type: "grocery/store-entry"; store: string | null }
  | { type: "grocery/manual-text"; text: string }
  | { type: "grocery/clear-ack" }
  // list
  | { type: "list/toggle"; key: string }
  // gourmet
  | { type: "gourmet/scan-start"; scanId: number }
  | { type: "gourmet/scan-cancel" }
  | { type: "gourmet/scan-result"; scanId: number; isFood: boolean; hypotheses: DishHypothesis[] }
  | { type: "gourmet/scan-error"; scanId: number; error: string }
  | { type: "gourmet/choose"; dish: string }
  | { type: "gourmet/recipes-loading" }
  | { type: "gourmet/recipes-result"; dish: string; recipes: Recipe[] }
  | { type: "gourmet/recipes-error"; error: string }
  | { type: "gourmet/open-recipe"; recipeId: string }
  | { type: "gourmet/servings"; recipeId: string; delta: 1 | -1 }
  | { type: "gourmet/toggle-ingredient"; recipeId: string; name: string }
  | { type: "gourmet/ingredient-page"; delta: 1 | -1 }
  | { type: "gourmet/add-to-list"; recipeId: string }
  | { type: "gourmet/save"; recipeId: string }
  // listings
  | { type: "listings/query"; query: string }
  | { type: "listings/loading"; query: string }
  | { type: "listings/result"; query: string; offers: Offer[]; done: boolean }
  | { type: "listings/error"; query: string; error: string }
  | { type: "listings/select"; offerId: string }
  | { type: "listings/step"; delta: 1 | -1 }
  // handoff
  | { type: "handoff/set"; status: HandoffStatus; kind?: HandoffState["kind"]; title?: string; url?: string; error?: string }
  // wallet / payment
  | { type: "wallet/set"; wallet: Partial<WalletState> }
  | { type: "payment/quoting"; offerId: string; originMode: Mode }
  | { type: "payment/quote"; offerId: string; quote: Quote }
  | { type: "payment/submit"; attemptKey: string }
  | { type: "payment/status"; status: PaymentStatus; orderId?: string; order?: OrderSummary | null; error?: string }
  | { type: "payment/clear" }
  // composer
  | { type: "composer/open"; field: string; value: string }
  | { type: "composer/type"; char: string }
  | { type: "composer/delete" }
  | { type: "composer/page"; delta: 1 | -1 }
  | { type: "composer/done" }
  | { type: "composer/cancel" };

// ──────────────────────────────────────────────────────────────────────────────
// Effects: side effects requested by actions; executed by the provider.
// ──────────────────────────────────────────────────────────────────────────────

export type LensEffect =
  | { kind: "glimpse-scan" }
  | { kind: "glimpse-offers"; candidateId: string }
  | { kind: "gourmet-scan" }
  | { kind: "gourmet-recipes"; dish: string }
  | { kind: "grocery-insight"; productKey: string; label: string; packageSize: string | null }
  | { kind: "grocery-exit" }
  | { kind: "listings-search"; query: string }
  | { kind: "handoff"; handoffKind: NonNullable<HandoffState["kind"]>; title: string; url: string }
  | { kind: "open-url"; url: string }
  | { kind: "quote"; offerId: string }
  | { kind: "purchase"; offerId: string }
  | { kind: "retry-purchase" }
  | { kind: "wallet-refresh" }
  | { kind: "wallet-pause-rule"; pause: boolean }
  | { kind: "orders-refresh" }
  | { kind: "locate" }
  | { kind: "persist" }
  | { kind: "sample-grocery-bought"; retailer: string; name: string; priceCents: number; url: string };

export const ROOT_SCREEN: Record<Mode, ScreenId> = { glimpse: "glimpse", grocery: "grocery", gourmet: "gourmet" };

export const MODE_META: Record<Mode, { label: string; color: string; hint: string; icon: "scan" | "basket" | "dish" }> = {
  glimpse: { label: "Glimpse", color: "#A9CDF5", hint: "Shop what you see", icon: "scan" },
  grocery: { label: "Grocery", color: "#A9CDF5", hint: "Track your cart", icon: "basket" },
  gourmet: { label: "Gourmet", color: "#A9CDF5", hint: "Cook what you see", icon: "dish" },
};

export const PAY_COLOR = "#3C6CF0";
