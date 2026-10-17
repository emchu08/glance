-- Glance · identity, wallet references, commerce, advertising
-- Card credentials never live here: Stripe holds PAN/CVC; we store customer/method references and masked metadata.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Identity & devices
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  delivery jsonb,                      -- private delivery/contact record (owner-only)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('meta_display','meta_camera','browser','phone')),
  label text,
  registration_ref text,               -- DAT device/session identifier when exposed; never a Meta account id
  session_scope text,                  -- high-entropy scoped credential hash
  pairing_code text,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists devices_owner_idx on public.devices(owner_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Wallet references (Stripe customer + default saved method, masked)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.wallets (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  default_payment_method_id text,
  brand text,
  last4 text check (last4 is null or length(last4) = 4),
  exp_month int,
  exp_year int,
  consent_version text,
  consent_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-buy purchase rules, authorization events, reservations
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.purchase_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  version int not null default 1,
  status text not null default 'active' check (status in ('active','paused','revoked','expired')),
  merchant_allowlist text[] not null default '{}',
  sku_allowlist text[] not null default '{}',
  max_quantity int not null default 1,
  per_order_limit_cents int not null,
  cumulative_limit_cents int not null,
  spent_cents int not null default 0,
  reserved_cents int not null default 0,
  currency text not null default 'USD',
  delivery jsonb,
  trigger text not null default 'replenishment',
  min_confidence numeric not null default 0.9,
  payment_method_id text,
  terms jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchase_rules_owner_idx on public.purchase_rules(owner_id, status);

create table if not exists public.rule_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.purchase_rules(id) on delete cascade,
  owner_id uuid not null,
  kind text not null check (kind in ('created','paused','resumed','revoked','reserved','released','consumed','rejected')),
  order_id uuid,
  amount_cents int,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rule_events_rule_idx on public.rule_events(rule_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Merchants (Stripe Connect), catalog, roles
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.merchants (
  id text primary key,
  name text not null,
  stripe_account_id text unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  charge_model text not null default 'destination' check (charge_model in ('destination','platform')),
  commission_bps int not null default 1000,
  agreement_version text not null default 'sandbox-2026-10-v1',
  fulfillment_adapter text not null default 'simulated',
  sandbox boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.merchant_catalog (
  merchant_id text not null references public.merchants(id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  unit_price_cents int not null check (unit_price_cents >= 0),
  currency text not null default 'USD',
  stock int not null default 0,
  price_version int not null default 1,
  active boolean not null default true,
  primary key (merchant_id, sku)
);

create table if not exists public.merchant_members (
  merchant_id text not null references public.merchants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  primary key (merchant_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Quotes, orders, lines, payments, fulfillment, refunds, ledger
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.quotes (
  version text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  merchant_id text not null references public.merchants(id),
  lines jsonb not null,
  subtotal_cents int not null,
  shipping_cents int not null default 0,
  tax_cents int not null default 0,
  total_cents int not null,
  currency text not null default 'USD',
  commission_bps int not null,
  commission_cents int not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists quotes_owner_idx on public.quotes(owner_id, created_at desc);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  merchant_id text not null references public.merchants(id),
  quote_version text references public.quotes(version),
  status text not null default 'created' check (status in ('created','paying','paid','accepted','failed','canceled','refunded')),
  payment_status text not null default 'pending' check (payment_status in ('pending','processing','requires_action','succeeded','failed','canceled','refunded')),
  fulfillment_status text not null default 'pending' check (fulfillment_status in ('pending','accepted','fulfilled','canceled','failed')),
  subtotal_cents int not null,
  shipping_cents int not null default 0,
  tax_cents int not null default 0,
  total_cents int not null,
  currency text not null default 'USD',
  commission_bps int not null,
  commission_cents int not null,
  commission_version text not null,
  stripe_payment_intent_id text unique,
  card_summary text,
  source_mode text,
  device_id uuid references public.devices(id),
  rule_id uuid references public.purchase_rules(id),
  sponsored_campaign_id text,
  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_owner_idx on public.orders(owner_id, created_at desc);
create index if not exists orders_merchant_idx on public.orders(merchant_id, created_at desc);
create index if not exists orders_status_idx on public.orders(payment_status, fulfillment_status);

create table if not exists public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sku text not null,
  name text not null,
  quantity int not null check (quantity > 0),
  unit_price_cents int not null,
  line_total_cents int not null
);
create index if not exists order_lines_order_idx on public.order_lines(order_id);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  owner_id uuid not null,
  attempt_key text not null,
  stripe_payment_intent_id text,
  status text not null default 'created',
  error text,
  created_at timestamptz not null default now(),
  unique (order_id, attempt_key)
);

create table if not exists public.fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','fulfilled','canceled','failed')),
  adapter text not null default 'simulated',
  merchant_ref text,
  detail jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  stripe_refund_id text unique,
  amount_cents int not null,
  fee_refund_cents int not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  merchant_id text references public.merchants(id),
  kind text not null check (kind in ('commission','processor_fee','merchant_proceeds','refund','fee_reversal','transfer_reversal','ad_cpc','ad_cpa','ad_adjustment')),
  amount_cents int not null,
  currency text not null default 'USD',
  sandbox boolean not null default true,
  idempotency_key text unique,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ledger_order_idx on public.ledger_entries(order_id);
create index if not exists ledger_merchant_idx on public.ledger_entries(merchant_id, created_at desc);

create table if not exists public.provider_events (
  id text primary key,                 -- Stripe event id (dedupe)
  provider text not null default 'stripe',
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload jsonb
);

create table if not exists public.outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null,
  attempts int not null default 0,
  next_run_at timestamptz not null default now(),
  done_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists outbox_due_idx on public.outbox(next_run_at) where done_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Advertising: advertisers, campaigns, qualified events, invoices
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.advertisers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stripe_customer_id text unique,
  agreement_version text not null default 'sandbox-ads-2026-10-v1',
  sandbox boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.advertiser_members (
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  primary key (advertiser_id, user_id)
);

create table if not exists public.campaigns (
  id text primary key,
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,
  model text not null check (model in ('cpc','cpa')),
  cpc_cents int,
  cpa_rate_bps int,
  budget_cents int not null,
  spent_cents int not null default 0,
  reserved_cents int not null default 0,
  daily_cap_cents int,
  currency text not null default 'USD',
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active','paused','ended')),
  markets text[] not null default '{US}',
  categories text[] not null default '{}',
  destination_url text,
  merchant_id text references public.merchants(id),
  sku text,
  query_terms text[] not null default '{}',
  title text not null,
  agreement_ref text,
  created_at timestamptz not null default now()
);

create table if not exists public.ad_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.campaigns(id) on delete cascade,
  kind text not null check (kind in ('impression','click','conversion','adjustment')),
  token_id text unique,                -- signed attribution token id (dedupe)
  owner_id uuid,
  order_id uuid references public.orders(id) on delete set null,
  billable boolean not null default false,
  reason text,
  amount_cents int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ad_events_campaign_idx on public.ad_events(campaign_id, created_at desc);

create table if not exists public.ad_invoices (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  stripe_invoice_id text unique,
  total_cents int not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  unique (advertiser_id, period_start, period_end)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security: owners read their own rows; all writes to commerce state
-- happen server-side with the secret key after explicit authorization checks.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.wallets enable row level security;
alter table public.purchase_rules enable row level security;
alter table public.rule_events enable row level security;
alter table public.merchants enable row level security;
alter table public.merchant_catalog enable row level security;
alter table public.merchant_members enable row level security;
alter table public.quotes enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.fulfillments enable row level security;
alter table public.refunds enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.provider_events enable row level security;
alter table public.outbox enable row level security;
alter table public.advertisers enable row level security;
alter table public.advertiser_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.ad_events enable row level security;
alter table public.ad_invoices enable row level security;

create policy "profiles owner read" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles owner update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles owner insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);

create policy "devices owner read" on public.devices for select to authenticated using ((select auth.uid()) = owner_id);
create policy "wallets owner read" on public.wallets for select to authenticated using ((select auth.uid()) = owner_id);
create policy "rules owner read" on public.purchase_rules for select to authenticated using ((select auth.uid()) = owner_id);
create policy "rule events owner read" on public.rule_events for select to authenticated using ((select auth.uid()) = owner_id);

create policy "merchants public read" on public.merchants for select to anon, authenticated using (true);
create policy "catalog public read" on public.merchant_catalog for select to anon, authenticated using (active);
create policy "merchant members self read" on public.merchant_members for select to authenticated using ((select auth.uid()) = user_id);

create policy "quotes owner read" on public.quotes for select to authenticated using ((select auth.uid()) = owner_id);
create policy "orders owner read" on public.orders for select to authenticated using ((select auth.uid()) = owner_id);
create policy "orders merchant read" on public.orders for select to authenticated using (exists (select 1 from public.merchant_members m where m.merchant_id = orders.merchant_id and m.user_id = (select auth.uid())));
create policy "order lines owner read" on public.order_lines for select to authenticated using (exists (select 1 from public.orders o where o.id = order_lines.order_id and (o.owner_id = (select auth.uid()) or exists (select 1 from public.merchant_members m where m.merchant_id = o.merchant_id and m.user_id = (select auth.uid())))));
create policy "attempts owner read" on public.payment_attempts for select to authenticated using ((select auth.uid()) = owner_id);
create policy "fulfillments owner read" on public.fulfillments for select to authenticated using (exists (select 1 from public.orders o where o.id = fulfillments.order_id and o.owner_id = (select auth.uid())));
create policy "refunds owner read" on public.refunds for select to authenticated using (exists (select 1 from public.orders o where o.id = refunds.order_id and o.owner_id = (select auth.uid())));
create policy "ledger merchant read" on public.ledger_entries for select to authenticated using (exists (select 1 from public.merchant_members m where m.merchant_id = ledger_entries.merchant_id and m.user_id = (select auth.uid())));

create policy "advertiser members self read" on public.advertiser_members for select to authenticated using ((select auth.uid()) = user_id);
create policy "advertisers member read" on public.advertisers for select to authenticated using (exists (select 1 from public.advertiser_members a where a.advertiser_id = advertisers.id and a.user_id = (select auth.uid())));
create policy "campaigns member read" on public.campaigns for select to authenticated using (exists (select 1 from public.advertiser_members a where a.advertiser_id = campaigns.advertiser_id and a.user_id = (select auth.uid())));
create policy "ad events member read" on public.ad_events for select to authenticated using (exists (select 1 from public.campaigns c join public.advertiser_members a on a.advertiser_id = c.advertiser_id where c.id = ad_events.campaign_id and a.user_id = (select auth.uid())));
create policy "ad invoices member read" on public.ad_invoices for select to authenticated using (exists (select 1 from public.advertiser_members a where a.advertiser_id = ad_invoices.advertiser_id and a.user_id = (select auth.uid())));

-- provider_events and outbox: server-only (no policies → no client access).

-- Realtime: owners subscribe to their own orders (RLS filters rows).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- updated_at triggers
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
drop trigger if exists rules_touch on public.purchase_rules;
create trigger rules_touch before update on public.purchase_rules for each row execute function public.touch_updated_at();
drop trigger if exists wallets_touch on public.wallets;
create trigger wallets_touch before update on public.wallets for each row execute function public.touch_updated_at();

-- Atomic budget reservation for auto-buy rules (server-only RPC).
create or replace function public.reserve_rule_budget(p_rule_id uuid, p_amount int, p_order_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.purchase_rules%rowtype;
begin
  select * into r from public.purchase_rules where id = p_rule_id for update;
  if not found or r.status <> 'active' or r.expires_at <= now() then return false; end if;
  if r.spent_cents + r.reserved_cents + p_amount > r.cumulative_limit_cents then return false; end if;
  if p_amount > r.per_order_limit_cents then return false; end if;
  update public.purchase_rules set reserved_cents = reserved_cents + p_amount where id = p_rule_id;
  insert into public.rule_events(rule_id, owner_id, kind, order_id, amount_cents) values (p_rule_id, r.owner_id, 'reserved', p_order_id, p_amount);
  return true;
end $$;
revoke all on function public.reserve_rule_budget(uuid, int, uuid) from public, anon, authenticated;

create or replace function public.settle_rule_reservation(p_rule_id uuid, p_amount int, p_order_id uuid, p_consume boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.purchase_rules%rowtype;
begin
  select * into r from public.purchase_rules where id = p_rule_id for update;
  if not found then return; end if;
  if p_consume then
    update public.purchase_rules set reserved_cents = greatest(0, reserved_cents - p_amount), spent_cents = spent_cents + p_amount where id = p_rule_id;
    insert into public.rule_events(rule_id, owner_id, kind, order_id, amount_cents) values (p_rule_id, r.owner_id, 'consumed', p_order_id, p_amount);
  else
    update public.purchase_rules set reserved_cents = greatest(0, reserved_cents - p_amount) where id = p_rule_id;
    insert into public.rule_events(rule_id, owner_id, kind, order_id, amount_cents) values (p_rule_id, r.owner_id, 'released', p_order_id, p_amount);
  end if;
end $$;
revoke all on function public.settle_rule_reservation(uuid, int, uuid, boolean) from public, anon, authenticated;

-- Atomic campaign budget reservation for CPC/CPA billing (server-only RPC).
create or replace function public.reserve_campaign_budget(p_campaign_id text, p_amount int)
returns boolean language plpgsql security definer set search_path = public as $$
declare c public.campaigns%rowtype;
begin
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found or c.status <> 'active' or now() < c.starts_at or now() > c.ends_at then return false; end if;
  if c.spent_cents + c.reserved_cents + p_amount > c.budget_cents then return false; end if;
  update public.campaigns set spent_cents = spent_cents + p_amount where id = p_campaign_id;
  return true;
end $$;
revoke all on function public.reserve_campaign_budget(text, int) from public, anon, authenticated;
