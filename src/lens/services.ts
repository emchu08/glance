"use client";

import type { CaptureKind, DishHypothesis, GroceryObservation, Offer, RankedCandidate, Recipe } from "@/data/types";
import type { ItemInsight } from "@/domain/grocery/insights";
import { sampleInsight } from "@/domain/grocery/insights";
import { rankCandidates, updateSeenCounts } from "@/domain/glimpse/interest";
import { SAMPLE_LATENCY_MS, sampleDish, sampleGlimpseFrame, sampleGroceryFrame, sampleOffersForLabel, sampleRecipes } from "@/domain/sample";
import type { Quote } from "@/domain/commerce/quote";
import type { OrderSummary, WalletState } from "./types";

const REQUEST_TIMEOUT_MS = 25_000;

export class ServiceError extends Error {
  status: number;
  constructor(message: string, status = 0) { super(message); this.status = status; }
}

function withTimeout(signal: AbortSignal | undefined, ms = REQUEST_TIMEOUT_MS): AbortSignal {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("timeout")), ms);
  signal?.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true });
  ctrl.signal.addEventListener("abort", () => clearTimeout(t), { once: true });
  return ctrl.signal;
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: withTimeout(signal), credentials: "same-origin" });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error ?? msg; } catch { /* ignore */ }
    throw new ServiceError(msg || `HTTP ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal: withTimeout(signal), credentials: "same-origin", cache: "no-store" });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error ?? msg; } catch { /* ignore */ }
    throw new ServiceError(msg || `HTTP ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason ?? new Error("aborted")); }, { once: true });
});

// ── Recognition ──────────────────────────────────────────────────────────────

export interface Frame { dataUrl: string | null; width: number; height: number; index: number; origin: CaptureKind; capturedAt: number }

export async function recognizeGlimpse(frame: Frame, seenWindow: string[][], signal?: AbortSignal): Promise<{ ranked: RankedCandidate[]; window: string[][]; model: string }> {
  if (frame.origin === "sample" || !frame.dataUrl) {
    await delay(SAMPLE_LATENCY_MS, signal);
    const r = sampleGlimpseFrame(frame.index, seenWindow);
    return { ranked: r.ranked, window: r.window, model: "sample" };
  }
  const res = await postJson<{ candidates: RankedCandidate[]; model: string }>("/api/glance/glimpse", { image: frame.dataUrl }, signal);
  const ids = res.candidates.map((c) => c.id);
  const { counts, window } = updateSeenCounts({}, ids, seenWindow);
  return { ranked: rankCandidates(res.candidates, { seenCounts: counts }), window, model: res.model };
}

export async function recognizeGroceryFrame(frame: Frame, cart: string[], signal?: AbortSignal): Promise<{ observations: GroceryObservation[]; caption?: string; model: string }> {
  if (frame.origin === "sample" || !frame.dataUrl) {
    await delay(SAMPLE_LATENCY_MS, signal);
    const s = sampleGroceryFrame(frame.index);
    return { observations: s.observations, caption: s.caption, model: "sample" };
  }
  return postJson("/api/glance/grocery", { image: frame.dataUrl, cart }, signal);
}

export async function recognizeDish(frame: Frame, signal?: AbortSignal): Promise<{ isFood: boolean; hypotheses: DishHypothesis[]; model: string }> {
  if (frame.origin === "sample" || !frame.dataUrl) {
    await delay(SAMPLE_LATENCY_MS, signal);
    return { ...sampleDish(), model: "sample" };
  }
  return postJson("/api/glance/gourmet", { image: frame.dataUrl }, signal);
}

export async function fetchRecipes(dish: string, capture: CaptureKind, image: string | null, signal?: AbortSignal): Promise<Recipe[]> {
  if (capture === "sample") {
    await delay(SAMPLE_LATENCY_MS, signal);
    return sampleRecipes(dish);
  }
  const res = await postJson<{ recipes: Recipe[] }>("/api/glance/recipes", { dish, image }, signal);
  return res.recipes;
}

export async function fetchInsight(productKey: string, label: string, packageSize: string | null, capture: CaptureKind, image: string | null, signal?: AbortSignal): Promise<ItemInsight | null> {
  const local = sampleInsight(productKey);
  if (capture === "sample" || local) {
    await delay(SAMPLE_LATENCY_MS / 2, signal);
    return local;
  }
  const res = await postJson<{ insight: ItemInsight | null }>("/api/glance/grocery/item", { productKey, label, packageSize, image }, signal);
  return res.insight;
}

// ── Offers & listings (shared in-flight work keyed by normalized query) ──────

const inflight = new Map<string, Promise<Offer[]>>();
const listingCache = new Map<string, { offers: Offer[]; at: number }>();
const CACHE_TTL = 10 * 60 * 1000;

