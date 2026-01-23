-- Bloom kernel: raw events, normalized events, state machines, reconciliation, liquidation

create table if not exists raw_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_type text not null,
  external_id text not null,
  user_id uuid,
  signature text,
  headers jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  idempotency_key text
);

create unique index if not exists raw_events_idempotency_idx
  on raw_events (source, event_type, external_id);
create index if not exists raw_events_user_id_idx on raw_events (user_id);

create table if not exists normalized_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  domain text not null,
  event_type text not null,
  external_id text not null,
  user_id uuid,
  status text,
  amount_cents bigint,
  currency text not null default 'USD',
  raw_event_id uuid references raw_events (id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists normalized_events_idempotency_idx
  on normalized_events (source, event_type, external_id);
create index if not exists normalized_events_user_id_idx on normalized_events (user_id, occurred_at desc);

create table if not exists card_auths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  auth_id text not null,
  merchant_name text,
  mcc text,
  amount_cents bigint not null,
  captured_cents bigint not null default 0,
  refunded_cents bigint not null default 0,
  bridge_cents bigint not null default 0,
  status text not null,
  expires_at timestamptz,
  last_event_id uuid references normalized_events (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists card_auths_auth_id_idx on card_auths (auth_id);
create index if not exists card_auths_user_id_idx on card_auths (user_id);

create table if not exists ach_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  external_id text not null,
  amount_cents bigint not null,
  direction text not null,
  status text not null,
  occurred_at timestamptz not null default now(),
  raw_event_id uuid references raw_events (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ach_transfers_external_id_idx on ach_transfers (external_id);
create index if not exists ach_transfers_user_id_idx on ach_transfers (user_id, occurred_at desc);

alter table orders add column if not exists filled_cents bigint not null default 0;
alter table orders add column if not exists filled_qty numeric not null default 0;
alter table orders add column if not exists updated_at timestamptz not null default now();

create unique index if not exists orders_external_order_id_idx
  on orders (external_order_id) where external_order_id is not null;

create table if not exists liquidation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  reason text not null,
  required_cents bigint not null,
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists liquidation_jobs_user_id_idx on liquidation_jobs (user_id, created_at desc);

create table if not exists reconciliation_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  partner_balance_cents bigint not null,
  ledger_balance_cents bigint not null,
  drift_cents bigint not null,
  event_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reconciliation_reports_user_id_idx on reconciliation_reports (user_id, created_at desc);

create table if not exists internal_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  kind text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists internal_alerts_user_id_idx on internal_alerts (user_id, created_at desc);

create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  target_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table raw_events enable row level security;
alter table normalized_events enable row level security;
alter table card_auths enable row level security;
alter table ach_transfers enable row level security;
alter table liquidation_jobs enable row level security;
alter table reconciliation_reports enable row level security;
alter table internal_alerts enable row level security;
alter table admin_actions enable row level security;

create policy "raw_events_read_own"
  on raw_events for select using (auth.uid() = user_id);
create policy "normalized_events_read_own"
  on normalized_events for select using (auth.uid() = user_id);
create policy "card_auths_read_own"
  on card_auths for select using (auth.uid() = user_id);
create policy "ach_transfers_read_own"
  on ach_transfers for select using (auth.uid() = user_id);
create policy "liquidation_jobs_read_own"
  on liquidation_jobs for select using (auth.uid() = user_id);
create policy "reconciliation_reports_read_own"
  on reconciliation_reports for select using (auth.uid() = user_id);
create policy "internal_alerts_read_own"
  on internal_alerts for select using (auth.uid() = user_id);
