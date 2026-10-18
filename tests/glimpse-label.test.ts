import { test } from "node:test";
import assert from "node:assert/strict";
import { specificLabel } from "../src/domain/glimpse/label.ts";

test("a specific product name is used as is", () => {
  assert.equal(specificLabel({ object_type: "energy drink can", brand: "Celsius", product_name: "Celsius Sparkling Orange Energy Drink" }), "Celsius Sparkling Orange Energy Drink");
  assert.equal(specificLabel({ object_type: "sweater", brand: "", product_name: "charcoal cable-knit crew neck sweater" }), "Charcoal cable-knit crew neck sweater");
});

test("a bare category is never the label: it is rebuilt from what was seen", () => {
  assert.equal(specificLabel({ object_type: "sweater", brand: "", product_name: "Sweater", color: "heather gray", material: "cable-knit wool", style: "crew neck" }), "Heather gray cable-knit wool crew neck sweater");
  assert.equal(specificLabel({ object_type: "jacket", brand: "", product_name: "", color: "olive", material: "quilted nylon", style: "hooded puffer" }), "Olive quilted nylon hooded puffer jacket");
  assert.equal(specificLabel({ object_type: "jacket", brand: "", product_name: "jacket", color: "black" }), "Black jacket", "at least the color");
});

test("brand comes first and no word is said twice", () => {
  assert.equal(specificLabel({ object_type: "fleece jacket", brand: "Patagonia", product_name: "", color: "navy", material: "fleece", style: "" }), "Patagonia navy fleece jacket");
  assert.equal(specificLabel({ object_type: "backpack", brand: "", product_name: "", color: "black", material: "", style: "" }), "Black backpack");
});
