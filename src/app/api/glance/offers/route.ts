import { z } from "zod";
import type { Offer } from "@/data/types";
import { demoMerchantOffersFor, sampleOffersForLabel } from "@/domain/sample";
import { sponsoredOfferFor } from "@/server/ads";
import { searchListingsCached } from "@/server/claude";
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
    if (body.sample || !aiConfigured()) {
      const rest = sampleOffersForLabel(body.candidate.label, body.candidate.id).filter((o) => o.kind !== "connect_merchant");
      return json({ offers: [...(sponsored ? [sponsored] : []), ...rest.slice(0, 1), ...demo, ...rest.slice(1)], ranker: "sample" });
    }
    const wantsStream = (req.headers.get("accept") ?? "").includes("application/x-ndjson");
    if (!wantsStream) {
      const rest: Offer[] = [];
      for await (const ev of searchListingsCached(label, body.candidate.id)) if (ev.offer) rest.push(ev.offer);
      return json({ offers: [...(sponsored ? [sponsored] : []), ...rest.slice(0, 1), ...demo, ...rest.slice(1)], ranker: "live-grounded" });
    }
    // Buyable demo-merchant and sponsored offers are known now; grounded web listings follow as they validate.
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const write = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        for (const offer of [...(sponsored ? [sponsored] : []), ...demo]) write({ offer });
        for await (const ev of searchListingsCached(label, body.candidate.id)) write(ev);
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}
