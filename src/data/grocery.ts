import type {
  AisleLocation, GroceryObservation, GroceryProduct, Nutrition, Store, StoreOffer,
} from "./types";

export const HOME_STORE = "QFC";
export const SAMPLE_SHOPPER = {
  name: "Alex",
  diets: ["gluten-free", "keto"] as const,
  allergies: ["peanut"] as const,
  ketoCarbThresholdG: 10,
};

export const GROCERY_CATALOG: GroceryProduct[] = [
  { id: "greek-yogurt-vanilla-32oz", name: "Greek yogurt, vanilla", size: "32 oz", category: "Dairy", qfcPriceCents: 549, required: ["yogurt"], excluded: [] },
  { id: "lemonade-59oz", name: "Lemonade", size: "59 oz", category: "Beverages", qfcPriceCents: 349, required: ["lemonade"], excluded: ["zero", "sugar free", "sugar-free", "diet", "light"] },
  { id: "tortilla-chips-13oz", name: "Tortilla chips", size: "13 oz", category: "Snacks", qfcPriceCents: 429, required: ["chips"], excluded: ["potato", "chocolate"] },
  { id: "fettuccine-16oz", name: "Fettuccine", size: "16 oz", category: "Pantry", qfcPriceCents: 199, required: ["fettuccine"], excluded: [] },
  { id: "heavy-cream-16oz", name: "Heavy cream", size: "16 oz", category: "Dairy", qfcPriceCents: 389, required: ["cream"], excluded: ["ice cream", "sour", "cheese"] },
  { id: "parmesan-8oz", name: "Parmesan, grated", size: "8 oz", category: "Dairy", qfcPriceCents: 599, required: ["parmesan"], excluded: [] },
  { id: "butter-16oz", name: "Butter, unsalted", size: "16 oz", category: "Dairy", qfcPriceCents: 479, required: ["butter"], excluded: ["peanut", "almond", "apple"] },
  { id: "whole-milk-gal", name: "Whole milk", size: "1 gal", category: "Dairy", qfcPriceCents: 389, required: ["milk"], excluded: ["oat", "almond", "soy", "chocolate"] },
  { id: "lemonade-zero-59oz", name: "Zero-sugar lemonade", size: "59 oz", category: "Beverages", qfcPriceCents: 379, required: ["lemonade", "zero"], excluded: [] },
  { id: "potato-chips-8oz", name: "Potato chips, sea salt", size: "8 oz", category: "Snacks", qfcPriceCents: 399, required: ["potato", "chips"], excluded: [] },
  { id: "chicken-breast-1lb", name: "Chicken breast", size: "1 lb", category: "Meat", qfcPriceCents: 599, required: ["chicken"], excluded: ["soup", "broth", "stock", "nugget"] },
  { id: "cheddar-8oz", name: "Cheddar cheese, sharp", size: "8 oz", category: "Dairy", qfcPriceCents: 349, required: ["cheddar"], excluded: [] },
  { id: "wheat-bread-20oz", name: "Whole wheat bread", size: "20 oz", category: "Bakery", qfcPriceCents: 329, required: ["bread"], excluded: [] },
  { id: "eggs-12ct", name: "Eggs, large", size: "12 ct", category: "Dairy", qfcPriceCents: 449, required: ["egg"], excluded: ["eggplant", "noodle"] },
  { id: "bananas-lb", name: "Bananas", size: "per lb", category: "Produce", qfcPriceCents: 69, required: ["banana"], excluded: [] },
  { id: "peanut-butter-16oz", name: "Peanut butter, creamy", size: "16 oz", category: "Pantry", qfcPriceCents: 319, required: ["peanut", "butter"], excluded: [] },
  { id: "garlic-head", name: "Garlic", size: "1 head", category: "Produce", qfcPriceCents: 79, required: ["garlic"], excluded: ["powder", "salt", "bread"] },
  { id: "sparkling-water-12pk", name: "Sparkling water, lime", size: "12 × 12 oz", category: "Beverages", qfcPriceCents: 599, required: ["sparkling"], excluded: [] },
  { id: "oat-cereal-18oz", name: "Oat cereal", size: "18 oz", category: "Pantry", qfcPriceCents: 459, required: ["cereal"], excluded: [] },
  { id: "spaghetti-16oz", name: "Spaghetti", size: "16 oz", category: "Pantry", qfcPriceCents: 179, required: ["spaghetti"], excluded: [] },
];