/** Streams offers: buyable demo-merchant/sponsored rows first, grounded listings as they validate. */
export async function fetchOffers(candidate: { id: string; label: string }, capture: CaptureKind, onBatch: (offers: Offer[], done: boolean) => void, signal?: AbortSignal): Promise<Offer[]> {
  if (capture === "sample") {
    await delay(SAMPLE_LATENCY_MS, signal);
    const offers = sampleOffersForLabel(candidate.label, candidate.id);
    onBatch(offers, true);
    return offers;
  }
  const res = await fetch("/api/glance/offers", { method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify({ candidate }), signal: withTimeout(signal, 40_000), credentials: "same-origin" });
  if (!res.ok || !res.body) throw new ServiceError(`Offer search failed (${res.status})`, res.status);
  const all = await readNdjson(res.body, (offer) => onBatch([offer], false));
  onBatch([], true);
  return all;
}

async function readNdjson(body: ReadableStream<Uint8Array>, onOffer: (offer: Offer) => void): Promise<Offer[]> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const all: Offer[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as { offer?: Offer; error?: string; done?: boolean };
      // Offers already shown stay usable when the web search fails afterwards.
      if (msg.error) { if (all.length) return all; throw new ServiceError(msg.error); }
      if (msg.offer) { all.push(msg.offer); onOffer(msg.offer); }
    }
  }
  return all;
}

/** Streams NDJSON listings; calls onBatch as cards arrive. Shares in-flight work per query. */
export async function searchListings(query: string, onBatch: (offers: Offer[], done: boolean) => void, signal?: AbortSignal): Promise<Offer[]> {
  const key = query.trim().toLowerCase();
  const cached = listingCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) { onBatch(cached.offers, true); return cached.offers; }
  if (inflight.has(key)) {
    const offers = await inflight.get(key)!;
    onBatch(offers, true);
    return offers;
  }
  const p = (async () => {
    const res = await fetch("/api/glance/listings", { method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify({ query }), signal: withTimeout(signal, 40_000) });
    if (!res.ok || !res.body) throw new ServiceError(`Listing search failed (${res.status})`, res.status);
    const all = await readNdjson(res.body, (offer) => onBatch([offer], false));
    listingCache.set(key, { offers: all, at: Date.now() });
    onBatch([], true);
    return all;
  })();
  inflight.set(key, p);
  try { return await p; } finally { inflight.delete(key); }
}

// ── Handoff / relay ──────────────────────────────────────────────────────────

export async function sendHandoff(code: string | null, kind: string, title: string, url: string, signal?: AbortSignal): Promise<{ id: string; status: "queued" | "sent" }> {
  return postJson("/api/relay/handoff", { code, kind, title, url }, signal);
}

export async function pollHandoff(id: string, signal?: AbortSignal): Promise<{ status: "queued" | "sent" | "expired" }> {
  return getJson(`/api/relay/handoff?id=${encodeURIComponent(id)}`, signal);
}

// ── Wallet / orders ──────────────────────────────────────────────────────────

export async function getWallet(signal?: AbortSignal): Promise<Partial<WalletState>> {
  const res = await getJson<{ status: WalletState["status"]; brand: string | null; last4: string | null; autoBuy: WalletState["autoBuy"]; ruleSummary: string | null; email: string | null }>("/api/wallet", signal);
  return res;
}

export async function getOrders(signal?: AbortSignal): Promise<OrderSummary[]> {
  const res = await getJson<{ orders: OrderSummary[] }>("/api/orders", signal);
  return res.orders;
}

export async function getOrder(orderId: string, signal?: AbortSignal): Promise<OrderSummary> {
  const res = await getJson<{ order: OrderSummary }>(`/api/orders/${encodeURIComponent(orderId)}`, signal);
  return res.order;
}

export async function requestQuote(offer: Offer, quantity = 1, signal?: AbortSignal): Promise<Quote> {
  const res = await postJson<{ quote: Quote }>("/api/orders/quote", { merchantId: offer.merchantId, lines: [{ sku: offer.sku, quantity }] }, signal);
  return res.quote;
}

export async function createOrder(quote: Quote, offer: Offer, mode: string, signal?: AbortSignal): Promise<{ orderId: string }> {
  return postJson("/api/orders", { quoteVersion: quote.version, merchantId: quote.merchantId, lines: quote.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })), offerId: offer.id, mode, sponsored: offer.sponsored ? { campaignId: offer.sponsored.campaignId, token: offer.sponsored.attributionToken } : undefined }, signal);
}

export async function purchase(orderId: string, attemptKey: string, signal?: AbortSignal): Promise<{ status: string; order: OrderSummary; clientSecret?: string }> {
  return postJson("/api/payments/purchase", { orderId, attemptKey, instruction: "buy" }, signal);
}

export async function pauseRule(pause: boolean, signal?: AbortSignal): Promise<Partial<WalletState>> {
  return postJson("/api/purchase-rules/pause", { pause }, signal);
}

export async function recordAdClick(token: string, signal?: AbortSignal): Promise<void> {
  try { await postJson("/api/ads/click", { token }, signal); } catch { /* attribution failures never block the shopper */ }
}
