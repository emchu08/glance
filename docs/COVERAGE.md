# Feature-to-file coverage

| Spec area | Files | Status |
| --- | --- | --- |
| Lens runtime, 26 screens, header/focus/action model | `src/lens/{types,reducer,screens,views,Lens,LensProvider,navigation}.ts(x)` | Done; `/demo/screens` 42 + payment fixtures |
| Glimpse recognition/ranking/offers/saved | `src/domain/glimpse/interest.ts`, `src/data/glimpse.ts`, `api/glance/{glimpse,offers,listings}` | Done (sample + live) |
| Grocery tracker/cart/insights/list/exit/aisles/stores | `src/domain/grocery/*`, `src/data/grocery.ts`, `api/glance/grocery/*` | Done |
| Gourmet dish/recipes/list math/steps | `src/domain/gourmet/list.ts`, `src/data/gourmet.ts`, `api/glance/{gourmet,recipes}` | Done |
| Wallet, quotes, orders, purchase, webhook, refunds, rules | `src/server/commerce.ts`, `api/wallet/*`, `api/orders/*`, `api/payments/*`, `api/purchase-rules/*` | Done; sandbox-verified |
| Supabase schema + RLS + RPCs | `supabase/migrations/0001_init.sql` | Applied |
| Sponsored listings / attribution / advertiser | `src/server/ads.ts`, `api/ads/click`, `app/advertiser` | Done (sandbox) |
| Relay, pairing, handoff, rate limits | `src/server/relay.ts`, `api/relay/*`, `scripts/fake-phone.mjs` | Done (memory/Upstash) |
| Marketing page, presenter, wearer preview, connect | `app/page.tsx`, `app/demo`, `app/glasses`, `app/connect` | Done |
| Merchant / privacy / terms / receipts / recovery | `app/merchant`, `app/privacy`, `app/terms`, `app/orders/[id]`, `app/payments/recover/[id]` | Done |
| Manifest + icons | `app/manifest.webmanifest`, `app/icons/[file]` | Done |
| 3D site | `website/` | Built; smoke test needs Chrome |
| iOS companion | `ios/` | Scaffolded; DAT package + device verification pending |
| MediaPipe runtime copy, EfficientDet model | `scripts/copy-mediapipe-wasm.mjs`, `public/models/` | Runtime copied; model download documented (not vendored) |
| Tests/tooling | `tests/*.test.ts`, `tests/e2e/*`, `scripts/*` | 27 unit, 10 e2e |
| Docs | `docs/*` | This set |

Known gaps: additional simulator module with MediaPipe dwell/tracking is partially covered (wasm runtime copied,
detector model not vendored); physical-device performance and glasses verification pending; Visa/SideShift official
briefs unverified (see SUBMISSION).
