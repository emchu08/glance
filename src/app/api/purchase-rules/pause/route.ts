import { z } from "zod";
import { getWalletView, pauseRules } from "@/server/commerce";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { requireUser } from "@/server/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const u = await requireUser();
    const body = await readJson(req, z.object({ pause: z.boolean() }));
    await pauseRules(u.id, body.pause);
    return json(await getWalletView(u.id, u.email));
  } catch (e) { return errorResponse(e); }
}
