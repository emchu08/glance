import { z } from "zod";
import { purchaseOrder } from "@/server/commerce";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { requireUser } from "@/server/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ orderId: z.string().uuid(), attemptKey: z.string().min(4).max(120), instruction: z.enum(["buy", "rule"]).default("buy"), ruleId: z.string().uuid().optional(), confidence: z.number().min(0).max(1).optional() });

/** Deliberate Buy (or matching auto-buy rule) → idempotent PaymentIntent with the saved method. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const u = await requireUser();
    const body = await readJson(req, Body);
    const r = await purchaseOrder(u.id, body.orderId, body.attemptKey, { instruction: body.instruction, ruleId: body.ruleId, confidence: body.confidence });
    return json(r);
  } catch (e) { return errorResponse(e); }
}
