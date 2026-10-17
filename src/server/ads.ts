import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Offer } from "@/data/types";
import { env } from "./env";
import { HttpError, supabaseAdmin } from "./supabase";

/**
 * Sponsored listings: at most one per result group, always disclosed, never purchase authority.
 * CPC: billable only for a deliberate eligible activation with a valid, unexpired, unused token.
 * CPA: conversion only from a verified paid order carrying the campaign id.
 */

const TOKEN_TTL_MS = 10 * 60_000;

function sign(payload: string): string {
  return createHmac("sha256", env.adSecret || "dev-ads").update(payload).digest("base64url");
}

export function issueAttributionToken(campaignId: string, ownerId: string | null): string {
  const id = randomBytes(9).toString("base64url");
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${id}.${campaignId}.${ownerId ?? "anon"}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyAttributionToken(token: string): { id: string; campaignId: string; ownerId: string | null; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [id, campaignId, owner, expStr, sig] = parts;
  const payload = `${id}.${campaignId}.${owner}.${expStr}`;
  const expected = sign(payload);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return { id, campaignId, ownerId: owner === "anon" ? null : owner, exp };
}

interface CampaignRow { id: string; model: "cpc" | "cpa"; cpc_cents: number | null; cpa_rate_bps: number | null; title: string; destination_url: string | null; merchant_id: string | null; sku: string | null; query_terms: string[]; status: string; starts_at: string; ends_at: string }

/** Pick at most one active campaign matching the query; returns a disclosed sponsored offer with a server-issued token. */
export async function sponsoredOfferFor(query: string, ownerId: string | null): Promise<Offer | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.from("campaigns").select("*").eq("status", "active").lte("starts_at", new Date().toISOString()).gte("ends_at", new Date().toISOString()).limit(20);
  const q = query.toLowerCase();
  const match = (data as CampaignRow[] | null)?.find((c) => c.query_terms.some((t) => q.includes(t.toLowerCase())));
  if (!match) return null;
  let price: number | null = null;
  let kind: Offer["kind"] = "external_link";
  let name = match.title;
  if (match.merchant_id && match.sku) {
    const { data: item } = await sb.from("merchant_catalog").select("name, unit_price_cents, active").eq("merchant_id", match.merchant_id).eq("sku", match.sku).maybeSingle();
    if (item?.active) { price = item.unit_price_cents; kind = "connect_merchant"; name = item.name; }
  }
  await sb.from("ad_events").insert({ campaign_id: match.id, kind: "impression", owner_id: ownerId, billable: false, reason: "impression" });
  return {
    id: `sponsored-${match.id}`, query, name, retailer: match.merchant_id ? "Glance Demo Market" : "Sponsored partner", url: match.destination_url ?? "/merchant", imageUrl: match.sku ? `/samples/${match.sku}.svg` : null,
    priceCents: price, match: "similar", kind, merchantId: match.merchant_id ?? undefined, sku: match.sku ?? undefined, origin: "live",
    sponsored: { campaignId: match.id, disclosure: "Sponsored", attributionToken: issueAttributionToken(match.id, ownerId), model: match.model },
  };
}

/** Record a billable CPC click once per token; focus/hover/gaze never reach this endpoint. */
export async function recordClick(token: string, ownerId: string | null): Promise<{ billable: boolean; reason: string }> {
  const t = verifyAttributionToken(token);
  if (!t) return { billable: false, reason: "invalid_or_expired_token" };
  const sb = supabaseAdmin();
  const { data: c } = await sb.from("campaigns").select("*").eq("id", t.campaignId).maybeSingle();
  if (!c || c.status !== "active") return { billable: false, reason: "campaign_inactive" };
  if (c.model !== "cpc") { await sb.from("ad_events").insert({ campaign_id: c.id, kind: "click", token_id: t.id, owner_id: ownerId, billable: false, reason: "cpa_campaign" }).select(); return { billable: false, reason: "cpa_campaign" }; }
  const amount = c.cpc_cents ?? 0;
  const { data: ok } = await sb.rpc("reserve_campaign_budget", { p_campaign_id: c.id, p_amount: amount });
  const { error } = await sb.from("ad_events").insert({ campaign_id: c.id, kind: "click", token_id: t.id, owner_id: ownerId, billable: !!ok, reason: ok ? "qualified_click" : "budget_exhausted", amount_cents: ok ? amount : 0 });
  if (error) return { billable: false, reason: "duplicate_click" }; // unique token_id
  if (ok) await sb.from("ledger_entries").insert({ merchant_id: c.merchant_id, kind: "ad_cpc", amount_cents: amount, currency: "USD", sandbox: true, idempotency_key: `cpc:${t.id}`, detail: { campaignId: c.id } });
  return { billable: !!ok, reason: ok ? "qualified_click" : "budget_exhausted" };
}

/** CPA conversion from a verified paid order (called by the outbox/webhook path, never by the client). */
export async function recordConversion(orderId: string, campaignId: string): Promise<void> {
  const sb = supabaseAdmin();
  const { data: o } = await sb.from("orders").select("payment_status, subtotal_cents, owner_id").eq("id", orderId).maybeSingle();
  if (!o || o.payment_status !== "succeeded") return;
  const { data: c } = await sb.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (!c || c.model !== "cpa") return;
  const amount = Math.floor((o.subtotal_cents * (c.cpa_rate_bps ?? 0) + 5000) / 10000);
  const { data: ok } = await sb.rpc("reserve_campaign_budget", { p_campaign_id: c.id, p_amount: amount });
  const { error } = await sb.from("ad_events").insert({ campaign_id: c.id, kind: "conversion", token_id: `order:${orderId}`, owner_id: o.owner_id, order_id: orderId, billable: !!ok, reason: ok ? "verified_order" : "budget_exhausted", amount_cents: ok ? amount : 0 });
  if (!error && ok) await sb.from("ledger_entries").insert({ order_id: orderId, merchant_id: c.merchant_id, kind: "ad_cpa", amount_cents: amount, currency: "USD", sandbox: true, idempotency_key: `cpa:${orderId}`, detail: { campaignId } });
}

export async function requireAdvertiser(userId: string): Promise<string> {
  const { data } = await supabaseAdmin().from("advertiser_members").select("advertiser_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!data) throw new HttpError(403, "Advertiser role required", "forbidden");
  return data.advertiser_id;
}
