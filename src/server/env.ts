import "server-only";

/** Server-side environment access. Secrets never leave this module into client bundles. */
export const env = {
  appUrl: process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? "",
  stripeApiKey: process.env.STRIPE_API_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripeConnectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "",
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
  paymentsMode: (process.env.PAYMENTS_MODE ?? "sandbox") as "sandbox" | "live",
  enableLivePayments: process.env.ENABLE_LIVE_PAYMENTS === "true",
  commissionBps: Number(process.env.GLANCE_COMMISSION_BPS ?? 1000),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  listingModel: process.env.ANTHROPIC_LISTING_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  adSecret: process.env.AD_ATTRIBUTION_SECRET ?? "",
  relaySecret: process.env.RELAY_SECRET ?? "",
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "",
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "",
  isProd: process.env.NODE_ENV === "production",
};

export const aiConfigured = () => env.anthropicApiKey.length > 0;
export const stripeConfigured = () => env.stripeApiKey.startsWith("sk_test_") || (env.stripeApiKey.startsWith("sk_live_") && env.enableLivePayments);
export const supabaseConfigured = () => env.supabaseUrl.length > 0 && env.supabaseSecretKey.length > 0;

/** Live charges are server-disabled unless PAYMENTS_MODE=live and ENABLE_LIVE_PAYMENTS=true with a live key. */
export function assertSandboxOrEnabledLive(): void {
  if (env.stripeApiKey.startsWith("sk_live_") && !(env.paymentsMode === "live" && env.enableLivePayments)) {
    throw new Error("Live Stripe key present but live payments are disabled server-side");
  }
}