export const CATALOG_BY_ID: Record<string, GroceryProduct> = Object.fromEntries(
  GROCERY_CATALOG.map((p) => [p.id, p]),
);

/** QFC sample stock excludes Parmesan even though a reference shelf price exists. */
export const QFC_OUT_OF_STOCK = new Set(["parmesan-8oz"]);

const so = (productId: string, store: string, price: number, size: string, match: "same" | "alternative" = "same"): StoreOffer =>
  ({ productId, store, priceCents: price, size, match });

export const STORE_OFFERS: StoreOffer[] = [
  so("greek-yogurt-vanilla-32oz", "WinCo Foods", 449, "32 oz"),
  so("greek-yogurt-vanilla-32oz", "Safeway", 599, "32 oz"),
  so("greek-yogurt-vanilla-32oz", "Costco", 899, "2 × 32 oz", "alternative"),
  so("lemonade-59oz", "WinCo Foods", 299, "59 oz"),
  so("tortilla-chips-13oz", "Safeway", 449, "13 oz"),
  so("greek-yogurt-vanilla-32oz", "Trader Joe's", 499, "32 oz"),
  so("greek-yogurt-vanilla-32oz", "Amazon", 629, "32 oz"),
  so("lemonade-59oz", "Safeway", 379, "59 oz"),
  so("lemonade-59oz", "Costco", 599, "2 × 59 oz", "alternative"),
  so("lemonade-59oz", "Temu", 199, "59 oz"),
  so("lemonade-59oz", "Amazon", 329, "59 oz"),
  so("tortilla-chips-13oz", "WinCo Foods", 349, "13 oz"),
  so("tortilla-chips-13oz", "Trader Joe's", 299, "13 oz"),
  so("tortilla-chips-13oz", "Amazon", 399, "13 oz"),
  so("fettuccine-16oz", "WinCo Foods", 128, "16 oz"),
  so("fettuccine-16oz", "Trader Joe's", 149, "16 oz"),
  so("fettuccine-16oz", "Amazon", 219, "16 oz"),
  so("heavy-cream-16oz", "WinCo Foods", 329, "16 oz"),
  so("heavy-cream-16oz", "Safeway", 429, "16 oz"),
  so("heavy-cream-16oz", "Trader Joe's", 349, "16 oz"),
  so("parmesan-8oz", "Trader Joe's", 449, "8 oz"),
  so("parmesan-8oz", "WinCo Foods", 499, "8 oz"),
  so("parmesan-8oz", "Costco", 1299, "24 oz", "alternative"),
  so("parmesan-8oz", "Amazon", 579, "8 oz"),
  so("butter-16oz", "WinCo Foods", 399, "16 oz"),
  so("butter-16oz", "Trader Joe's", 449, "16 oz"),
  so("butter-16oz", "Costco", 1399, "4 × 16 oz", "alternative"),
  so("whole-milk-gal", "WinCo Foods", 329, "1 gal"),
  so("whole-milk-gal", "Costco", 319, "1 gal"),
  so("whole-milk-gal", "Safeway", 419, "1 gal"),
  so("lemonade-zero-59oz", "WinCo Foods", 329, "59 oz"),
  so("lemonade-zero-59oz", "Safeway", 399, "59 oz"),
  so("lemonade-zero-59oz", "Amazon", 349, "59 oz"),
  so("potato-chips-8oz", "WinCo Foods", 299, "8 oz"),
  so("potato-chips-8oz", "Safeway", 449, "8 oz"),
  so("potato-chips-8oz", "Amazon", 349, "8 oz"),
  so("chicken-breast-1lb", "WinCo Foods", 449, "1 lb"),
  so("chicken-breast-1lb", "Trader Joe's", 549, "1 lb"),
  so("chicken-breast-1lb", "Safeway", 699, "1 lb"),
  so("chicken-breast-1lb", "Costco", 2394, "6 lb pack", "alternative"),
  so("cheddar-8oz", "WinCo Foods", 279, "8 oz"),
  so("cheddar-8oz", "Trader Joe's", 299, "8 oz"),
  so("cheddar-8oz", "Amazon", 369, "8 oz"),
  so("wheat-bread-20oz", "WinCo Foods", 229, "20 oz"),
  so("wheat-bread-20oz", "Trader Joe's", 299, "20 oz"),
  so("wheat-bread-20oz", "Safeway", 379, "20 oz"),
  so("eggs-12ct", "WinCo Foods", 349, "12 ct"),
  so("eggs-12ct", "Trader Joe's", 399, "12 ct"),
  so("eggs-12ct", "Costco", 799, "24 ct", "alternative"),
  so("bananas-lb", "WinCo Foods", 54, "per lb"),
  so("bananas-lb", "Safeway", 79, "per lb"),
  so("peanut-butter-16oz", "WinCo Foods", 249, "16 oz"),
  so("peanut-butter-16oz", "Safeway", 369, "16 oz"),
  so("peanut-butter-16oz", "Amazon", 229, "16 oz"),
  so("garlic-head", "WinCo Foods", 50, "1 head"),
  so("garlic-head", "Trader Joe's", 69, "1 head"),
  so("sparkling-water-12pk", "WinCo Foods", 499, "12 × 12 oz"),
  so("sparkling-water-12pk", "Safeway", 649, "12 × 12 oz"),
  so("sparkling-water-12pk", "Costco", 1499, "35 × 12 oz", "alternative"),
  so("sparkling-water-12pk", "Amazon", 449, "12 × 12 oz"),
  so("oat-cereal-18oz", "WinCo Foods", 399, "18 oz"),
  so("oat-cereal-18oz", "Safeway", 529, "18 oz"),
  so("oat-cereal-18oz", "Amazon", 379, "18 oz"),
  so("spaghetti-16oz", "WinCo Foods", 118, "16 oz"),
  so("spaghetti-16oz", "Trader Joe's", 99, "16 oz"),
  so("spaghetti-16oz", "Amazon", 189, "16 oz"),
];

