import { z } from "zod";
import { createRule, getWalletView } from "@/server/commerce";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { requireUser, supabaseAdmin } from "@/server/supabase";

export const dynamic = "force-dynamic";

const Body = z.object({ merchantId: z.string().min(1), skus: z.array(z.string().min(1)).min(1).max(10), perOrderLimitCents: z.number().int().positive().max(50_000), cumulativeLimitCents: z.number().int().positive().max(500_000), maxQuantity: z.number().int().positive().max(5).default(1), expiresInDays: z.number().int().positive().max(90).default(30), terms: z.record(z.string(), z.unknown()).default({}) });

export async function GET() {
  try {
    const u = await requireUser();
    const { data } = await supabaseAdmin().from("purchase_rules").select("id, version, status, merchant_allowlist, sku_allowlist, max_quantity, per_order_limit_cents, cumulative_limit_cents, spent_cents, reserved_cents, expires_at, created_at").eq("owner_id", u.id).order("created_at", { ascending: false }).limit(10);
    return json({ rules: data ?? [] });
  } catch (e) { return errorResponse(e); }
}

/** Versioned, explicitly enabled auto-buy permission. Disabled until the owner creates one. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const u = await requireUser();
    const body = await readJson(req, Body);
    const id = await createRule(u.id, body);
    return json({ id, wallet: await getWalletView(u.id, u.email) });
  } catch (e) { return errorResponse(e); }
}
