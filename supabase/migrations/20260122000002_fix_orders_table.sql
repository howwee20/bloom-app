-- Fix orders table conflict: old e-commerce orders vs new trading orders
-- The old orders table was renamed to orders_ecommerce_legacy by partial migration

-- Drop old indexes and policies if they exist
DROP INDEX IF EXISTS idx_orders_user_id;
DROP INDEX IF EXISTS idx_orders_status;
DROP INDEX IF EXISTS idx_orders_stripe_session;
DROP INDEX IF EXISTS orders_user_id_idx;

-- Recreate orders table with ledger engine schema
CREATE TABLE IF NOT EXISTS orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  instrument_id uuid not null references instruments (id) on delete cascade,
  side text not null check (side in ('buy', 'sell')),
  notional_cents bigint not null,
  status text not null,
  external_order_id text,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders (user_id, created_at desc);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policy
DROP POLICY IF EXISTS "orders_read_own" ON orders;
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Service role can manage orders" ON orders;

CREATE POLICY "orders_read_own"
  ON orders FOR SELECT USING (auth.uid() = user_id);