export const ONLINE_RETAILERS = new Set(["Amazon", "Temu"]);

const nu = (productId: string, serving: string, kcal: number, protein: number, carbs: number, sugar: number, fat: number, sodium: number, allergens: Nutrition["allergens"]): Nutrition =>
  ({ productId, serving, kcal, protein, carbs, sugar, fat, sodium, allergens });

export const NUTRITION: Nutrition[] = [
  nu("greek-yogurt-vanilla-32oz", "2/3 cup (170 g)", 150, 13, 18, 15, 3, 60, ["dairy"]),
  nu("lemonade-59oz", "8 fl oz", 110, 0, 28, 27, 0, 15, []),
  nu("tortilla-chips-13oz", "1 oz (about 9 chips)", 140, 2, 18, 0, 7, 115, []),
  nu("fettuccine-16oz", "2 oz dry", 200, 7, 42, 2, 1, 0, ["gluten"]),
  nu("heavy-cream-16oz", "1 tbsp", 50, 0, 0, 0, 5, 5, ["dairy"]),
  nu("parmesan-8oz", "2 tsp (5 g)", 20, 2, 0, 0, 1.5, 85, ["dairy"]),
  nu("butter-16oz", "1 tbsp", 100, 0, 0, 0, 11, 0, ["dairy"]),
  nu("whole-milk-gal", "1 cup", 150, 8, 12, 12, 8, 105, ["dairy"]),
  nu("lemonade-zero-59oz", "8 fl oz", 5, 0, 1, 0, 0, 15, []),
  nu("potato-chips-8oz", "1 oz", 160, 2, 15, 0, 10, 170, []),
  nu("chicken-breast-1lb", "4 oz", 120, 26, 0, 0, 1.5, 70, []),
  nu("cheddar-8oz", "1 oz", 110, 7, 0, 0, 9, 180, ["dairy"]),
  nu("wheat-bread-20oz", "1 slice (43 g)", 110, 5, 20, 3, 1.5, 170, ["gluten"]),
  nu("eggs-12ct", "1 large egg", 70, 6, 0, 0, 5, 70, ["egg"]),
  nu("bananas-lb", "1 medium (118 g)", 105, 1.3, 27, 14, 0.4, 1, []),
  nu("peanut-butter-16oz", "2 tbsp (32 g)", 190, 7, 7, 3, 16, 140, ["peanut"]),
  nu("garlic-head", "1 clove (3 g)", 4, 0.2, 1, 0, 0, 1, []),
  nu("sparkling-water-12pk", "12 fl oz", 0, 0, 0, 0, 0, 0, []),
  nu("oat-cereal-18oz", "1⅓ cup (39 g)", 140, 5, 29, 1, 2.5, 190, ["gluten"]),
  nu("spaghetti-16oz", "2 oz dry", 200, 7, 42, 2, 1, 0, ["gluten"]),
];

