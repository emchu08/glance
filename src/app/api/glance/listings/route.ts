import { z } from "zod";
import type { Offer } from "@/data/types";
import { sponsoredOfferFor } from "@/server/ads";
import { lensListings, lensListingStream } from "@/server/listings";
import { searchListingsStream } from "@/server/listings/search";
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
    if (!(await rateLimit(`listings:${clientKey(req)}`, 60, 60_000))) throw new HttpError(429, "Too many searches. Try again in a few minutes.");
    if (!aiConfigured()) throw new HttpError(503, "Live listing search is not configured on this deployment", "ai_unconfigured");
    // Start the shared web search now so the account and sponsored lookups overlap with it.
    void searchListingsStream(body.query).catch(() => {});
    const user = supabaseConfigured() ? await currentUser().catch(() => null) : null;
    const sponsored = supabaseConfigured() ? await sponsoredOfferFor(body.query, user?.id ?? null).catch(() => null) : null;
    const wantsStream = (req.headers.get("accept") ?? "").includes("application/x-ndjson");
    const lead: Offer[] = sponsored ? [sponsored] : [];
    if (!wantsStream) {
      try { return json({ offers: [...lead, ...(await lensListings(body.query, { signal: req.signal }))], error: null }); }
      catch (e) { if (lead.length) return json({ offers: lead, error: (e as Error).message }); throw new HttpError(502, (e as Error).message); }
    }
    return lensListingStream(body.query, { lead, signal: req.signal });
  } catch (e) { return errorResponse(e); }
}
