-- Migration: Enhanced Price Tracking for Coinbase-Style Display
-- Adds functions for price changes, 24h deltas, and market data

-- 1. Function to get asset with price change (24h)
CREATE OR REPLACE FUNCTION get_asset_with_price_change(p_asset_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  image_url TEXT,
  price NUMERIC(10, 2),
  size TEXT,
  category TEXT,
  brand TEXT,
  stockx_sku TEXT,
  last_price_update TIMESTAMPTZ,
  price_24h_ago NUMERIC(10, 2),
  price_change NUMERIC(10, 2),
  price_change_percent NUMERIC(6, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price_24h_ago NUMERIC(10, 2);
BEGIN
  -- Get price from ~24 hours ago
  SELECT ph.price INTO v_price_24h_ago
  FROM public.price_history ph
  WHERE ph.asset_id = p_asset_id
    AND ph.created_at <= NOW() - INTERVAL '24 hours'
  ORDER BY ph.created_at DESC
  LIMIT 1;

  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.image_url,
    a.price,
    a.size,
    a.category,
    a.brand,
    a.stockx_sku,
    a.last_price_update,
    COALESCE(v_price_24h_ago, a.price) AS price_24h_ago,
    CASE
      WHEN v_price_24h_ago IS NOT NULL
      THEN a.price - v_price_24h_ago
      ELSE 0
    END AS price_change,
    CASE
      WHEN v_price_24h_ago IS NOT NULL AND v_price_24h_ago > 0
      THEN ROUND(((a.price - v_price_24h_ago) / v_price_24h_ago * 100)::NUMERIC, 2)
      ELSE 0
    END AS price_change_percent
  FROM public.assets a
  WHERE a.id = p_asset_id;
END;
$$;

-- 2. Function to get all market assets with price changes (for Bloom/Explore screen)
CREATE OR REPLACE FUNCTION get_market_assets_with_changes()
RETURNS TABLE (
  id UUID,
  name TEXT,
  image_url TEXT,
  price NUMERIC(10, 2),
  size TEXT,
  category TEXT,
  brand TEXT,
  status TEXT,
  last_price_update TIMESTAMPTZ,
  price_change NUMERIC(10, 2),
  price_change_percent NUMERIC(6, 2)
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
    a.price,
    a.size,
    a.category,
    a.brand,
    a.status,
    a.last_price_update,
    COALESCE(
      a.price - (
        SELECT ph.price
        FROM public.price_history ph
        WHERE ph.asset_id = a.id
          AND ph.created_at <= NOW() - INTERVAL '24 hours'
        ORDER BY ph.created_at DESC
        LIMIT 1
      ),
      0
    ) AS price_change,
    COALESCE(
      ROUND(
        ((a.price - (
          SELECT ph.price
          FROM public.price_history ph
          WHERE ph.asset_id = a.id
            AND ph.created_at <= NOW() - INTERVAL '24 hours'
          ORDER BY ph.created_at DESC
          LIMIT 1
        )) / NULLIF((
          SELECT ph.price
          FROM public.price_history ph
          WHERE ph.asset_id = a.id
            AND ph.created_at <= NOW() - INTERVAL '24 hours'
          ORDER BY ph.created_at DESC
          LIMIT 1
        ), 0) * 100)::NUMERIC,
        2
      ),
      0
    ) AS price_change_percent
  FROM public.assets a
  WHERE a.status = 'listed' OR a.owner_id IS NULL
  ORDER BY a.created_at DESC;
END;
$$;

-- 3. Function to get price history for sparkline charts (optimized)
CREATE OR REPLACE FUNCTION get_price_history_for_chart(p_asset_id UUID, p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  price NUMERIC(10, 2),
  recorded_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ph.price,
    ph.created_at AS recorded_at
  FROM public.price_history ph
  WHERE ph.asset_id = p_asset_id
    AND ph.created_at >= NOW() - (p_days || ' days')::INTERVAL
  ORDER BY ph.created_at ASC;
END;
$$;

-- 4. Seed initial price history for all current assets (so charts have data)
-- This creates a baseline price point for each asset
INSERT INTO public.price_history (asset_id, price, source, created_at)
SELECT
  a.id,
  a.price,
  'baseline',
  NOW() - INTERVAL '1 hour'
FROM public.assets a
WHERE NOT EXISTS (
  SELECT 1 FROM public.price_history ph WHERE ph.asset_id = a.id
);

-- 5. Add index for faster price change queries
CREATE INDEX IF NOT EXISTS idx_price_history_asset_created
ON public.price_history(asset_id, created_at DESC);