export const NUTRITION_BY_ID: Record<string, Nutrition> = Object.fromEntries(NUTRITION.map((n) => [n.productId, n]));

/** (this month before this trip, last month) */
export const PURCHASE_HISTORY: Record<string, { thisMonth: number; lastMonth: number; lastMonthUnitCents: number }> = {
  "lemonade-59oz": { thisMonth: 2, lastMonth: 8, lastMonthUnitCents: 349 },
  "potato-chips-8oz": { thisMonth: 2, lastMonth: 6, lastMonthUnitCents: 399 },
  "sparkling-water-12pk": { thisMonth: 1, lastMonth: 4, lastMonthUnitCents: 599 },
  "greek-yogurt-vanilla-32oz": { thisMonth: 1, lastMonth: 3, lastMonthUnitCents: 549 },
};

export const HEALTHIER_SWAPS: Record<string, { productId: string; reason: string }> = {
  "lemonade-59oz": { productId: "lemonade-zero-59oz", reason: "no added sugar" },
};

export const PRIOR_MONTH_CATEGORY_CENTS: Record<string, number> = {
  Produce: 4120, Dairy: 6380, Meat: 5590, Bakery: 1290, Pantry: 4460, Snacks: 2870, Beverages: 4950, Other: 2210,
};
export const LAST_MONTH_TOTAL_CENTS = 61240;

const loc = (productId: string, aisle: number, section: string, side: "left" | "right"): AisleLocation => ({ productId, aisle, section, side });
export const AISLES: AisleLocation[] = [
  loc("bananas-lb", 1, "Produce", "right"),
  loc("garlic-head", 1, "Produce", "left"),
  loc("wheat-bread-20oz", 3, "Bakery", "left"),
  loc("oat-cereal-18oz", 4, "Cereal", "right"),
  loc("peanut-butter-16oz", 4, "Spreads", "left"),
  loc("fettuccine-16oz", 5, "Pasta & sauce", "right"),
  loc("spaghetti-16oz", 5, "Pasta & sauce", "right"),
  loc("tortilla-chips-13oz", 7, "Chips", "left"),
  loc("potato-chips-8oz", 7, "Chips", "left"),
  loc("lemonade-59oz", 8, "Juice", "right"),
  loc("lemonade-zero-59oz", 8, "Juice", "right"),
  loc("sparkling-water-12pk", 8, "Water", "left"),
  loc("chicken-breast-1lb", 10, "Meat", "left"),
  loc("greek-yogurt-vanilla-32oz", 11, "Dairy", "right"),
  loc("whole-milk-gal", 11, "Dairy", "right"),
  loc("heavy-cream-16oz", 11, "Dairy", "right"),
  loc("butter-16oz", 11, "Dairy", "left"),
  loc("eggs-12ct", 11, "Dairy", "left"),
  loc("cheddar-8oz", 12, "Cheese", "right"),
  loc("parmesan-8oz", 12, "Cheese", "right"),
];
export const AISLE_BY_ID: Record<string, AisleLocation> = Object.fromEntries(AISLES.map((a) => [a.productId, a]));

