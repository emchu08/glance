import { z } from "zod";
import { env } from "@/server/env";
import { assertSameOrigin, clientKey, errorResponse, json, readJson } from "@/server/http";
import { handoffStatus, queueHandoff, rateLimit } from "@/server/relay";
import { HttpError } from "@/server/supabase";
import { validateHandoffUrl } from "@/server/url";

export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().regex(/^[A-Z2-9]{6}$/).nullable(), kind: z.enum(["buy", "view", "nav", "checkout"]), title: z.string().min(1).max(160), url: z.string().min(1).max(2048) });

/** Queue a validated link for the paired phone (≤ 5 pending, 1 h TTL). Link delivery never implies payment or order success. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!(await rateLimit(`handoff:${clientKey(req)}`, 30, 60_000))) throw new HttpError(429, "Too many handoffs");
    const body = await readJson(req, Body);
    const url = validateHandoffUrl(body.url, env.appUrl);
    if (!body.code) throw new HttpError(409, "No paired phone", "not_paired");
    const r = await queueHandoff(body.code, body.kind, body.title, url);
    if (r === "full") throw new HttpError(429, "Too many pending links on your phone", "queue_full");
    return json({ id: r.id, status: r.status });
  } catch (e) { return errorResponse(e); }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return json({ error: "id required" }, 400);
  return json({ status: await handoffStatus(id) });
}
