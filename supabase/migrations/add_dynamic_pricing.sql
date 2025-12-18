-- Migration: Add dynamic StockX pricing support
-- This adds price tracking, history, and StockX integration

-- 1. Add StockX integration columns to assets table
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS stockx_sku TEXT,
ADD COLUMN IF NOT EXISTS stockx_slug TEXT,
ADD COLUMN IF NOT EXISTS last_price_update TIMESTAMPTZ;

-- Note: 'price' = current market value, 'purchase_price' = entry/cost basis (already exist)

-- 2. Create price_history table for sparkline charts
CREATE TABLE IF NOT EXISTS public.price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  price NUMERIC(10, 2) NOT NULL,
  fees_estimate NUMERIC(10, 2),
  source TEXT DEFAULT 'stockx',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_price_history_asset_id ON public.price_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_price_history_created_at ON public.price_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_stockx_sku ON public.assets(stockx_sku);

-- 4. Enable RLS on price_history
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- 5. RLS policy: Anyone can read price history (public market data)
CREATE POLICY "Price history is viewable by all authenticated users"
ON public.price_history
FOR SELECT
TO authenticated
USING (true);

-- 6. RLS policy: Only service role can insert/update price history
CREATE POLICY "Service role can manage price history"
ON public.price_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 7. Function to get price history for sparklines (last 7 days)
CREATE OR REPLACE FUNCTION get_price_history(p_asset_id UUID, p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  price NUMERIC(10, 2),
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT ph.price, ph.created_at
  FROM public.price_history ph
  WHERE ph.asset_id = p_asset_id
    AND ph.created_at >= NOW() - (p_days || ' days')::INTERVAL
  ORDER BY ph.created_at ASC;
END;
$$;

-- 8. Function to get portfolio with P&L calculations
CREATE OR REPLACE FUNCTION get_portfolio_with_pnl()
RETURNS TABLE (
  id UUID,
  name TEXT,
  image_url TEXT,
  size TEXT,
  category TEXT,
  stockx_sku TEXT,
  current_price NUMERIC(10, 2),
  entry_price NUMERIC(10, 2),
  pnl_dollars NUMERIC(10, 2),
  pnl_percent NUMERIC(5, 2),
  last_price_update TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.image_url,
    a.size,
    a.category,
    a.stockx_sku,
    a.price AS current_price,
    a.purchase_price AS entry_price,
    CASE
      WHEN a.purchase_price IS NOT NULL AND a.purchase_price > 0
      THEN a.price - a.purchase_price
      ELSE NULL
    END AS pnl_dollars,
    CASE
      WHEN a.purchase_price IS NOT NULL AND a.purchase_price > 0
      THEN ROUND(((a.price - a.purchase_price) / a.purchase_price * 100)::NUMERIC, 2)
      ELSE NULL
    END AS pnl_percent,
    a.last_price_update
  FROM public.assets a
  WHERE a.owner_id = auth.uid()
  ORDER BY a.created_at DESC;
END;
$$;

-- 9. Function to get total portfolio value with P&L
CREATE OR REPLACE FUNCTION get_portfolio_summary()
RETURNS TABLE (
  total_value NUMERIC(12, 2),
  total_cost NUMERIC(12, 2),
  total_pnl_dollars NUMERIC(12, 2),
  total_pnl_percent NUMERIC(5, 2),
  asset_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_value NUMERIC(12, 2);
  v_total_cost NUMERIC(12, 2);
BEGIN
  SELECT
    COALESCE(SUM(price), 0),
    COALESCE(SUM(purchase_price), 0),
    COUNT(*)::INTEGER
  INTO v_total_value, v_total_cost
  FROM public.assets
  WHERE owner_id = auth.uid();

  RETURN QUERY
  SELECT
    v_total_value AS total_value,
    v_total_cost AS total_cost,
    CASE WHEN v_total_cost > 0 THEN v_total_value - v_total_cost ELSE NULL END AS total_pnl_dollars,
    CASE WHEN v_total_cost > 0 THEN ROUND(((v_total_value - v_total_cost) / v_total_cost * 100)::NUMERIC, 2) ELSE NULL END AS total_pnl_percent,
    (SELECT COUNT(*)::INTEGER FROM public.assets WHERE owner_id = auth.uid()) AS asset_count;
END;
$$;

-- 10. Update the Black Cat asset with StockX info
UPDATE public.assets
SET
  stockx_sku = 'FV5029-010',
  stockx_slug = 'air-jordan-4-retro-black-cat-2025'
WHERE name LIKE '%Black Cat%' AND stockx_sku IS NULL;
