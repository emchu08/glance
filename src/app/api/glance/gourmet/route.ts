import { z } from "zod";
import { sampleDish } from "@/domain/sample";
import { recognizeDish } from "@/server/claude";
import { aiConfigured } from "@/server/env";
import { clientKey, errorResponse, imageSchema, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/relay";
import { HttpError } from "@/server/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ image: imageSchema.optional(), sample: z.boolean().optional() });

export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    if (body.sample || !body.image) return json({ ...sampleDish(), model: "sample" });
    if (!aiConfigured()) throw new HttpError(503, "Live recognition is not configured", "ai_unconfigured");
    if (!(await rateLimit(`gourmet:${clientKey(req)}`, 60, 60_000))) throw new HttpError(429, "Too many scans. Wait a moment and try again.", "rate_limited");
    return json(await recognizeDish(body.image));
  } catch (e) { return errorResponse(e); }
}
