-- Fix: Add status and owner_id to get_asset_with_price_change function
-- This enables the purchase button to show correctly

-- Must drop first to change return type
DROP FUNCTION IF EXISTS get_asset_with_price_change(UUID);

CREATE OR REPLACE FUNCTION get_asset_with_price_change(p_asset_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  image_url TEXT,
  price NUMERIC(10, 2),
  owner_id UUID,
  status TEXT,
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
    a.owner_id,
    a.status,
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
