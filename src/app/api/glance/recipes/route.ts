import { z } from "zod";
import { sampleRecipes } from "@/domain/sample";
import { generateRecipes } from "@/server/claude";
import { aiConfigured } from "@/server/env";
import { clientKey, errorResponse, imageSchema, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/relay";
import { HttpError } from "@/server/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ dish: z.string().min(1).max(120), image: imageSchema.nullable().optional(), sample: z.boolean().optional() });

export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    const local = sampleRecipes(body.dish);
    if (body.sample || !aiConfigured()) return json({ recipes: local, model: "sample" });
    if (!(await rateLimit(`recipes:${clientKey(req)}`, 30, 60_000))) throw new HttpError(429, "Too many recipe requests. Wait a moment and try again.", "rate_limited");
    const r = await generateRecipes(body.dish, body.image ?? null);
    return json(r);
  } catch (e) { return errorResponse(e); }
}
