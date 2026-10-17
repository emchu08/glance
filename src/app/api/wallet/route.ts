import { getWalletView, removeWalletMethod } from "@/server/commerce";
import { assertSameOrigin, errorResponse, json } from "@/server/http";
import { requireUser } from "@/server/supabase";

export const dynamic = "force-dynamic";

/** Owner's masked method summary, wallet readiness, permission status. Never Stripe ids or client secrets. */
export async function GET() {
  try {
    const u = await requireUser();
    return json(await getWalletView(u.id, u.email));
  } catch (e) { return errorResponse(e); }
}

/** Remove the saved method (pauses auto-buy). Pending orders keep their records. */
export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    const u = await requireUser();
    await removeWalletMethod(u.id);
    return json(await getWalletView(u.id, u.email));
  } catch (e) { return errorResponse(e); }
}
