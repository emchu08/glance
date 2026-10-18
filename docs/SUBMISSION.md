# DubHacks 2026 submission package — Glance

Reference date: October 17, 2026. Draft deadline Saturday Oct 17, 10:30 PM PT; final Sunday Oct 18, 10:00 AM PT.
Tracks: **Visa: Reimagine Shopping** (title) and **SideShift** (side). The detailed sponsor briefs could not be verified
during implementation; this package maps the shipped product to the public track names and records each unverified
requirement as a gap. Nothing is submitted or sent to sponsors by this repository.

## Project description

**Glance — Buy with your eyes.** An AI shopping assistant for Meta display glasses. The wearer looks at a product,
Glance recognizes it on an explicit scan, finds offers, and lets them buy eligible items with a saved Visa card through
Stripe without taking out the phone. Three distinct modes share one wallet: Glimpse (products), Grocery (physical cart,
prices, nutrition, list, aisle guidance), Gourmet (dish → recipes → ingredients). Revenue: a configurable marketplace
commission on completed eligible purchases (10% of item subtotal in the sandbox example) and disclosed sponsored
listings billed only for qualified clicks or verified conversions.

## Visa story

See a product → compare an accurate offer → **Buy $12.00** with Visa •• 4242 via Stripe → payment verified → order
accepted → receipt in the lens. Rails stated precisely: *Visa card payments processed by Stripe; merchant commissions
and transfers through Stripe Connect.* Not a direct Visa API integration; a Visa Intelligent Commerce adapter is
conditional on documented access and is not implemented. User-set purchase limits (Auto-buy) are part of the product.

## What was built and how to demonstrate it

| Requirement (source) | Implementation | Demo step | Evidence | Gap |
| --- | --- | --- | --- | --- |
| Commerce in the lens: seller, variant, qty, total, saved card, one deliberate Buy, no second confirmation | `src/lens/screens.ts` offer actions; `src/server/commerce.ts` | `/glasses` → Glimpse → Scan → See offers → › → Buy $12.00 | Sandbox order `GL-VT5MN`, PI `pi_3URfFs0lU2xH9eJl1ZgJfGal` succeeded | Physical glasses run pending |
| Saved payment methods, real sandbox payments, recovery, receipts, commissions | SetupIntent/PaymentIntent, webhook, ledger | `/wallet/setup` → test Visa → buy → Wallet → Orders | `docs/PAYMENTS.md` | Connect destination charges need the Dashboard platform profile |
| Supabase accounts and continuity | `supabase/migrations/0001_init.sql`, RLS, RPCs | sign in on `/wallet/setup`; lens wallet chip shows the card | `docs/ACCOUNTS_AND_DATA.md` | — |
| Three distinct modes, one wallet | `MODE_META` colors, shared payment surface | Modes chip → switch; wallet chip persists | screenshots in presenter | — |
| Auto-buy rules | `/wallet/setup` step 3; `purchase_rules`, `reserve_rule_budget` | enable rule, pause from lens Wallet tray | unit tests `commerce.test.ts` | delegated trigger demo uses the API (`instruction:"rule"`) |
| Sponsored listings + attribution | `src/server/ads.ts`, campaign `camp_demo_tote` | Online listings "tote" shows a disclosed Sponsored card; click recorded once | `/advertiser` (member role) | advertiser invoicing flow is modeled, not exercised in sandbox |
| Performance | `npm run measure:performance`, `docs/PERFORMANCE.md` | run on demo laptop | pending measurements | physical devices pending |
| Meta registration and glasses purchase | `ios/` companion, DAT adapter, snapshot bridge, relay | build in Xcode; pair with code; scan | `ios/README.md` | DAT package resolution and physical-device verification pending |
| Public deployment | `docs/DEPLOYMENT.md` | open the live URL | see below | — |

## Public URLs

- Root app: https://glance-blue.vercel.app
- Repository: https://github.com/emchu08/glance

## 90–120 second demo script (onboarding already completed)

1. Presenter `/demo`: wearer view + enlarged lens, wallet chip shows Visa •• 4242.
2. Glimpse: Scan item → "Gray crewneck sweater" → See offers → › to Glance Demo Market tote → **Buy $12.00** →
   Paying… → Order accepted. Diagnostics: commission $1.20 (10% sandbox example).
3. Modes → Grocery: Start scanning; yogurt card appears, auto-adds on cart placement; lemonade nudge; sparkling
   water Amazon-cheaper. Finish trip → donut summary (never charges a card).
4. Modes → Gourmet: Scan dish → Fettuccine Alfredo → recipes → Add to list → Shop in Grocery.
5. Online listings "tote" → disclosed Sponsored card; `/advertiser` shows the qualified click.
6. Performance JSON and the public URL.
Label on screen: sandbox payments, sample recognition, simulated fulfillment.

## Real vs simulated

Real: Supabase Auth and data, Stripe sandbox customers/methods/PaymentIntents/webhooks, commission ledger, Claude
recognition and web-grounded listings in live mode, relay pairing. Simulated: sample recognition fixtures, sample
prices and store stock, demo merchant fulfillment, 3D site everything. Unverified: physical glasses, DAT registration
on hardware, Visa/SideShift official brief compliance.
