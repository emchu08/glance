import { z } from "zod";
import { rankCandidates } from "@/domain/glimpse/interest";
import { sampleGlimpseFrame } from "@/domain/sample";
import { recognizeScene } from "@/server/claude";
import { aiConfigured } from "@/server/env";
import { errorResponse, imageSchema, json, readJson } from "@/server/http";
import { HttpError } from "@/server/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  image: imageSchema.optional(),
  sample: z.number().int().min(0).optional(),
  persistence: z.record(z.string(), z.number()).optional(),
  preferences: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    const t0 = Date.now();
    if (body.sample !== undefined || !body.image) {
      const r = sampleGlimpseFrame(body.sample ?? 0, []);
      return json({ candidates: r.ranked, ranker: "interest-v1", perception: { model: "sample", latencyMs: Date.now() - t0 } });
    }
    if (!aiConfigured()) throw new HttpError(503, "Live recognition is not configured on this deployment", "ai_unconfigured");
    const r = await recognizeScene(body.image);
    const seen = body.persistence ?? {};
    const ranked = rankCandidates(r.candidates, { seenCounts: Object.fromEntries(r.candidates.map((c) => [c.id, (seen[c.label.toLowerCase()] ?? 0) + 1])), preferredCategories: body.preferences });
    return json({ candidates: ranked, query: r.query, ranker: "interest-v1", perception: { model: r.model, latencyMs: Date.now() - t0 } });
  } catch (e) { return errorResponse(e); }
}
