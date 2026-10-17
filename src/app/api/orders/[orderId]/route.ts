import { reconcileOrder } from "@/server/commerce";
import { errorResponse, json } from "@/server/http";
import { requireUser } from "@/server/supabase";

export const dynamic = "force-dynamic";

/** Owned order, payment, fulfillment, and receipt state; reconciles pending intents with Stripe (bounded polling fallback). */
export async function GET(_req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  try {
    const u = await requireUser();
    const { orderId } = await ctx.params;
    return json({ order: await reconcileOrder(u.id, orderId) });
  } catch (e) { return errorResponse(e); }
}
