-- Migration: Add lane selection and shipping address fields to orders
-- Lane A = Ship to customer, Lane B = Ship to Bloom Vault

-- Add lane column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS lane TEXT CHECK (lane IN ('a', 'b'));

-- Add shipping address fields for Lane A
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address_line1 TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address_line2 TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_city TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_state TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_zip TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_country TEXT DEFAULT 'US';

-- Index for lane queries
CREATE INDEX IF NOT EXISTS idx_orders_lane ON orders(lane);

-- Note: We don't add a constraint requiring shipping address for Lane A
-- because the edge function handles validation before insert.
-- This allows existing orders (before lanes) to remain valid.
