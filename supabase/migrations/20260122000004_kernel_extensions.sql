-- Kernel extensions: orders columns, external links, metrics, allocation targets

alter table orders add column if not exists filled_cents bigint not null default 0;
alter table orders add column if not exists filled_qty numeric not null default 0;
alter table orders add column if not exists updated_at timestamptz not null default now();

create unique index if not exists orders_external_order_id_idx
  on orders (external_order_id) where external_order_id is not null;

alter table policy add column if not exists allocation_targets_json jsonb not null default '{}'::jsonb;

create table if not exists external_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  entity_id text,
  bank_account_id text,
  card_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists external_links_user_provider_idx on external_links (user_id, provider);

alter table external_links enable row level security;
create policy "external_links_read_own"
  on external_links for select using (auth.uid() = user_id);

create table if not exists metrics_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  metric_name text not null,
  metric_value numeric not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists metrics_snapshots_user_id_idx on metrics_snapshots (user_id, created_at desc);

alter table metrics_snapshots enable row level security;
create policy "metrics_snapshots_read_own"
  on metrics_snapshots for select using (auth.uid() = user_id);
