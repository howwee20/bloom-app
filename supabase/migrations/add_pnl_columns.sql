-- Migration: Add P&L tracking columns to assets table
-- This adds purchase_price (cost basis) and brand columns

-- 1. Add purchase_price column (cost basis - what was paid for the asset)
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(10, 2);

-- 2. Add brand column (e.g., Jordan, Nike, Adidas)
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS brand TEXT;

-- 3. Create index on brand for faster filtering
CREATE INDEX IF NOT EXISTS idx_assets_brand ON public.assets(brand);

-- Note: The existing `price` column serves as the current market value
-- P&L calculation: price - purchase_price = unrealized gain/loss
