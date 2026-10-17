# Deployment

## Live (verified October 17, 2026)

| Surface | URL | Notes |
| --- | --- | --- |
| Root app (marketing, presenter, glasses, lens, wallet, APIs) | https://glance-blue.vercel.app | Vercel project `glance`, production; public (no deployment protection on production) |
| Standalone 3D site | https://glance-website-lac.vercel.app | Vercel project `glance-website` (Vite static build) |
| Stripe webhook | `we_1URfeG0lU2xH9eJlWHtbDXrh` → `/api/payments/webhook` | sandbox; signature verified against the raw body; `STRIPE_WEBHOOK_SECRET` set on Vercel |
| Supabase | project `qpneiyefrsnlvmeumphi` (us) | migration `glance_init` applied |

Checks run against production: `/api/health` 200 · `/`, `/glasses`, `/lens` 200 · `/api/glance/status` reports
configured model, Stripe and Supabase · unsigned webhook → 400 · `/api/wallet` unauthenticated → 401 ·
`/demo/screens` → 404 in production. Region: Vercel default (iad1) with Supabase in us-east; cross-region latency
for an order round-trip is in the low hundreds of milliseconds in the presenter diagnostics.

## Vercel (root Next.js app)

```bash
npx vercel link            # project: glance
# environment variables (Production + Preview): everything in .env.example that has a value
npx vercel env add APP_URL production
npx vercel --prod
```

After the first deploy, set `APP_URL` to the deployed origin and create the Stripe webhook:

```bash
# Stripe Dashboard → Developers → Webhooks → add endpoint https://<origin>/api/payments/webhook
# events: payment_intent.succeeded, payment_intent.payment_failed, payment_intent.requires_action,
#         payment_intent.processing, payment_intent.canceled, charge.refunded, charge.dispute.created, account.updated
npx vercel env add STRIPE_WEBHOOK_SECRET production   # whsec_… from the endpoint
npx vercel --prod
```

Supabase: `supabase/migrations/0001_init.sql` is applied to the project (via the Supabase MCP). `npm run db:migrate`
applies it elsewhere with `SUPABASE_DB_URL`. Seed: `npm run seed:sandbox`.

Standalone 3D site: `cd website && npm run build` → deploy `website/dist` as a static site (Vercel: root `website`,
framework Vite). Set `VITE_LIVE_APP_URL` to the root app origin for the "Try live demo" link.

Relay backend: process memory in development; set `UPSTASH_REDIS_REST_URL/TOKEN` (or `KV_REST_API_*`) for atomic
multi-instance delivery in production. The Runtime Cache fallback is regional and non-atomic; do not rely on it for
payment state (payment state lives in Postgres).

## Coverage and rollout

Commerce starts in US/USD with the sandbox seller. Web is globally reachable; merchant acceptance, shipping,
Stripe account eligibility, and native distribution are separate and listed in `docs/SUBMISSION.md`.
