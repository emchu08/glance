import { z } from "zod";
import { sampleRecipes } from "@/domain/sample";
import { generateRecipes } from "@/server/claude";
import { aiConfigured } from "@/server/env";
import { errorResponse, imageSchema, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ dish: z.string().min(1).max(120), image: imageSchema.nullable().optional(), sample: z.boolean().optional() });

export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    const local = sampleRecipes(body.dish);
    if (body.sample || !aiConfigured()) return json({ recipes: local, model: "sample" });
    const r = await generateRecipes(body.dish, body.image ?? null);
    return json(r);
  } catch (e) { return errorResponse(e); }
}
