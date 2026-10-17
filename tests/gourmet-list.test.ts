import { test } from "node:test";
import assert from "node:assert/strict";
import { addIngredientsToList, additionSignature, formatAmounts, mergeAmount, normalizeIngredientKey, normalizeUnit, paginateSteps, scaleIngredients } from "../src/domain/gourmet/list.ts";
import { SAMPLE_RECIPES } from "../src/data/gourmet.ts";

test("ingredient normalization strips prep words and plurals without merging distinct foods", () => {
  assert.equal(normalizeIngredientKey("Parmesan, grated"), "parmesan");
  assert.equal(normalizeIngredientKey("Cherry tomatoes (ripe)"), "cherry tomato");
  assert.equal(normalizeIngredientKey("Unsalted butter"), "butter");
  assert.notEqual(normalizeIngredientKey("Peanut butter"), normalizeIngredientKey("Butter"));
  assert.notEqual(normalizeIngredientKey("Tomatoes"), normalizeIngredientKey("Tomato paste"));
  assert.equal(normalizeUnit("Tbsp."), "tbsp");
  assert.equal(normalizeUnit("cups"), "cup");
});

test("merging keeps displayed unit, converts within family, keeps incompatible side by side, null stays unknown", () => {
  let a = mergeAmount([{ quantity: 1, unit: "cup" }], { quantity: 4, unit: "tbsp" });
  assert.deepEqual(a, [{ quantity: 1.25, unit: "cup" }]);
  a = mergeAmount(a, { quantity: 1, unit: "block" });
  assert.equal(formatAmounts(a), "1.25 cup + 1 block");
  a = mergeAmount(a, { quantity: null, unit: "cup" });
  assert.equal(formatAmounts(a), "some cup + 1 block");
  assert.equal(formatAmounts([{ quantity: null, unit: null }]), "some");
});

test("scaling respects base servings and rejects invalid requests; signature blocks unchanged re-adds", () => {
  const r = SAMPLE_RECIPES["fettuccine alfredo"][0];
  const scaled = scaleIngredients(r.ingredients, r.servings, 2);
  assert.equal(scaled[0].quantity, 8);
  assert.equal(scaled[5].quantity, null);
  assert.deepEqual(scaleIngredients(r.ingredients, r.servings, 0), r.ingredients);
  const sig1 = additionSignature(r.id, scaled);
  const sig2 = additionSignature(r.id, scaleIngredients(r.ingredients, r.servings, 2));
  const sig3 = additionSignature(r.id, scaleIngredients(r.ingredients, r.servings, 3));
  assert.equal(sig1, sig2);
  assert.notEqual(sig1, sig3);
});

test("adding two recipes merges by key, retains recipe titles, and steps paginate without losing words", () => {
  const [classic, chicken] = SAMPLE_RECIPES["fettuccine alfredo"];
  let list = addIngredientsToList([], classic, classic.ingredients);
  list = addIngredientsToList(list, chicken, chicken.ingredients);
  const fett = list.find((i) => i.key === "fettuccine")!;
  assert.equal(fett.amounts[0].quantity, 28);
  assert.deepEqual(fett.recipes, [classic.title, chicken.title]);
  const pages = paginateSteps(classic.steps, 120);
  assert.equal(pages.flat().filter((s) => !s.startsWith("…")).length >= classic.steps.length, true);
  const words = classic.steps.join(" ").replace(/\s+/g, " ");
  const rejoined = pages.flat().join(" ").replace(/ …|… /g, " ").replace(/\s+/g, " ");
  for (const w of words.split(" ")) assert.ok(rejoined.includes(w), `missing word ${w}`);
});
