# Accounts and data

## Identity map

| Thing | Where | Notes |
| --- | --- | --- |
| Glance user | Supabase Auth (`auth.users`) + `profiles` | Email/password; sign-up created server-side with `email_confirm` so the demo does not depend on mail delivery |
| Meta device registration/session | `devices` (`registration_ref`, `session_scope`, `pairing_code`) | DAT exposes no Meta account identity, saved cards, or billing; we store device/session metadata only |
| Stripe customer / payment method | `wallets` | Customer id, method id, masked brand/last4/expiry, consent version. Never PAN/CVC |
| Purchase permission | `purchase_rules`, `rule_events` | Versioned terms, allowlists, limits, reservations |
| Orders | `quotes` → `orders` → `order_lines`, `payment_attempts`, `fulfillments`, `refunds` | Immutable lines; separate payment and fulfillment facts |
| Revenue | `ledger_entries` | commission / processor_fee / merchant_proceeds / refund / fee_reversal / ad_cpc / ad_cpa |
| Providers | `provider_events`, `outbox` | Webhook dedupe; durable jobs for fulfillment, ad conversions |
| Advertising | `advertisers`, `campaigns`, `ad_events`, `ad_invoices` | Impressions ≠ clicks ≠ conversions; signed single-use tokens |

## RLS policy matrix

Every exposed table has RLS enabled. Owners `select` their own rows (profiles, devices, wallets, rules, quotes,
orders, lines, attempts, fulfillments, refunds). Profiles allow owner insert/update (name, delivery). Merchants and
active catalog rows are publicly readable (anonymous browsing). Merchant members read their merchant's orders and
ledger; advertiser members read their campaigns, events and invoices. `provider_events` and `outbox` have no
client policies. All commerce writes happen server-side with the secret key after explicit owner/order checks;
budget reservations use `security definer` RPCs revoked from `anon`/`authenticated`.

## Secret boundaries

Clients receive only publishable keys. `SUPABASE_SECRET_KEY`, `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`,
`ANTHROPIC_API_KEY`, `AD_ATTRIBUTION_SECRET`, `RELAY_SECRET` are read in `src/server/env.ts` (`server-only`).
Diagnostics never include credentials, client secrets, or card data. Browser mutations are same-origin checked.

## Realtime and reconnect

`orders` is in the `supabase_realtime` publication; owner RLS filters rows. The lens uses bounded polling of
`GET /api/orders/[id]` (1.5 s, ≤ 90 s) which reconciles with Stripe; on reconnect the durable order is the truth and
a Buy is never resubmitted. Sign-out removes session cookies; removing the card pauses active rules.

## Retention and deletion

Pairing 30 min · frames 20 s · handoff links 1 h · quotes 10 min. Orders, attempts, refunds, ledgers persist as
financial records. Deleting the wallet detaches the Stripe method and pauses rules; it does not delete or cancel
pending orders or charges, and the UI says so.
