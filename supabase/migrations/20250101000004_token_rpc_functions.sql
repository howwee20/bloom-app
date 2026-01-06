-- Migration: RPC functions for token queries

-- Get user's tokens with current values and P&L
CREATE OR REPLACE FUNCTION get_user_tokens()
RETURNS TABLE (
  id UUID,
  order_id UUID,
  sku TEXT,
  product_name TEXT,
  size TEXT,
  product_image_url TEXT,
  purchase_price NUMERIC(10, 2),
  purchase_date TIMESTAMPTZ,
  custody_type TEXT,
  vault_location TEXT,
  is_exchange_eligible BOOLEAN,
  current_value NUMERIC(10, 2),
  pnl_dollars NUMERIC(10, 2),
  pnl_percent NUMERIC(6, 2),
  is_listed_for_sale BOOLEAN,
  listing_price NUMERIC(10, 2),
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.order_id,
    t.sku,
    t.product_name,
    t.size,
    t.product_image_url,
    t.purchase_price,
    t.purchase_date,
    t.custody_type,
    t.vault_location,
    t.is_exchange_eligible,
    COALESCE(t.current_value, t.purchase_price) AS current_value,
    COALESCE(t.current_value, t.purchase_price) - t.purchase_price AS pnl_dollars,
    CASE
      WHEN t.purchase_price > 0
      THEN ROUND(((COALESCE(t.current_value, t.purchase_price) - t.purchase_price) / t.purchase_price * 100)::NUMERIC, 2)
      ELSE 0
    END AS pnl_percent,
    t.is_listed_for_sale,
    t.listing_price,
    t.status
  FROM tokens t
  WHERE t.user_id = auth.uid()
    AND t.status IN ('pending', 'active', 'listed')
  ORDER BY t.purchase_date DESC;
END;
$$;

-- Get token portfolio summary
CREATE OR REPLACE FUNCTION get_token_portfolio_summary()
RETURNS TABLE (
  total_value NUMERIC(12, 2),
  total_cost NUMERIC(12, 2),
  total_pnl_dollars NUMERIC(12, 2),
  total_pnl_percent NUMERIC(6, 2),
  token_count INTEGER,
  vault_count INTEGER,
  home_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(COALESCE(t.current_value, t.purchase_price)), 0)::NUMERIC(12,2) AS total_value,
    COALESCE(SUM(t.purchase_price), 0)::NUMERIC(12,2) AS total_cost,
    COALESCE(SUM(COALESCE(t.current_value, t.purchase_price) - t.purchase_price), 0)::NUMERIC(12,2) AS total_pnl_dollars,
    CASE
      WHEN COALESCE(SUM(t.purchase_price), 0) > 0
      THEN ROUND(((COALESCE(SUM(COALESCE(t.current_value, t.purchase_price)), 0) - COALESCE(SUM(t.purchase_price), 0)) / SUM(t.purchase_price) * 100)::NUMERIC, 2)
      ELSE 0
    END::NUMERIC(6,2) AS total_pnl_percent,
    COUNT(*)::INTEGER AS token_count,
    COUNT(*) FILTER (WHERE t.custody_type = 'bloom')::INTEGER AS vault_count,
    COUNT(*) FILTER (WHERE t.custody_type = 'home')::INTEGER AS home_count
  FROM tokens t
  WHERE t.user_id = auth.uid()
    AND t.status IN ('pending', 'active', 'listed');
END;
$$;

-- Get single token detail
CREATE OR REPLACE FUNCTION get_token_detail(p_token_id UUID)
RETURNS TABLE (
  id UUID,
  order_id UUID,
  sku TEXT,
  product_name TEXT,
  size TEXT,
  product_image_url TEXT,
  purchase_price NUMERIC(10, 2),
  purchase_date TIMESTAMPTZ,
  custody_type TEXT,
  vault_location TEXT,
  verification_photos TEXT[],
  verified_at TIMESTAMPTZ,
  is_exchange_eligible BOOLEAN,
  current_value NUMERIC(10, 2),
  pnl_dollars NUMERIC(10, 2),
  pnl_percent NUMERIC(6, 2),
  is_listed_for_sale BOOLEAN,
  listing_price NUMERIC(10, 2),
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.order_id,
    t.sku,
    t.product_name,
    t.size,
    t.product_image_url,
    t.purchase_price,
    t.purchase_date,
    t.custody_type,
    t.vault_location,
    t.verification_photos,
    t.verified_at,
    t.is_exchange_eligible,
    COALESCE(t.current_value, t.purchase_price) AS current_value,
    COALESCE(t.current_value, t.purchase_price) - t.purchase_price AS pnl_dollars,
    CASE
      WHEN t.purchase_price > 0
      THEN ROUND(((COALESCE(t.current_value, t.purchase_price) - t.purchase_price) / t.purchase_price * 100)::NUMERIC, 2)
      ELSE 0
    END AS pnl_percent,
    t.is_listed_for_sale,
    t.listing_price,
    t.status
  FROM tokens t
  WHERE t.id = p_token_id
    AND t.user_id = auth.uid();
END;
$$;

-- Get user's orders with token status
CREATE OR REPLACE FUNCTION get_user_orders_with_tokens()
RETURNS TABLE (
  order_id UUID,
  sku TEXT,
  product_name TEXT,
  size TEXT,
  product_image_url TEXT,
  amount_cents INTEGER,
  lane TEXT,
  status TEXT,
  tracking_number TEXT,
  tracking_carrier TEXT,
  shipping_name TEXT,
  shipping_city TEXT,
  shipping_state TEXT,
  created_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  token_id UUID,
  token_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id AS order_id,
    a.stockx_sku AS sku,
    a.name AS product_name,
    o.size,
    a.image_url AS product_image_url,
    o.amount_cents,
    o.lane,
    o.status,
    o.tracking_number,
    o.tracking_carrier,
    o.shipping_name,
    o.shipping_city,
    o.shipping_state,
    o.created_at,
    o.paid_at,
    t.id AS token_id,
    t.status AS token_status
  FROM orders o
  LEFT JOIN assets a ON o.asset_id = a.id
  LEFT JOIN tokens t ON t.order_id = o.id
  WHERE o.user_id = auth.uid()
  ORDER BY o.created_at DESC;
END;
$$;
