import { z } from "zod";
import { createOrder, listOrders } from "@/server/commerce";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { requireUser } from "@/server/supabase";

export const dynamic = "force-dynamic";

const Body = z.object({
  quoteVersion: z.string().min(1), merchantId: z.string().min(1), lines: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive().max(20) })).min(1).max(10),
  offerId: z.string().optional(), mode: z.enum(["glimpse", "grocery", "gourmet"]).optional(), sponsored: z.object({ campaignId: z.string(), token: z.string() }).nullable().optional(),
});

export async function GET() {
  try { const u = await requireUser(); return json({ orders: await listOrders(u.id) }); } catch (e) { return errorResponse(e); }
}

/** Create/reuse an owned immutable order from a valid quote. Client amounts are rejected by construction. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const u = await requireUser();
    const body = await readJson(req, Body);
    const order = await createOrder(u.id, { quoteVersion: body.quoteVersion, merchantId: body.merchantId, lines: body.lines, mode: body.mode, sponsored: body.sponsored ?? null });
    return json({ orderId: order.id, order });
  } catch (e) { return errorResponse(e); }
}
