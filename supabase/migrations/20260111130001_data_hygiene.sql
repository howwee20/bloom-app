-- Data hygiene: fix existing bad data for cost basis and location

-- 1. Fix any catalog-added items that somehow got location='bloom'
-- BLOOM should only be set via closed-pipe flows (buy->ship to bloom)
UPDATE public.assets
SET location = 'home'
WHERE location = 'bloom'
  AND catalog_item_id IS NOT NULL;

-- 2. Baseline cost basis for existing items that have price but no purchase_price
-- This ensures existing items show P/L ticker line
UPDATE public.assets
SET purchase_price = price
WHERE price IS NOT NULL
  AND price > 0
  AND purchase_price IS NULL
  AND stockx_sku IS NOT NULL;

-- 3. Convert purchase_price = 0 to NULL
-- Let the auto_baseline_cost_basis trigger handle it on next price update
UPDATE public.assets
SET purchase_price = NULL
WHERE purchase_price = 0;
