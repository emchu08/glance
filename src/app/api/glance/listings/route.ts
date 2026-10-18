import { z } from "zod";
import type { Offer } from "@/data/types";
import { sponsoredOfferFor } from "@/server/ads";
import { searchListingsCached } from "@/server/claude";
import { aiConfigured, supabaseConfigured } from "@/server/env";
import { clientKey, errorResponse, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/relay";
import { currentUser, HttpError } from "@/server/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ query: z.string().min(1).max(120) });

/** JSON result, or NDJSON stream when `Accept: application/x-ndjson`. Bounded by rate limit; never a silent sample substitution. */
export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    if (!(await rateLimit(`listings:${clientKey(req)}`, 20, 5 * 60_000))) throw new HttpError(429, "Too many searches. Try again in a few minutes.");
    if (!aiConfigured()) throw new HttpError(503, "Live listing search is not configured on this deployment", "ai_unconfigured");
    const user = supabaseConfigured() ? await currentUser().catch(() => null) : null;
    const sponsored = supabaseConfigured() ? await sponsoredOfferFor(body.query, user?.id ?? null).catch(() => null) : null;
    const wantsStream = (req.headers.get("accept") ?? "").includes("application/x-ndjson");
    if (!wantsStream) {
      const offers: Offer[] = sponsored ? [sponsored] : [];
      let error: string | null = null;
      for await (const ev of searchListingsCached(body.query)) { if (ev.offer) offers.push(ev.offer); if (ev.error) error = ev.error; }
      if (error && !offers.length) throw new HttpError(502, error);
      return json({ offers, error });
    }
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const write = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        if (sponsored) write({ offer: sponsored });
        for await (const ev of searchListingsCached(body.query)) write(ev);
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}
