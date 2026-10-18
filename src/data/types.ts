// Shared typed data contracts used by fixtures, UI, API handlers, and tests.

export type Mode = "glimpse" | "grocery" | "gourmet";
export type CaptureKind = "sample" | "webcam" | "native";
export type MatchLevel = "exact" | "possible" | "similar";
export type CommerceKind = "connect_merchant" | "integrated_merchant" | "external_link";
export type PriceSource = "catalog" | "shelf-label" | "online" | "estimate" | "manual" | "unknown";

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Candidate {
  id: string;
  label: string;
  category: string;
  attributes: string[];
  confidence: number;
  box?: NormalizedBox;
  brand?: string;
  variant?: string;
  primary?: boolean;
}

export interface RankedCandidate extends Candidate {
  interest: number;
  reason: string;
  seen: number;
}

export interface Sponsorship {
  campaignId: string;
  disclosure: "Sponsored";
  attributionToken: string;
  model: "cpc" | "cpa";
}

export interface Offer {
  id: string;
  candidateId?: string;
  query?: string;
  name: string;
  retailer: string;
  url: string;
  imageUrl: string | null;
  /** Integer USD cents; null when unknown (renders "See price"). */
  priceCents: number | null;
  match: MatchLevel;
  evidence?: string;
  badge?: string;
  kind: CommerceKind;
  /** Server-approved merchant/SKU references; only present when `kind !== "external_link"`. */
  merchantId?: string;
  sku?: string;
  variant?: string;
  sponsored?: Sponsorship;
  origin: "sample" | "live";
}

export interface GroceryProduct {
  id: string;
  name: string;
  size: string;
  category: GroceryCategory;
  /** Sample QFC shelf price in cents. */
  qfcPriceCents: number;
  required: string[];
  excluded: string[];
}

export type GroceryCategory =
  | "Produce" | "Dairy" | "Meat" | "Bakery" | "Pantry" | "Snacks" | "Beverages" | "Other";

export interface StoreOffer {
  productId: string;
  store: string;
  priceCents: number;
  size: string;
  match: "same" | "alternative";
}

export interface Nutrition {
  productId: string;
  serving: string;
  kcal: number;
  protein: number;
  carbs: number;
  sugar: number;
  fat: number;
  sodium: number;
  allergens: Allergen[];
}

export type Allergen =
  | "gluten" | "dairy" | "egg" | "peanut" | "tree_nut" | "soy" | "fish" | "shellfish" | "sesame";

export interface AisleLocation {
  productId: string;
  aisle: number;
  section: string;
  side: "left" | "right";
}

export interface Store {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Ingredient {
  name: string;
  quantity: number | null;
  unit: string | null;
}

export interface Recipe {
  id: string;
  title: string;
  minutes: number;
  servings: number;
  ingredients: Ingredient[];
  steps: string[];
  source: "sample" | "generated";
}

export interface DishHypothesis {
  name: string;
  confidence: number;
  cues: string[];
}

export interface Amount {
  quantity: number | null;
  unit: string | null;
}

export interface ShoppingListItem {
  key: string;
  name: string;
  amounts: Amount[];
  recipes: string[];
  done: boolean;
}

export type ObservationState = "on_shelf" | "held" | "placing" | "in_cart";

export interface GroceryObservation {
  productKey: string;
  label: string;
  state: ObservationState;
  confidence: number;
  packageSize: string | null;
  priceCents: number | null;
  /** Model estimate of a typical price, used while no shelf, online or catalog price is known (marked ≈ / "est."). Never billed. */
  estimatedPriceCents?: number | null;
}

export interface CartLine {
  productKey: string;
  label: string;
  packageSize: string | null;
  quantity: number;
  unitPriceCents: number | null;
  currency: "USD";
  priceSource: PriceSource;
  confirmed: boolean;
  events: string[];
}

export interface MerchantCatalogItem {
  merchantId: string;
  sku: string;
  name: string;
  description: string;
  unitPriceCents: number;
  currency: "USD";
  /** Grocery catalog key or Glimpse candidate category this SKU can satisfy. */
  satisfies: string[];
  stock: number;
}
