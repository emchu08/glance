import { z } from "zod";
import { quoteOrder } from "@/server/commerce";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { requireUser } from "@/server/supabase";

export const dynamic = "force-dynamic";

const Body = z.object({ merchantId: z.string().min(1), lines: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive().max(20) })).min(1).max(10) });

/** Server-priced, versioned quote with full total and commission basis. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const u = await requireUser();
    const body = await readJson(req, Body);
    return json({ quote: await quoteOrder(u.id, body.merchantId, body.lines) });
  } catch (e) { return errorResponse(e); }
}
