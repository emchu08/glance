import { z } from "zod";
import { clientKey, errorResponse, json, readJson } from "@/server/http";
import { createPairing, joinPairing, rateLimit } from "@/server/relay";
import { HttpError } from "@/server/supabase";

export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().regex(/^[A-Z2-9]{6}$/).optional(), role: z.enum(["lens", "phone"]).default("lens") });

/** Lens mints/refreshes a short-lived pairing; phone joins with the six-character code and receives a scoped credential. */
export async function POST(req: Request) {
  try {
    if (!(await rateLimit(`pair:${clientKey(req)}`, 30, 60_000))) throw new HttpError(429, "Too many pairing attempts");
    const body = await readJson(req, Body);
    if (body.role === "phone") {
      if (!body.code) throw new HttpError(400, "Code required");
      const r = await joinPairing(body.code);
      if (!r) throw new HttpError(404, "Pairing code not found or expired");
      return json({ code: body.code, token: r.phoneToken });
    }
    const r = await createPairing(body.code);
    return json({ code: r.code, token: r.lensToken });
  } catch (e) { return errorResponse(e); }
}
