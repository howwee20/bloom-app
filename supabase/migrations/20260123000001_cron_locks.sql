create table if not exists cron_locks (
  lock_key text primary key,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb
);

create index if not exists cron_locks_expires_at_idx on cron_locks (expires_at);

alter table cron_locks enable row level security;
