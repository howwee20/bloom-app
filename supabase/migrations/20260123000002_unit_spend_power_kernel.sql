-- Unit spend power kernel tables + extensions

alter table raw_events add column if not exists provider text;
alter table raw_events add column if not exists provider_event_id text;
alter table raw_events add column if not exists type text;
alter table raw_events add column if not exists occurred_at timestamptz;
alter table raw_events add column if not exists processed_at timestamptz;
alter table raw_events add column if not exists processing_error text;

update raw_events
  set provider = source,
      provider_event_id = external_id,
      type = event_type
  where provider is null
     or provider_event_id is null
     or type is null;

create unique index if not exists raw_events_provider_event_id_idx
  on raw_events (provider_event_id)
  where provider = 'unit';

create table if not exists feed_health (
  feed_name text primary key,
  last_event_received_at timestamptz not null,
  last_event_occurred_at timestamptz,
  status text not null default 'unknown' check (status in ('fresh', 'stale', 'unknown')),
  updated_at timestamptz not null default now()
);

create table if not exists auth_holds (
  hold_id text primary key,
  account_id text,
  user_id uuid not null,
  amount_cents bigint not null,
  currency text not null default 'USD',
  merchant_name text,
  mcc text,
  merchant_id text,
  status text not null check (status in ('active', 'declined', 'canceled', 'expired', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_event_occurred_at timestamptz,
  raw_authorization_json jsonb
);

create index if not exists auth_holds_user_id_idx on auth_holds (user_id, updated_at desc);
create index if not exists auth_holds_account_id_idx on auth_holds (account_id);

create table if not exists transactions (
  transaction_id text primary key,
  account_id text,
  user_id uuid not null,
  amount_cents bigint not null,
  currency text not null default 'USD',
  direction text,
  status text,
  created_at timestamptz not null,
  related_authorization_id text,
  raw_transaction_json jsonb
);

create index if not exists transactions_user_id_idx on transactions (user_id, created_at desc);
create index if not exists transactions_account_id_idx on transactions (account_id);

create table if not exists reserves (
  reserve_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount_cents bigint not null,
  reason text not null,
  status text not null check (status in ('active', 'released', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  external_ref text
);

create index if not exists reserves_user_id_idx on reserves (user_id, status);

alter table receipts add column if not exists receipt_id uuid generated always as (id) stored;
alter table receipts add column if not exists source text;
alter table receipts add column if not exists provider_event_id text;
alter table receipts add column if not exists related_hold_id text;
alter table receipts add column if not exists related_transaction_id text;
alter table receipts add column if not exists delta_spend_power_cents bigint;
alter table receipts add column if not exists what_happened text;
alter table receipts add column if not exists why_changed text;
alter table receipts add column if not exists what_happens_next text;
alter table receipts add column if not exists fix_cta text;

create unique index if not exists receipts_receipt_id_idx on receipts (receipt_id);
create index if not exists receipts_provider_event_id_idx on receipts (provider_event_id);

create table if not exists issues (
  issue_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  category text not null check (category in ('looks_wrong', 'fraud', 'dispute', 'error')),
  status text not null check (status in ('opened', 'triaging', 'submitted', 'waiting', 'resolved')),
  related_transaction_id text,
  related_hold_id text,
  description text not null,
  evidence_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists issues_user_id_idx on issues (user_id, updated_at desc);

create table if not exists spend_power_snapshots (
  user_id uuid primary key,
  settled_cash_cents bigint not null,
  active_holds_cents bigint not null,
  active_reserves_cents bigint not null,
  safety_buffer_cents bigint not null,
  degradation_buffer_cents bigint not null,
  spend_power_cents bigint not null,
  freshness_status text not null,
  computed_at timestamptz not null default now()
);

create table if not exists reconciliation_mismatches (
  mismatch_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id text,
  transaction_id text,
  kind text not null,
  details_json jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now()
);

create index if not exists reconciliation_mismatches_user_id_idx on reconciliation_mismatches (user_id, detected_at desc);

alter table policy add column if not exists safety_buffer_cents bigint;
alter table policy add column if not exists degradation_buffer_cents bigint;

alter table feed_health enable row level security;
alter table auth_holds enable row level security;
alter table transactions enable row level security;
alter table reserves enable row level security;
alter table issues enable row level security;
alter table spend_power_snapshots enable row level security;
alter table reconciliation_mismatches enable row level security;

create policy "feed_health_read_all"
  on feed_health for select using (true);
create policy "auth_holds_read_own"
  on auth_holds for select using (auth.uid() = user_id);
create policy "transactions_read_own"
  on transactions for select using (auth.uid() = user_id);
create policy "reserves_read_own"
  on reserves for select using (auth.uid() = user_id);
create policy "issues_read_own"
  on issues for select using (auth.uid() = user_id);
create policy "spend_power_snapshots_read_own"
  on spend_power_snapshots for select using (auth.uid() = user_id);
create policy "reconciliation_mismatches_read_own"
  on reconciliation_mismatches for select using (auth.uid() = user_id);
