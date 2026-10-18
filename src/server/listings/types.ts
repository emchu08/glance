/** Listing types from the original Glance lens. */
export type MatchType = "exact" | "possible" | "similar";

export interface ListingOffer {
  id: string;
  name: string;
  retailer: string;
  priceCents: number | null;
  currency: "USD";
  /** Retailer link to hand off to the phone (a retailer search URL for sample listings). */
  url: string;
  /**
   * Product photo: a sample image, a direct image URL read from the product page, or
   * `/api/glance/thumb?url=…` while the server is still reading the page. Absent: no
   * photo (the lens shows the item cropped from what the wearer saw).
   */
  image?: string;
  matchType: MatchType;
  /** Concise badge, e.g. "Best price", "Closest match". */
  badge?: string;
  /** One-line similarity explanation. */
  reason?: string;
  /** Sample catalog prices are labeled as such everywhere. */
  priceSource: "sample-catalog" | "web-search";
  /** Web prices: read from the search results, or from the product page itself. */
  priceFrom?: "search" | "page";
  /** Web listings: a single product's page, or a store's search/category page. */
  page?: "product" | "category";
  retrievedAt?: string;
}

/* ── Listing search (POST /api/glance/listings) ──────────────────────────── */

/** Server-side measurements for one listing search (shown on /demo diagnostics). */
export interface ListingSearchMeta {
  query: string;
  /** Normalised cache key (brand + model, or colour + object). */
  key: string;
  /** Served from the cross-user cache: no search was made. */
  cached: boolean;
  /** Milliseconds from the start of the request. Null when it never happened. */
  timing: {
    /** The web search results arrived (the search itself). */
    searchMs: number | null;
    /** The first listing was ready to show. */
    firstOfferMs: number | null;
    /** Every listing was known and ranked. */
    rankedMs: number | null;
    /** Product pages read for photos and missing prices (after ranking). */
    detailsMs: number | null;
    totalMs: number;
  };
  /** Pages the web search returned. */
  results: number;
  listings: number;
  /** Single-product pages among the listings. */
  products: number;
  priced: number;
  photos: number;
  /** Billed web searches (0 when cached). */
  searches: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated: searches × $0.01 + model tokens. 0 when cached. */
  costUsd: number;
  model: string;
}

/**
 * The streamed form of a listing search: NDJSON, one event per line, when the request
 * sends `Accept: application/x-ndjson`. Order: `offer`s as each listing is grounded (the
 * model's best-first order), `ranked` once every listing is known (final order with
 * badges), `update`s whenever a product page has been read (photo found or not, a price
 * the search didn't show), and finally `done` (or `error`).
 */
export type ListingStreamEvent =
  | { type: "offer"; offer: ListingOffer }
  | { type: "ranked"; offers: ListingOffer[] }
  /** `image: null` = the page has no usable photo. `priceCents` only fills a missing price. */
  | { type: "update"; id: string; image?: string | null; priceCents?: number }
  | { type: "done"; offers: ListingOffer[]; meta: ListingSearchMeta }
  | { type: "error"; error: { code: string; message: string } };

