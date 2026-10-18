import { z } from "zod";
import { buildTripSummary } from "@/domain/grocery/exit";
import { errorResponse, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

const Line = z.object({ productKey: z.string(), label: z.string(), packageSize: z.string().nullable(), quantity: z.number().int().positive(), unitPriceCents: z.number().int().nullable(), currency: z.literal("USD"), priceSource: z.enum(["catalog", "shelf-label", "online", "estimate", "manual", "unknown"]), confirmed: z.boolean(), events: z.array(z.string()) });
const Body = z.object({ cart: z.array(Line).max(200), orders: z.array(z.object({ priceCents: z.number().int().nonnegative() })).optional() });

/** Same summary/pie math as the lens; no AI call. */
export async function POST(req: Request) {
  try {
    const body = await readJson(req, Body);
    const online = (body.orders ?? []).reduce((s, o) => s + o.priceCents, 0);
    return json({ summary: buildTripSummary(body.cart, online) });
  } catch (e) { return errorResponse(e); }
}
