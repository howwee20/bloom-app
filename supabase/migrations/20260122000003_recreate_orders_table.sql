-- Drop and recreate orders table with correct schema
DROP TABLE IF EXISTS orders CASCADE;

CREATE TABLE orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  instrument_id uuid not null references instruments (id) on delete cascade,
  side text not null check (side in ('buy', 'sell')),
  notional_cents bigint not null,
  status text not null,
  external_order_id text,
  created_at timestamptz not null default now()
);

CREATE INDEX orders_user_id_idx ON orders (user_id, created_at desc);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_read_own"
  ON orders FOR SELECT USING (auth.uid() = user_id);
