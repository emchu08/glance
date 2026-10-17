# Payments

**Rails:** Visa card payments processed by Stripe; merchant commissions and transfers through Stripe Connect.
This is not a direct Visa API integration.

## Flow (verified in sandbox)

1. **Setup (once, companion/browser)** — `/wallet/setup`: Supabase Auth account → `POST /api/wallet/setup {action:"setup-intent"}`
   creates a Stripe Customer + SetupIntent (`usage: off_session`); the official Payment Element collects the card.
   Sandbox shortcut: `{action:"use-test-visa"}` attaches Stripe's documented `pm_card_visa`. We store only
   `customer id, payment method id, brand, last4, expiry, consent version`.
2. **Quote** — `POST /api/orders/quote` prices the SKUs from `merchant_catalog` on the server, returns a versioned quote
   with full total and the commission basis (`10% of item subtotal`, agreement `sandbox-2026-10-v1`), expiring in 10 min.
   The lens shows `Buy $X` only when the quote total is known; otherwise `Get total`.
3. **Order** — `POST /api/orders` creates an immutable order from a valid, unexpired quote (lines must match; one seller;
   client amounts are impossible by construction). Idempotent per quote.
4. **Buy** — `POST /api/payments/purchase {orderId, attemptKey, instruction:"buy"}`:
   re-validates quote expiry, total, stock; inserts a `payment_attempts` row (unique per order+attemptKey);
   creates and confirms a PaymentIntent with the saved method (`off_session: false` for a present wearer,
   `true` only for delegated rules), Stripe idempotency key `pi:<order>:<attempt>`.
   Destination charge (`application_fee_amount`, `transfer_data.destination`) when the merchant's Connect account has
   `charges_enabled`; otherwise a platform charge with the commission and merchant proceeds booked in `ledger_entries`.
5. **Verify** — the API result is applied immediately; `POST /api/payments/webhook` verifies the signature against the
   raw body, dedupes by event id in `provider_events`, and applies the same state machine. A verified success never
   regresses. `GET /api/orders/[id]` reconciles pending intents with Stripe (bounded polling fallback; Realtime on
   `orders` is additive).
6. **Fulfillment** — the simulated adapter accepts paid orders, decrements demo stock, records `fulfillments`.
   Payment and fulfillment are separate facts and separate lens states (`Payment confirmed` → `Order accepted`).
7. **Receipt** — compact receipt in the lens; full receipt at `/orders/[id]` (owner only); Wallet → Orders.

Recovery: decline → `payment-error` keeps the selection and offers `Try again`; stale quote/stock → `order-recovery`
with a fresh total; `requires_action` → `payment-needs-action` with a handoff to `/payments/recover/[id]`
(scoped to the authenticated owner; client secret is never shown in the lens or diagnostics).

## Verified sandbox evidence

Order `GL-VT5MN` · `pi_3URfFs0lU2xH9eJl1ZgJfGal` · $12.00 · Visa •• 4242 · `payment_status=succeeded`,
`fulfillment_status=accepted`, ledger: `commission 120`, `merchant_proceeds 1080`, tote stock 25 → 24.

## Connect configuration (honest status)

`npm run seed:sandbox` attempts a Custom connected account for Glance Demo Market using Stripe's documented test
identity data. Stripe currently refuses until the **Connect platform profile** is completed in the Dashboard
(loss liability acknowledgement). Until then the merchant row is `charge_model=platform` and the commission is
booked in the ledger instead of transferred. After completing the profile, re-run the seed: the account is
created, `charges_enabled` flips via `account.updated`, and new orders use destination charges with
`application_fee_amount`. Refunds call `refunds.create` with `refund_application_fee` and `reverse_transfer`.

## Auto-buy

Rules are off until the owner creates one (`POST /api/purchase-rules`): one seller, allow-listed SKUs, max quantity,
per-order and cumulative limits, 30-day expiry, versioned terms. Execution (`instruction:"rule"`) evaluates the pure
rule (`src/domain/commerce/rules.ts`), then `reserve_rule_budget` (row-locked RPC) reserves atomically; success
consumes, failure releases. Pause blocks new attempts and never pretends to undo a charge.

## Tests

Unit: quotes/commission rounding, rule evaluation (uncertain variant, unknown seller, budget, expiry), reducer payment
guards (no repeat submit; Buy label equals quote total; focus never defaults to Buy). E2E (HTTP): auth gates,
amount injection impossible, relay/handoff validation. Live sandbox runs are performed deliberately through the UI.
