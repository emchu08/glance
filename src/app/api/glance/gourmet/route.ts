import { z } from "zod";
import { sampleDish } from "@/domain/sample";
import { recognizeDish } from "@/server/claude";
import { aiConfigured } from "@/server/env";
import { errorResponse, imageSchema, json, readJson } from "@/server/http";
import { HttpError } from "@/server/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ image: imageSchema.optional(), sample: z.boolean().optional() });

export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    if (body.sample || !body.image) return json({ ...sampleDish(), model: "sample" });
    if (!aiConfigured()) throw new HttpError(503, "Live recognition is not configured", "ai_unconfigured");
    return json(await recognizeDish(body.image));
  } catch (e) { return errorResponse(e); }
}
