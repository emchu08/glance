import { z } from "zod";
import type { Recipe, ShoppingListItem } from "@/data/types";
import type { SavedOffer } from "./types";

/**
 * Only saved offers, saved recipes, and the shared shopping list persist (`glance.v1`).
 * The exploratory physical cart, raw frames, and payment flags never persist here.
 */
export const STORAGE_KEY = "glance.v1";
export const PAIR_KEY = "glance.pair.v1";
/** The phone's long-lived code, remembered by the glasses web app from its launch URL. */
export const PHONE_CODE_KEY = "glance.phoneCode.v1";
export const CAMERA_KEY = "glance.camera.v1";

const amount = z.object({ quantity: z.number().nullable(), unit: z.string().nullable() });
const listItem = z.object({ key: z.string(), name: z.string(), amounts: z.array(amount), recipes: z.array(z.string()), done: z.boolean() });
const ingredient = z.object({ name: z.string(), quantity: z.number().nullable(), unit: z.string().nullable() });
const recipe = z.object({
  id: z.string(), title: z.string(), minutes: z.number(), servings: z.number(),
  ingredients: z.array(ingredient), steps: z.array(z.string()), source: z.enum(["sample", "generated"]),
});
const offer = z.object({
  id: z.string(), candidateId: z.string().optional(), query: z.string().optional(), name: z.string(), retailer: z.string(), url: z.string().url(),
  imageUrl: z.string().nullable(), priceCents: z.number().int().nullable(), match: z.enum(["exact", "possible", "similar"]),
  evidence: z.string().optional(), badge: z.string().optional(), kind: z.enum(["connect_merchant", "integrated_merchant", "external_link"]),
  merchantId: z.string().optional(), sku: z.string().optional(), variant: z.string().optional(),
  sponsored: z.object({ campaignId: z.string(), disclosure: z.literal("Sponsored"), attributionToken: z.string(), model: z.enum(["cpc", "cpa"]) }).optional(),
  origin: z.enum(["sample", "live"]), savedAt: z.number(), candidateLabel: z.string(),
});

const persisted = z.object({ v: z.literal(1), saved: z.array(offer), recipes: z.array(recipe), list: z.array(listItem) });
export type Persisted = z.infer<typeof persisted>;

export function loadPersisted(): { saved: SavedOffer[]; recipes: Recipe[]; list: ShoppingListItem[] } | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = persisted.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      window.localStorage.removeItem(STORAGE_KEY); // corrupt → recover
      return null;
    }
    return { saved: parsed.data.saved as SavedOffer[], recipes: parsed.data.recipes, list: parsed.data.list };
  } catch {
    return null;
  }
}

export function savePersisted(data: { saved: SavedOffer[]; recipes: Recipe[]; list: ShoppingListItem[] }): boolean {
  try {
    if (typeof window === "undefined") return false;
    const payload: Persisted = { v: 1, saved: data.saved.slice(-50), recipes: data.recipes.slice(-20), list: data.list.slice(-100) };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false; // unavailable or full storage is non-fatal
  }
}

export const PAIR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function makePairingCode(random: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 6; i += 1) s += PAIR_ALPHABET[Math.floor(random() * PAIR_ALPHABET.length)];
  return s;
}
