import { aiConfigured, env, stripeConfigured, supabaseConfigured } from "@/server/env";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
/** Per-request configured booleans and the model name — never credentials. */
export async function GET() {
  return json({ configured: aiConfigured(), model: aiConfigured() ? env.anthropicModel : null, listingModel: aiConfigured() ? env.listingModel : null, stripe: stripeConfigured(), supabase: supabaseConfigured(), paymentsMode: env.paymentsMode, livePayments: env.enableLivePayments });
}
