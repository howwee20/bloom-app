-- Bloom ledger + engine tables
create extension if not exists "pgcrypto";

create table if not exists ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  currency text not null default 'USD',
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists ledger_accounts_user_id_idx on ledger_accounts (user_id);
create unique index if not exists ledger_accounts_user_kind_idx on ledger_accounts (user_id, kind);

create table if not exists ledger_journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  external_source text not null,
  external_id text not null,
  memo text
);

create unique index if not exists ledger_journal_entries_external_idx
  on ledger_journal_entries (external_source, external_id);
create index if not exists ledger_journal_entries_user_id_idx on ledger_journal_entries (user_id);

create table if not exists ledger_postings (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references ledger_journal_entries (id) on delete cascade,
  ledger_account_id uuid not null references ledger_accounts (id) on delete cascade,
  direction text not null check (direction in ('debit', 'credit')),
  amount_cents bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists ledger_postings_entry_idx on ledger_postings (journal_entry_id);
create index if not exists ledger_postings_account_idx on ledger_postings (ledger_account_id);

create table if not exists card_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  merchant_name text not null,
  mcc text,
  amount_cents bigint not null,
  status text not null check (status in ('active', 'released', 'captured', 'expired')),
  external_auth_id text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists card_holds_external_auth_idx on card_holds (external_auth_id);
create index if not exists card_holds_user_id_idx on card_holds (user_id);

create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  title text not null,
  subtitle text,
  amount_cents bigint not null,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists receipts_user_id_idx on receipts (user_id, occurred_at desc);

create table if not exists policy (
  user_id uuid primary key,
  buffer_cents bigint,
  buffer_percent numeric,
  liquidation_order_json jsonb not null default '[]'::jsonb,
  bridge_enabled_bool boolean not null default false
);

create table if not exists instruments (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  type text not null,
  quote_source text,
  created_at timestamptz not null default now()
);

create table if not exists positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  instrument_id uuid not null references instruments (id) on delete cascade,
  qty numeric not null default 0,
  cost_basis_cents bigint not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists positions_user_instrument_idx on positions (user_id, instrument_id);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  instrument_id uuid not null references instruments (id) on delete cascade,
  side text not null check (side in ('buy', 'sell')),
  notional_cents bigint not null,
  status text not null,
  external_order_id text,
  created_at timestamptz not null default now()
);

create index if not exists orders_user_id_idx on orders (user_id, created_at desc);

alter table ledger_accounts enable row level security;
alter table ledger_journal_entries enable row level security;
alter table ledger_postings enable row level security;
alter table card_holds enable row level security;
alter table receipts enable row level security;
alter table policy enable row level security;
alter table instruments enable row level security;
alter table positions enable row level security;
alter table orders enable row level security;

create policy "ledger_accounts_read_own"
  on ledger_accounts for select using (auth.uid() = user_id);
create policy "ledger_journal_entries_read_own"
  on ledger_journal_entries for select using (auth.uid() = user_id);
create policy "ledger_postings_read_own"
  on ledger_postings for select using (
    exists (
      select 1
      from ledger_accounts la
      where la.id = ledger_postings.ledger_account_id
        and la.user_id = auth.uid()
    )
  );
create policy "card_holds_read_own"
  on card_holds for select using (auth.uid() = user_id);
create policy "receipts_read_own"
  on receipts for select using (auth.uid() = user_id);
create policy "policy_read_own"
  on policy for select using (auth.uid() = user_id);
create policy "positions_read_own"
  on positions for select using (auth.uid() = user_id);
create policy "orders_read_own"
  on orders for select using (auth.uid() = user_id);
