-- Add location field to get_portfolio_with_pnl RPC
-- This allows filtering assets by location (home, watchlist, bloom)

DROP FUNCTION IF EXISTS get_portfolio_with_pnl();

CREATE OR REPLACE FUNCTION get_portfolio_with_pnl()
RETURNS TABLE (
  id UUID,
  name TEXT,
  image_url TEXT,
  size TEXT,
  category TEXT,
  stockx_sku TEXT,
  catalog_item_id UUID,
  current_price NUMERIC(10, 2),
  entry_price NUMERIC(10, 2),
  pnl_dollars NUMERIC(10, 2),
  pnl_percent NUMERIC(5, 2),
  last_price_update TIMESTAMPTZ,
  last_price_checked_at TIMESTAMPTZ,
  last_price_updated_at TIMESTAMPTZ,
  updated_at_pricing TIMESTAMPTZ,
  location TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    COALESCE(a.name, c.display_name) AS name,
    COALESCE(a.image_url, c.image_url_thumb) AS image_url,
    a.size,
    a.category,
    COALESCE(a.stockx_sku, c.style_code) AS stockx_sku,
    a.catalog_item_id,
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
    a.last_price_update,
    a.last_price_checked_at,
    a.last_price_updated_at,
    a.updated_at_pricing,
    COALESCE(a.location, 'home') AS location
  FROM public.assets a
  LEFT JOIN public.catalog_items c ON a.catalog_item_id = c.id
  WHERE a.owner_id = auth.uid()
  ORDER BY a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_portfolio_with_pnl() TO authenticated;
