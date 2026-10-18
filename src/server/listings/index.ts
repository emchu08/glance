import "server-only";

import type { Offer } from "@/data/types";
import { GlanceServiceError } from "./claude-search";
import { searchListingsStream } from "./search";
import type { ListingOffer } from "./types";

/**
 * Online listings, from the original Glance lens's search (one streamed web search,
 * grounded links, product-page photos and prices, shared and cached), in the lens's
 * Offer shape. `lead` offers (the sponsored slot, the connected seller's SKUs) come
 * first and stay first however the web listings are ranked.
 */

export type LensListingEvent =
  | { type: "offer"; offer: Offer }
  | { type: "update"; id: string; imageUrl?: string | null; priceCents?: number }
  | { type: "ranked"; offers: Offer[] }
  | { type: "done"; offers: Offer[] }
  | { type: "error"; error: string };

export function toLensOffer(o: ListingOffer, query: string, candidateId?: string): Offer {
  return {
    id: o.id,
    candidateId,
    query,
    name: o.name,
    retailer: o.retailer,
    url: o.url,
    imageUrl: o.image ?? null,
    priceCents: o.priceCents,
    match: o.matchType,
    evidence: o.reason,
    badge: o.badge,
    kind: "external_link",
    origin: "live",
  };
}

/** The final list (non-streamed form). */
export async function lensListings(query: string, opts: { candidateId?: string; signal?: AbortSignal } = {}): Promise<Offer[]> {
  const { offers } = await searchListingsStream(query, {}, opts.signal);
  return offers.map((o) => toLensOffer(o, query, opts.candidateId));
}

/**
 * NDJSON: one LensListingEvent per line as it happens. The lead offers are written at once,
 * so the wearer sees the buyable seller and sponsored slot before the web search returns.
 * Leaving early stops the writing; the shared search carries on for whoever asks next.
 */
export function lensListingStream(query: string, opts: { candidateId?: string; lead?: Offer[]; signal: AbortSignal }): Response {
  const lead = opts.lead ?? [];
  const convert = (list: ListingOffer[]) => [...lead, ...list.map((o) => toLensOffer(o, query, opts.candidateId))];
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const write = (event: LensListingEvent) => {
        if (!open) return;
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { open = false; }
      };
      opts.signal.addEventListener("abort", () => { open = false; }, { once: true });
      for (const offer of lead) write({ type: "offer", offer });
      searchListingsStream(query, {
        offer: (offer) => write({ type: "offer", offer: toLensOffer(offer, query, opts.candidateId) }),
        ranked: (offers) => write({ type: "ranked", offers: convert(offers) }),
        update: (u) => write({ type: "update", id: u.id, ...(u.image !== undefined ? { imageUrl: u.image } : {}), ...(u.priceCents !== undefined ? { priceCents: u.priceCents } : {}) }),
      }, opts.signal)
        .then(({ offers }) => write({ type: "done", offers: convert(offers) }))
        .catch((error: unknown) => write({ type: "error", error: error instanceof GlanceServiceError ? error.message : "Search failed" }))
        .finally(() => { if (open) { open = false; try { controller.close(); } catch { /* closed */ } } });
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
