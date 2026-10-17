import { z } from "zod";
import { createSetupIntent, saveDefaultMethod } from "@/server/commerce";
import { env } from "@/server/env";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { livemode } from "@/server/stripe";
import { HttpError, requireUser } from "@/server/supabase";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup-intent") }),
  z.object({ action: z.literal("save"), paymentMethodId: z.string().min(1), consentVersion: z.string().min(1) }),
  z.object({ action: z.literal("use-test-visa"), consentVersion: z.string().min(1) }),
]);

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const u = await requireUser();
    const body = await readJson(req, Body);
    switch (body.action) {
      case "setup-intent": {
        const r = await createSetupIntent(u.id, u.email);
        return json({ clientSecret: r.clientSecret, publishableKey: env.stripePublishableKey });
      }
      case "save":
        return json(await saveDefaultMethod(u.id, u.email, body.paymentMethodId, body.consentVersion));
      case "use-test-visa": {
        if (livemode()) throw new HttpError(400, "Test cards are only available in sandbox");
        // Stripe's documented sandbox test payment method for Visa 4242 — a real sandbox saved method, not a fake.
        return json(await saveDefaultMethod(u.id, u.email, "pm_card_visa", body.consentVersion));
      }
    }
  } catch (e) { return errorResponse(e); }
}
