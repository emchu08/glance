import { z } from "zod";
import type { Offer } from "@/data/types";
import { demoMerchantOffersFor, sampleOffersForLabel } from "@/domain/sample";
import { sponsoredOfferFor } from "@/server/ads";
import { searchListings } from "@/server/claude";
import { aiConfigured, supabaseConfigured } from "@/server/env";
import { errorResponse, json, readJson } from "@/server/http";
import { currentUser } from "@/server/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ candidate: z.object({ id: z.string(), label: z.string().min(1).max(120), brand: z.string().optional(), variant: z.string().optional() }), sample: z.boolean().optional() });

/** Offers for a chosen candidate: eligible demo-merchant SKUs + sponsored (≤1) + grounded live listings (or sample rows). */
export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    const label = [body.candidate.brand, body.candidate.label, body.candidate.variant].filter(Boolean).join(" ");
    const user = supabaseConfigured() ? await currentUser().catch(() => null) : null;
    const demo = demoMerchantOffersFor(body.candidate.label, body.candidate.id);
    const sponsored = supabaseConfigured() ? await sponsoredOfferFor(label, user?.id ?? null).catch(() => null) : null;
    let rest: Offer[] = [];
    let ranker = "sample";
    if (body.sample || !aiConfigured()) {
      rest = sampleOffersForLabel(body.candidate.label, body.candidate.id).filter((o) => o.kind !== "connect_merchant");
    } else {
      ranker = "live-grounded";
      for await (const ev of searchListings(label, body.candidate.id)) if (ev.offer) rest.push(ev.offer);
    }
    const offers = [...(sponsored ? [sponsored] : []), ...rest.slice(0, 1), ...demo, ...rest.slice(1)];
    return json({ offers, ranker });
  } catch (e) { return errorResponse(e); }
}
