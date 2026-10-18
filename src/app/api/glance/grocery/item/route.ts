import { z } from "zod";
import { PURCHASE_HISTORY } from "@/data/grocery";
import { comparisonsFor, deriveFlags, sampleInsight, type ItemInsight } from "@/domain/grocery/insights";
import { formatCents } from "@/domain/money";
import { CACHE_TTL, readCache, writeCache } from "@/server/cache";
import { groceryInsight } from "@/server/claude";
import { aiConfigured } from "@/server/env";
import { clientKey, errorResponse, imageSchema, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/relay";
import { HttpError } from "@/server/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ image: imageSchema.nullable().optional(), productKey: z.string().min(1).max(80), label: z.string().min(1).max(120), packageSize: z.string().max(40).nullable().optional() });

export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    const local = sampleInsight(body.productKey);
    if (local || !aiConfigured()) return json({ insight: local, model: "sample" });
    // Nutrition and typical price belong to the product, so a repeat scan is answered instantly.
    const cacheKey = [body.productKey, body.label, body.packageSize];
    const cached = await readCache<{ insight: ItemInsight; model: string }>("insight", cacheKey);
    if (cached) return json({ ...cached, cached: true });
    if (!(await rateLimit(`insight:${clientKey(req)}`, 90, 60_000))) throw new HttpError(429, "Too many item lookups. Wait a moment and try again.", "rate_limited");
    const history = PURCHASE_HISTORY[body.productKey];
    const comps = comparisonsFor(body.productKey);
    const r = await groceryInsight(body.label, body.packageSize ?? null, body.image ?? null, {
      history: history ? `bought ${history.thisMonth} this month, ${history.lastMonth} last month at ${formatCents(history.lastMonthUnitCents)}` : undefined,
      comparison: comps[0] ? `${comps[0].store} same item ${formatCents(comps[0].priceCents)}` : undefined,
    });
    const nutrition = r.is_food && r.nutrition_origin !== "none" ? { productId: body.productKey, serving: r.serving ?? "serving", kcal: r.calories ?? 0, protein: r.protein_g ?? 0, carbs: r.carbs_g ?? 0, sugar: r.sugar_g ?? 0, fat: r.fat_g ?? 0, sodium: r.sodium_mg ?? 0, allergens: r.allergens } : null;
    const insight: ItemInsight = {
      productId: body.productKey, isFood: r.is_food, nutrition, nutritionOrigin: r.nutrition_origin, allergens: r.allergens, allergenOrigin: r.allergen_origin,
      flags: deriveFlags(nutrition), nudge: r.nudge, homePriceCents: r.typical_price_usd !== null ? Math.round(r.typical_price_usd * 100) : null, comparisons: comps, bestSame: comps.find((c) => c.match === "same") ?? null, cheapestOnline: comps.find((c) => c.match === "same" && (c.store === "Amazon" || c.store === "Temu")) ?? null,
    };
    await writeCache("insight", cacheKey, { insight, model: r.model }, CACHE_TTL.insightMs);
    return json({ insight, model: r.model });
  } catch (e) { return errorResponse(e); }
}
