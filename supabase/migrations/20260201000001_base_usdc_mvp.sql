-- Base USDC rail MVP tables

create table if not exists wallets (
  user_id uuid primary key,
  address text not null unique,
  custody_type text not null check (custody_type in ('embedded', 'server', 'external')),
  created_at timestamptz not null default now()
);

create table if not exists user_flags (
  user_id uuid primary key,
  frozen boolean not null default false,
  freeze_reason text,
  updated_at timestamptz not null default now()
);

create table if not exists agent_tokens (
  agent_id text primary key,
  user_id uuid not null,
  scopes_json jsonb not null default '{}'::jsonb,
  status text not null check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists agent_tokens_user_id_idx on agent_tokens (user_id);

create table if not exists quotes (
  quote_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  agent_id text not null,
  intent_json jsonb not null,
  allowed boolean not null,
  requires_step_up boolean not null,
  reason text,
  expires_at timestamptz not null,
  idempotency_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists quotes_idempotency_idx
  on quotes (user_id, agent_id, idempotency_key);
create index if not exists quotes_user_id_idx on quotes (user_id, created_at desc);

create table if not exists executions (
  exec_id uuid primary key default gen_random_uuid(),
  quote_id uuid references quotes (quote_id) on delete set null,
  user_id uuid not null,
  agent_id text not null,
  status text not null check (status in ('queued', 'broadcast', 'confirmed', 'failed', 'canceled')),
  amount_cents bigint not null default 0,
  tx_hash text,
  failure_reason text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists executions_quote_id_idx on executions (quote_id);
create unique index if not exists executions_idempotency_idx
  on executions (user_id, agent_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists onchain_transfers (
  chain_id text not null,
  block_number bigint not null,
  tx_hash text not null,
  log_index integer not null,
  from_address text not null,
  to_address text not null,
  amount_cents bigint not null,
  token_address text not null,
  occurred_at timestamptz not null,
  confirmed boolean not null default false,
  confirmations integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists onchain_transfers_unique_idx
  on onchain_transfers (tx_hash, log_index);
create index if not exists onchain_transfers_address_idx
  on onchain_transfers (from_address, to_address, occurred_at desc);

create table if not exists rpc_health (
  provider_name text primary key,
  status text not null check (status in ('fresh', 'stale', 'unknown')),
  last_ok_at timestamptz,
  last_head_block bigint,
  last_head_time timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists onchain_cursor (
  chain_id text primary key,
  last_indexed_block bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table receipts add column if not exists tx_hash text;

alter table spend_power_snapshots add column if not exists confirmed_balance_cents bigint;

alter table wallets enable row level security;
alter table user_flags enable row level security;
alter table agent_tokens enable row level security;
alter table quotes enable row level security;
alter table executions enable row level security;
alter table onchain_transfers enable row level security;
alter table rpc_health enable row level security;

create policy "wallets_read_own"
  on wallets for select using (auth.uid() = user_id);
create policy "user_flags_read_own"
  on user_flags for select using (auth.uid() = user_id);
create policy "agent_tokens_read_own"
  on agent_tokens for select using (auth.uid() = user_id);
create policy "quotes_read_own"
  on quotes for select using (auth.uid() = user_id);
create policy "executions_read_own"
  on executions for select using (auth.uid() = user_id);
create policy "rpc_health_read_all"
  on rpc_health for select using (true);
