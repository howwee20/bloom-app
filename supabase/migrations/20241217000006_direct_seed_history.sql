-- Migration: Direct Seed Price History
-- Inserts price history data directly using SQL

-- First, ensure RLS is temporarily disabled for this operation
ALTER TABLE price_history DISABLE ROW LEVEL SECURITY;

-- Clear any existing data
DELETE FROM price_history;

-- Insert 7 days of history for each asset
-- Day 0 (today at noon)
INSERT INTO price_history (asset_id, price, source, created_at)
SELECT
  id,
  ROUND((price * (1 + (random() * 0.03 - 0.015)))::NUMERIC, 2),
  'baseline',
  NOW()::DATE + INTERVAL '12 hours'
FROM assets;

-- Day 1
INSERT INTO price_history (asset_id, price, source, created_at)
SELECT
  id,
  ROUND((price * (1 + (random() * 0.03 - 0.015)))::NUMERIC, 2),
  'alive_protocol',
  (NOW() - INTERVAL '1 day')::DATE + INTERVAL '12 hours'
FROM assets;

-- Day 2
INSERT INTO price_history (asset_id, price, source, created_at)
SELECT
  id,
  ROUND((price * (1 + (random() * 0.03 - 0.015)))::NUMERIC, 2),
  'alive_protocol',
  (NOW() - INTERVAL '2 days')::DATE + INTERVAL '12 hours'
FROM assets;

-- Day 3
INSERT INTO price_history (asset_id, price, source, created_at)
SELECT
  id,
  ROUND((price * (1 + (random() * 0.03 - 0.015)))::NUMERIC, 2),
  'alive_protocol',
  (NOW() - INTERVAL '3 days')::DATE + INTERVAL '12 hours'
FROM assets;

-- Day 4
INSERT INTO price_history (asset_id, price, source, created_at)
SELECT
  id,
  ROUND((price * (1 + (random() * 0.03 - 0.015)))::NUMERIC, 2),
  'alive_protocol',
  (NOW() - INTERVAL '4 days')::DATE + INTERVAL '12 hours'
FROM assets;

-- Day 5
INSERT INTO price_history (asset_id, price, source, created_at)
SELECT
  id,
  ROUND((price * (1 + (random() * 0.03 - 0.015)))::NUMERIC, 2),
  'alive_protocol',
  (NOW() - INTERVAL '5 days')::DATE + INTERVAL '12 hours'
FROM assets;

-- Day 6
INSERT INTO price_history (asset_id, price, source, created_at)
SELECT
  id,
  ROUND((price * (1 + (random() * 0.03 - 0.015)))::NUMERIC, 2),
  'alive_protocol',
  (NOW() - INTERVAL '6 days')::DATE + INTERVAL '12 hours'
FROM assets;

-- Day 7
INSERT INTO price_history (asset_id, price, source, created_at)
SELECT
  id,
  ROUND((price * (1 + (random() * 0.03 - 0.015)))::NUMERIC, 2),
  'alive_protocol',
  (NOW() - INTERVAL '7 days')::DATE + INTERVAL '12 hours'
FROM assets;

-- Re-enable RLS
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Update all assets with last_price_update timestamp
UPDATE assets SET last_price_update = NOW();
