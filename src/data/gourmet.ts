import type { DishHypothesis, Recipe } from "./types";

export const SAMPLE_DISH_HYPOTHESES: DishHypothesis[] = [
  { name: "Fettuccine Alfredo", confidence: 0.74, cues: ["ribbon pasta", "white cream sauce", "red pieces (tomato or shrimp)"] },
  { name: "Pasta in vodka cream sauce", confidence: 0.14, cues: ["cream sauce", "red pieces"] },
  { name: "Shrimp linguine", confidence: 0.08, cues: ["long pasta", "red pieces"] },
];

export const SAMPLE_RECIPES: Record<string, Recipe[]> = {
  "fettuccine alfredo": [
    {
      id: "alfredo-classic",
      title: "Classic fettuccine Alfredo",
      minutes: 25,
      servings: 4,
      source: "sample",
      ingredients: [
        { name: "Fettuccine", quantity: 16, unit: "oz" },
        { name: "Butter", quantity: 4, unit: "tbsp" },
        { name: "Heavy cream", quantity: 1, unit: "cup" },
        { name: "Parmesan, grated", quantity: 1.5, unit: "cup" },
        { name: "Garlic", quantity: 2, unit: "clove" },
        { name: "Salt", quantity: null, unit: null },
      ],
      steps: [
        "Boil the fettuccine in salted water until al dente. Save ½ cup pasta water.",
        "Melt the butter in a wide pan over medium heat; add the garlic for 1 minute.",
        "Stir in the cream and simmer gently for 3–4 minutes.",
        "Off the heat, whisk in the parmesan until smooth.",
        "Toss the pasta in the sauce, loosening with pasta water. Season and serve.",
      ],
    },
    {
      id: "alfredo-chicken",
      title: "Chicken Alfredo",
      minutes: 35,
      servings: 4,
      source: "sample",
      ingredients: [
        { name: "Fettuccine", quantity: 12, unit: "oz" },
        { name: "Chicken breast", quantity: 1, unit: "lb" },
        { name: "Butter", quantity: 3, unit: "tbsp" },
        { name: "Heavy cream", quantity: 1.5, unit: "cup" },
        { name: "Parmesan, grated", quantity: 1, unit: "cup" },
        { name: "Garlic", quantity: 3, unit: "clove" },
      ],
      steps: [
        "Season and sear the chicken 6–7 minutes per side; rest, then slice.",
        "Cook the fettuccine until al dente.",
        "Melt the butter, add garlic, then the cream; simmer 4 minutes.",
        "Whisk in the parmesan off the heat.",
        "Toss pasta and sauce, top with the chicken.",
      ],
    },
    {
      id: "alfredo-shrimp-tomato",
      title: "Shrimp & tomato Alfredo",
      minutes: 30,
      servings: 3,
      source: "sample",
      ingredients: [
        { name: "Fettuccine", quantity: 10, unit: "oz" },
        { name: "Shrimp, peeled", quantity: 12, unit: "oz" },
        { name: "Cherry tomatoes", quantity: 1, unit: "cup" },
        { name: "Butter", quantity: 2, unit: "tbsp" },
        { name: "Heavy cream", quantity: 1, unit: "cup" },
        { name: "Parmesan, grated", quantity: 0.75, unit: "cup" },
      ],
      steps: [
        "Cook the fettuccine until al dente.",
        "Sauté the shrimp in butter 2 minutes per side; set aside.",
        "Soften the tomatoes in the same pan, then add the cream and simmer 3 minutes.",
        "Whisk in the parmesan off the heat; return the shrimp.",
        "Toss with the pasta and serve.",
      ],
    },
  ],
};

export function sampleRecipesFor(dish: string): Recipe[] {
  return SAMPLE_RECIPES[dish.trim().toLowerCase()] ?? [];
}
