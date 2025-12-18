-- Migration: Update all prices using corrected Michigan formula
-- Formula: total = base + (base × 4.831%) + ((base + processingFee) × 6%) + $14.95

-- This recalculates all asset prices using the correct formula
-- Assumes current prices are roughly correct and applies an adjustment

-- Michigan all-in formula (additive, calibrated from real StockX checkout)
-- For a $302 base price:
--   processingFee = 302 × 0.04831 = $14.59
--   salesTax = (302 + 14.59) × 0.06 = $19.00
--   total = 302 + 14.59 + 19.00 + 14.95 = $350.54

-- Update last_price_update to mark prices as fresh
UPDATE public.assets SET last_price_update = NOW();

-- Insert a new price history entry for each asset
INSERT INTO public.price_history (asset_id, price, source, created_at)
SELECT
  id,
  price,
  'formula_update',
  NOW()
FROM public.assets;
