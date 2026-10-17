import { z } from "zod";
import { recordClick } from "@/server/ads";
import { assertSameOrigin, clientKey, errorResponse, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/relay";
import { currentUser, HttpError } from "@/server/supabase";

export const dynamic = "force-dynamic";

/** Deliberate sponsored activation only (never focus/hover). Token is single-use and expiring. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!(await rateLimit(`adclick:${clientKey(req)}`, 30, 60_000))) throw new HttpError(429, "Too many requests");
    const body = await readJson(req, z.object({ token: z.string().min(10).max(400) }));
    const u = await currentUser().catch(() => null);
    return json(await recordClick(body.token, u?.id ?? null));
  } catch (e) { return errorResponse(e); }
}
