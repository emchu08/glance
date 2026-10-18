import { z } from "zod";
import { sampleGroceryFrame } from "@/domain/sample";
import { recognizeGroceryFrame } from "@/server/claude";
import { aiConfigured } from "@/server/env";
import { clientKey, errorResponse, imageSchema, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/relay";
import { HttpError } from "@/server/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ image: imageSchema.optional(), sample: z.number().int().min(0).optional(), cart: z.array(z.string()).max(50).optional() });

export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    const t0 = Date.now();
    if (body.sample !== undefined || !body.image) {
      const s = sampleGroceryFrame(body.sample ?? 0);
      return json({ observations: s.observations, caption: s.caption, model: "sample", latencyMs: Date.now() - t0 });
    }
    if (!aiConfigured()) throw new HttpError(503, "Live recognition is not configured", "ai_unconfigured");
    if (!(await rateLimit(`grocery:${clientKey(req)}`, 120, 60_000))) throw new HttpError(429, "Too many scans. Wait a moment and try again.", "rate_limited");
    const r = await recognizeGroceryFrame(body.image, body.cart ?? []);
    return json({ observations: r.observations, model: r.model, latencyMs: Date.now() - t0 });
  } catch (e) { return errorResponse(e); }
}