export const STORES: Store[] = [
  { id: "store-safeway", name: "Safeway", address: "1423 NE 45th St, Seattle", lat: 47.6612, lng: -122.3127 },
  { id: "store-tj", name: "Trader Joe's", address: "4555 Roosevelt Way NE, Seattle", lat: 47.6625, lng: -122.3176 },
  { id: "store-wholefoods", name: "Whole Foods Market", address: "1026 NE 64th St, Seattle", lat: 47.6754, lng: -122.3172 },
  { id: "store-winco", name: "WinCo Foods", address: "22511 Highway 99, Edmonds", lat: 47.7955, lng: -122.3297 },
  { id: "store-costco", name: "Costco", address: "4401 4th Ave S, Seattle", lat: 47.5636, lng: -122.3283 },
  { id: "store-qfc", name: "QFC", address: "2746 NE 45th St, Seattle", lat: 47.6627, lng: -122.2993 },
];

export const DEMO_LOCATION = { label: "U District, Seattle", lat: 47.6553, lng: -122.3035 };

/** Exactly eleven scripted sample observations (section 8 / Appendix A). */
export const SAMPLE_GROCERY_PLAYBACK: { observations: GroceryObservation[]; scene: "aisle" | "cart" | "juice"; caption: string }[] = [
  { scene: "aisle", caption: "Yogurt on the shelf · scripted fixture", observations: [{ productKey: "greek-yogurt-vanilla-32oz", label: "Greek yogurt, vanilla", state: "on_shelf", confidence: 0.8, packageSize: "32 oz", priceCents: null }] },
  { scene: "aisle", caption: "Yogurt picked up · scripted fixture", observations: [{ productKey: "greek-yogurt-vanilla-32oz", label: "Greek yogurt, vanilla", state: "held", confidence: 0.92, packageSize: "32 oz", priceCents: null }] },
  { scene: "aisle", caption: "Still holding the yogurt · scripted fixture", observations: [{ productKey: "greek-yogurt-vanilla-32oz", label: "Greek yogurt, vanilla", state: "held", confidence: 0.9, packageSize: "32 oz", priceCents: null }] },
  { scene: "cart", caption: "Placing yogurt in the cart · scripted fixture", observations: [{ productKey: "greek-yogurt-vanilla-32oz", label: "Greek yogurt, vanilla", state: "placing", confidence: 0.8, packageSize: "32 oz", priceCents: null }] },
  { scene: "cart", caption: "Yogurt in the cart · scripted fixture", observations: [{ productKey: "greek-yogurt-vanilla-32oz", label: "Greek yogurt, vanilla", state: "in_cart", confidence: 0.9, packageSize: "32 oz", priceCents: null }] },
  { scene: "cart", caption: "Same yogurt, same unit · must not add again", observations: [{ productKey: "greek-yogurt-vanilla-32oz", label: "Greek yogurt, vanilla", state: "in_cart", confidence: 0.9, packageSize: "32 oz", priceCents: null }] },
  { scene: "cart", caption: "Same yogurt, same unit · must not add again", observations: [{ productKey: "greek-yogurt-vanilla-32oz", label: "Greek yogurt, vanilla", state: "in_cart", confidence: 0.88, packageSize: "32 oz", priceCents: null }] },
  { scene: "juice", caption: "Lemonade picked up · scripted fixture", observations: [{ productKey: "lemonade-59oz", label: "Lemonade", state: "held", confidence: 0.9, packageSize: "59 oz", priceCents: null }] },
  { scene: "juice", caption: "Still holding lemonade · nudge shown once", observations: [{ productKey: "lemonade-59oz", label: "Lemonade", state: "held", confidence: 0.9, packageSize: "59 oz", priceCents: null }] },
  { scene: "juice", caption: "Lemonade returned to the shelf · nothing added", observations: [] },
  { scene: "juice", caption: "Sparkling water 12-pack picked up · Amazon is cheaper in the sample", observations: [{ productKey: "sparkling-water-12pk", label: "Sparkling water, lime", state: "held", confidence: 0.9, packageSize: "12 × 12 oz", priceCents: null }] },
];
