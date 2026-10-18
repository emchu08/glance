# Glance — Buy with your eyes

A search engine for the physical world, meant for Meta display glasses. Look at a product, compare an accurate offer, and buy eligible
items with a saved Visa card through Stripe, right inside a 600×600 lens. Three modes, one wallet:

- **Glimpse** (light blue) — scan what you see → offers → `Buy $X`
- **Grocery** (mint) — tracks what goes in your physical cart, compares prices, nutrition, list, aisle guidance
- **Gourmet** (amber) — dish → three recipes → ingredients to a shared list → shop

Built at DubHacks 2026 for the Visa title track and SideShift side track. Not affiliated with Meta.

## What is real in this build

| Capability | Status |
| --- | --- |
| In-lens purchase with a saved card (SetupIntent → PaymentIntent, idempotent attempts, webhook + reconcile) | **Working in Stripe sandbox.** Verified order `GL-VT5MN`: Visa •• 4242 → payment succeeded → order accepted → commission ledger. |
| Supabase accounts, wallet references, orders, rules, ledgers, RLS | **Applied** (`supabase/migrations/0001_init.sql`), 22 tables, owner-scoped policies, server-only RPCs. |
| Marketplace commission (10% of item subtotal, sandbox example) | **Booked per order** in `ledger_entries`; destination charges when the Connect account is enabled, platform-managed ledger otherwise (see Payments). |
| Auto-buy rules with atomic budget reservation | **Implemented** (`/wallet/setup` → Auto-buy; server-validated at execution). |
| Sponsored listings (≤1 per group, disclosed, signed single-use attribution, CPC/CPA ledgers) | **Implemented**, sandbox campaign `camp_demo_tote`. |
| Live recognition, recipes, grounded listing search (Claude + web search) | **Implemented** server-side; sample mode runs deterministic fixtures with zero model calls. |
| Native iOS companion + Meta DAT registration | **Scaffolded** (`ios/`), builds with the phone-camera transport; DAT adapter compiles when the official package resolves. **Physical-device verification pending.** |
| Public deployment | See `docs/DEPLOYMENT.md` for the live URL and the exact steps. |

## Run it

```bash
cp .env.example .env.local   # fill Supabase, Stripe sandbox, Anthropic (optional)
npm ci
npm run seed:sandbox         # demo merchant, catalog, sandbox campaign (Stripe test key required)
npm run dev -- --port 3100
```

- `/` marketing · `/demo` presenter · `/glasses` wearer preview · `/lens` the 600×600 runtime
- `/wallet/setup` one-time account + saved card (sandbox: one click attaches Stripe's test Visa 4242)
- `/connect` onboarding journey · `/merchant` · `/advertiser` · `/privacy` · `/terms`
- `/demo/screens` development gallery (42 core tiles + payment/connection fixtures; 404 in production)

Verification:

```bash
npm test                                   # 27 unit tests (tracker, cart, list math, quotes, rules, reducer, fixtures)
npm run lint && npm run build
BASE_URL=http://localhost:3100 npm run test:e2e
BASE_URL=http://localhost:3100 node --test tests/e2e/native-display.mjs tests/e2e/scanning.mjs
npm run test:vision && npm run test:grocery   # offline sample paths; GLANCE_LIVE=1 <image> calls the model (paid)
```


## Architecture

```
src/app            Next.js 16 App Router pages + route handlers (api/glance, api/wallet, api/orders, api/payments, api/relay, api/ads)
src/lens           Lens runtime: pure reducer, action descriptors (screens.ts), renderer (Lens.tsx, views.tsx), provider/effects
src/domain         Pure logic: grocery tracker/cart/insights/exit/list, gourmet list math, interest ranking, quotes, rules, money
src/data           Deterministic fixtures from the spec appendices (Glimpse, Grocery, Gourmet, demo merchant)
src/server         Supabase/Stripe/Claude clients, commerce (quotes→orders→purchase→webhooks→ledger), relay, ads, URL hardening
supabase/          Migrations + RLS
ios/               Xcode project spec (XcodeGen), SwiftUI companion, DAT transport adapter, WKWebView lens bridge
scripts/           seed, vision/grocery tests, fake phone, listing measurement/warming, performance, migrations
docs/              PAYMENTS, ACCOUNTS_AND_DATA, PERFORMANCE, DEPLOYMENT, SUBMISSION, CHANGELOG, COVERAGE
```

One state source drives the real lens and both presenter copies (`LensProvider`). Every focusable control is an
action descriptor with row/x coordinates, so pointer taps, D-pad, keyboard, and the native bridge all resolve the
same way. Sample mode never calls a paid model; live mode calls Claude only on explicit scans (Glimpse/Gourmet) or
the 3-second Grocery sampler while scanning is on.

## Environment

See `.env.example`. Secrets stay server-side: `SUPABASE_SECRET_KEY`, `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`,
`ANTHROPIC_API_KEY`, `AD_ATTRIBUTION_SECRET`, `RELAY_SECRET`. Public: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. `PAYMENTS_MODE=sandbox` and
`ENABLE_LIVE_PAYMENTS=false` keep live charging disabled on the server; no client flag can enable it.

## Assets

Scene imagery in `public/samples/` is procedural placeholder art generated in this repository (SVG) so sample
mode has no runtime image dependency. The photo briefs in the specification (street, sweater, backpack, aisle,
cart, meal) should be replaced with licensed photography; candidate boxes are positioned to match the placeholders.
Icons are generated at request time by `/icons/[file]`.
