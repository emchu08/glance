import type { Amount, Ingredient, Recipe, ShoppingListItem } from "@/data/types";

const PREP_WORDS = new Set([
  "fresh", "freshly", "grated", "shredded", "minced", "chopped", "large", "small", "unsalted", "salted", "boneless", "skinless",
]);

const PLURALS: Record<string, string> = {
  tomatoes: "tomato", potatoes: "potato", cloves: "clove", eggs: "egg", onions: "onion", leaves: "leaf",
  berries: "berry", peppers: "pepper", shrimps: "shrimp", noodles: "noodle", breasts: "breast",
};

function singular(word: string): string {
  if (PLURALS[word]) return PLURALS[word];
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Normalize ingredient name to a merge key (readable name is kept separately). */
export function normalizeIngredientKey(name: string): string {
  let s = name.toLowerCase();
  s = s.replace(/\(.*?\)/g, " ");
  s = s.split(",")[0];
  s = s.replace(/[^a-z\s]/g, " ");
  const words = s.split(/\s+/).filter((w) => w && !PREP_WORDS.has(w)).map(singular);
  return words.join(" ").trim();
}

const UNIT_ALIASES: Record<string, string> = {
  gram: "g", grams: "g", g: "g",
  kilogram: "kg", kilograms: "kg", kg: "kg",
  ounce: "oz", ounces: "oz", oz: "oz",
  pound: "lb", pounds: "lb", lb: "lb", lbs: "lb",
  milliliter: "ml", milliliters: "ml", ml: "ml",
  liter: "l", liters: "l", litre: "l", l: "l",
  teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp",
  tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp", tbs: "tbsp",
  cup: "cup", cups: "cup",
  "fl oz": "fl oz", pint: "pint", pints: "pint", quart: "quart", quarts: "quart",
};

export function normalizeUnit(unit: string | null): string | null {
  if (!unit) return null;
  const u = unit.trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[u] ?? u;
}

const MASS_G: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const VOL_ML: Record<string, number> = { ml: 1, l: 1000, tsp: 4.92892, tbsp: 14.7868, cup: 236.588, "fl oz": 29.5735, pint: 473.176, quart: 946.353 };

type Family = { kind: "mass" | "volume" | "count"; unit: string | null };
function familyOf(unit: string | null): Family {
  if (unit && unit in MASS_G) return { kind: "mass", unit };
  if (unit && unit in VOL_ML) return { kind: "volume", unit };
  return { kind: "count", unit };
}

function compatible(a: string | null, b: string | null): boolean {
  const fa = familyOf(a);
  const fb = familyOf(b);
  if (fa.kind !== fb.kind) return false;
  if (fa.kind === "count") return (a ?? null) === (b ?? null);
  return true;
}

/** Convert `qty` from unit `from` to unit `to` within the same mass/volume family. */
function convert(qty: number, from: string, to: string): number {
  if (from in MASS_G && to in MASS_G) return (qty * MASS_G[from]) / MASS_G[to];
  if (from in VOL_ML && to in VOL_ML) return (qty * VOL_ML[from]) / VOL_ML[to];
  return qty;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Merge a new amount into existing amounts; keeps displayed unit; unknown + anything = unknown. */
export function mergeAmount(amounts: Amount[], incoming: Amount): Amount[] {
  const unit = normalizeUnit(incoming.unit);
  const idx = amounts.findIndex((a) => compatible(a.unit, unit));
  if (idx < 0) return [...amounts, { quantity: incoming.quantity === null ? null : round2(incoming.quantity), unit }];
  const existing = amounts[idx];
  let quantity: number | null;
  if (existing.quantity === null || incoming.quantity === null) quantity = null;
  else if (existing.unit && unit && existing.unit !== unit) quantity = round2(existing.quantity + convert(incoming.quantity, unit, existing.unit));
  else quantity = round2(existing.quantity + incoming.quantity);
  return amounts.map((a, i) => (i === idx ? { quantity, unit: existing.unit } : a));
}

export function formatAmount(a: Amount): string {
  if (a.quantity === null) return a.unit ? `some ${a.unit}` : "some";
  const q = Number.isInteger(a.quantity) ? String(a.quantity) : String(round2(a.quantity));
  return a.unit ? `${q} ${a.unit}` : q;
}

export function formatAmounts(amounts: Amount[]): string {
  return amounts.map(formatAmount).join(" + ");
}

export function scaleIngredients(ingredients: Ingredient[], baseServings: number, requested: number): Ingredient[] {
  if (!(requested > 0) || !(baseServings > 0) || !Number.isFinite(requested)) return ingredients;
  const f = requested / baseServings;
  return ingredients.map((i) => ({ ...i, quantity: i.quantity === null ? null : round2(i.quantity * f) }));
}

/** Signature of a selection used to prevent unchanged repeated additions. */
export function additionSignature(recipeId: string, ingredients: Ingredient[]): string {
  return `${recipeId}|${ingredients.map((i) => `${normalizeIngredientKey(i.name)}:${i.quantity ?? "null"}:${normalizeUnit(i.unit) ?? ""}`).sort().join(",")}`;
}

export function addIngredientsToList(list: ShoppingListItem[], recipe: Recipe, ingredients: Ingredient[]): ShoppingListItem[] {
  let next = [...list];
  for (const ing of ingredients) {
    const key = normalizeIngredientKey(ing.name);
    if (!key) continue;
    const idx = next.findIndex((i) => i.key === key);
    if (idx >= 0) {
      const item = next[idx];
      next = next.map((it, i) =>
        i === idx
          ? {
              ...it,
              amounts: mergeAmount(it.amounts, { quantity: ing.quantity, unit: ing.unit }),
              recipes: it.recipes.includes(recipe.title) ? it.recipes : [...it.recipes, recipe.title],
              done: false,
            }
          : it,
      );
    } else {
      next.push({
        key,
        name: ing.name.split(",")[0].trim(),
        amounts: [{ quantity: ing.quantity === null ? null : round2(ing.quantity), unit: normalizeUnit(ing.unit) }],
        recipes: [recipe.title],
        done: false,
      });
    }
  }
  return next;
}

/** Paginate steps so each page fits the lens without dropping words. */
export function paginateSteps(steps: string[], maxCharsPerPage = 150): string[][] {
  const pages: string[][] = [];
  let page: string[] = [];
  let chars = 0;
  const pushPage = () => { if (page.length) { pages.push(page); page = []; chars = 0; } };
  for (const step of steps) {
    const chunks = splitLong(step, maxCharsPerPage);
    for (const chunk of chunks) {
      if (chars + chunk.length > maxCharsPerPage && page.length) pushPage();
      page.push(chunk);
      chars += chunk.length;
    }
  }
  pushPage();
  return pages.length ? pages : [[]];
}

function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const words = text.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) { out.push(cur.trim() + " …"); cur = "… " + w; } else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur.trim());
  return out;
}
