// Standalone 3D site data: fictional brands, sample prices, simulated recognition.

export type Category = "Drinks" | "Dairy & alternatives" | "Pantry" | "Produce";

export interface Product {
  id: string; name: string; brand: string; thisStore: number; nearby: number; online: number; size: string; sugar: number; calories: number; aisle: number;
  category: Category; dairy: "dairy" | "plant" | "none"; packaging: "bottle" | "carton" | "box" | "bag" | "punnet" | "bunch"; color: string; ink: string;
}

export const PRODUCTS: Product[] = [
  { id: "lemon", name: "Cloudy lemonade", brand: "DAYBREAK", thisStore: 4.5, nearby: 3.95, online: 4.25, size: "500ml", sugar: 22, calories: 110, aisle: 4, category: "Drinks", dairy: "none", packaging: "bottle", color: "#f6d85a", ink: "#2a2a2a" },
  { id: "oat", name: "Original oat milk", brand: "OAT SIDE", thisStore: 3.8, nearby: 4.2, online: 3.65, size: "1 liter", sugar: 4, calories: 120, aisle: 6, category: "Dairy & alternatives", dairy: "plant", packaging: "carton", color: "#e9e3d2", ink: "#2d4a3a" },
  { id: "cereal", name: "Honey oat cereal", brand: "GOOD MORNING", thisStore: 5.2, nearby: 5.6, online: 4.9, size: "350g", sugar: 9, calories: 160, aisle: 8, category: "Pantry", dairy: "none", packaging: "box", color: "#e3a648", ink: "#3a2410" },
  { id: "zero", name: "Zero-sugar lemonade", brand: "DAYBREAK", thisStore: 4.75, nearby: 4.4, online: 4.6, size: "500ml", sugar: 0, calories: 5, aisle: 4, category: "Drinks", dairy: "none", packaging: "bottle", color: "#dfe9ee", ink: "#1f3b4d" },
  { id: "milk", name: "Whole dairy milk", brand: "DAILY", thisStore: 3.5, nearby: 3.7, online: 3.9, size: "1 liter", sugar: 12, calories: 150, aisle: 6, category: "Dairy & alternatives", dairy: "dairy", packaging: "carton", color: "#f4f4f6", ink: "#1f4fa3" },
  { id: "plain", name: "Unsweetened oat cereal", brand: "GOOD MORNING", thisStore: 5.1, nearby: 5.3, online: 5.45, size: "350g", sugar: 0, calories: 140, aisle: 8, category: "Pantry", dairy: "none", packaging: "box", color: "#c9b58c", ink: "#3a2410" },
  { id: "pasta", name: "Rigatoni", brand: "CASA PASTA", thisStore: 2.8, nearby: 3.2, online: 2.95, size: "500g", sugar: 2, calories: 180, aisle: 8, category: "Pantry", dairy: "none", packaging: "bag", color: "#2f5fb3", ink: "#f3e2b8" },
  { id: "tomatoes", name: "Cherry tomatoes", brand: "GARDEN", thisStore: 3.2, nearby: 3.6, online: 3.5, size: "300g", sugar: 4, calories: 27, aisle: 2, category: "Produce", dairy: "none", packaging: "punnet", color: "#d2432c", ink: "#ffffff" },
  { id: "basil", name: "Fresh basil", brand: "GARDEN", thisStore: 1.8, nearby: 2.0, online: 2.2, size: "1 bunch", sugar: 0, calories: 5, aisle: 2, category: "Produce", dairy: "none", packaging: "bunch", color: "#547340", ink: "#ffffff" },
];
export const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p])) as Record<string, Product>;

/** Lower-sugar / dairy-free alternatives (only when actually lower). */
export const ALTERNATIVES: Record<string, string> = { lemon: "zero", cereal: "plain", milk: "oat" };

export interface JacketStyle { id: string; name: string; brand: string; price: number; store: string; color: string; fit: string; why: string; swatch: string }
export const JACKETS: JacketStyle[] = [
  { id: "field", name: "Everyday field jacket", brand: "NORTH & COMMON", price: 89, store: "Common Goods", color: "Moss green", fit: "Cotton twill relaxed fit", why: "Closest silhouette", swatch: "#707652" },
  { id: "utility", name: "Canvas utility jacket", brand: "FORM STUDIO", price: 115, store: "Form Studio", color: "Olive", fit: "Organic cotton boxy fit", why: "Similar pockets & color", swatch: "#6b7049" },
  { id: "chore", name: "Weekend chore coat", brand: "OFF HOURS", price: 74, store: "Off Hours", color: "Sage", fit: "Cotton canvas regular fit", why: "Similar everyday style", swatch: "#8b957a" },
];
export const EVERYDAY_SELECT_MARKUP = 12;

