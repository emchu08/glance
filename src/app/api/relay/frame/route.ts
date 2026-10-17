import { z } from "zod";
import { clientKey, errorResponse, imageSchema, json, readJson } from "@/server/http";
import { getFrame, putFrame, rateLimit, setDemand, takeHandoffs, touchPhone, verifyPhone } from "@/server/relay";
import { HttpError } from "@/server/supabase";

export const dynamic = "force-dynamic";

const Upload = z.object({ code: z.string().regex(/^[A-Z2-9]{6}$/), token: z.string().min(10), image: imageSchema, width: z.number().int().positive().max(4096), height: z.number().int().positive().max(4096), capturedAt: z.number().int().positive() });

/** Phone uploads a downscaled raw frame (TTL 20 s) and takes pending handoff links atomically. */
export async function POST(req: Request) {
  try {
    if (!(await rateLimit(`frame:${clientKey(req)}`, 120, 60_000))) throw new HttpError(429, "Too many uploads");
    const body = await readJson(req, Upload);
    const pair = await verifyPhone(body.code, body.token);
    if (!pair) throw new HttpError(403, "Invalid pairing credential");
    await putFrame(body.code, { image: body.image, width: body.width, height: body.height, capturedAt: body.capturedAt });
    await touchPhone(body.code);
    const handoffs = await takeHandoffs(body.code);
    return json({ ok: true, demand: pair.demandUntil > Date.now(), handoffs: handoffs.map((h) => ({ id: h.id, kind: h.kind, title: h.title, url: h.url })) });
  } catch (e) { return errorResponse(e); }
}

/** Lens reads the latest frame; `demand=1` tells the phone to keep capturing for 10 s. Never consumes handoffs. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code") ?? "";
  if (!/^[A-Z2-9]{6}$/.test(code)) return new Response("Bad code", { status: 400 });
  if (u.searchParams.get("demand") === "1") await setDemand(code);
  const f = await getFrame(code);
  if (!f) return new Response(null, { status: 204 });
  return json({ image: f.image, width: f.width, height: f.height, capturedAt: f.capturedAt, uploadedAt: f.uploadedAt });
}