export const MEAL = {
  title: "Looks like creamy tomato rigatoni.",
  minutes: 25, servings: 2, diet: "Vegetarian",
  steps: [
    "Boil the rigatoni in salted water until just tender; keep a cup of the water.",
    "Blister the cherry tomatoes in olive oil with garlic until they split.",
    "Stir in the milk and a splash of pasta water; simmer to a creamy sauce.",
    "Toss with the pasta, season, and finish with torn basil.",
  ],
  ingredients: [
    { productId: "pasta", label: "250g rigatoni", quantity: 1 },
    { productId: "tomatoes", label: "300g cherry tomatoes", quantity: 1 },
    { productId: "milk", label: "150ml whole milk", quantity: 1 },
    { productId: "basil", label: "1 small bunch basil", quantity: 1 },
  ],
  pantry: "Pantry staples: olive oil, garlic, salt, pepper.",
  warning: "Contains wheat and milk. Swap the milk for oat milk if you prefer dairy-free.",
  limits: "A suggested interpretation from the visible dish; hidden ingredients can’t be confirmed from the image.",
};

export const SCENARIOS = [
  { id: "jacket", eyebrow: "01 / THE EVERYDAY, RECONSIDERED", title: "Good taste. At first sight.", tile: "Discover a jacket", blurb: "Spot a jacket on the street and see possible matches by shape, color and details, with exact identity left honest." },
  { id: "meal", eyebrow: "02 / AROUND THE TABLE", title: "A little dinner inspiration.", tile: "Recreate a meal", blurb: "Look at a plate, get a suggested recipe, and send its ingredients to one shared shopping list." },
  { id: "grocery", eyebrow: "03 / MARKET STREET", title: "Find your everyday good.", tile: "Shop smarter", blurb: "Compare prices, read nutrition, pick a better alternative and follow floor arrows to the next item." },
] as const;
export type ScenarioId = (typeof SCENARIOS)[number]["id"];

export const ROUTE_Z = (aisle: number) => (aisle <= 4 ? 1.5 : aisle <= 6 ? -2.2 : -5.4);

/** 58-second guided walkthrough; each event dispatches the same reducer action a visitor would. */
export const WALKTHROUGH: { t: number; action: string; caption: string }[] = [
  { t: 0, action: "scene:jacket", caption: "A jacket catches your eye on the street." },
  { t: 3, action: "jacket:select", caption: "Glance looks at shape, color and details — not who’s wearing it." },
  { t: 7, action: "jacket:next", caption: "Swipe through possible matches." },
  { t: 10, action: "jacket:save", caption: "Save it for later with a pinch." },
  { t: 13, action: "scene:meal", caption: "Dinner with friends." },
  { t: 16, action: "meal:select", caption: "Looks like creamy tomato rigatoni." },
  { t: 20, action: "meal:recipe", caption: "A suggested recipe, with honest limits." },
  { t: 24, action: "meal:ingredients", caption: "Four ingredients and a dairy-free swap." },
  { t: 27, action: "meal:add", caption: "Added to your shared list." },
  { t: 30, action: "scene:grocery", caption: "At the market." },
  { t: 33, action: "grocery:select:lemon", caption: "Pick up the lemonade." },
  { t: 37, action: "grocery:tab:nutrition", caption: "22g sugar per bottle." },
  { t: 39, action: "grocery:add", caption: "Into the cart." },
  { t: 42, action: "grocery:select:milk", caption: "Now the milk." },
  { t: 44, action: "grocery:pref:dairy-free", caption: "Prefer dairy-free?" },
  { t: 46, action: "grocery:choose:oat", caption: "Oat milk instead." },
  { t: 48, action: "grocery:navigate", caption: "Floor arrows to the next item." },
  { t: 53, action: "grocery:add", caption: "Oat milk, added." },
  { t: 56, action: "finish", caption: "A good little haul." },
  { t: 58, action: "complete", caption: "Less looking down. More discovering." },
];
