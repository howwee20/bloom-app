-- Migration: Fix token status constraint to allow frontend-friendly values
-- The original constraint only allowed: pending, active, listed, sold, redeemed, transferred
-- We need to also allow: acquiring, in_custody for the UI

-- Drop the old constraint
ALTER TABLE public.tokens DROP CONSTRAINT IF EXISTS tokens_status_check;

-- Add new constraint with all valid status values
ALTER TABLE public.tokens ADD CONSTRAINT tokens_status_check
  CHECK (status IN ('pending', 'active', 'listed', 'sold', 'redeemed', 'transferred', 'acquiring', 'in_custody'));

-- Update the RPC to filter correctly for both old and new status values
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
    -- Map DB status to frontend-friendly status
    CASE t.status
      WHEN 'pending' THEN 'acquiring'
      WHEN 'active' THEN 'in_custody'
      WHEN 'acquiring' THEN 'acquiring'
      WHEN 'in_custody' THEN 'in_custody'
      WHEN 'listed' THEN 'listed'
      WHEN 'sold' THEN 'redeemed'
      WHEN 'redeemed' THEN 'redeemed'
      WHEN 'transferred' THEN 'redeemed'
      ELSE t.status
    END AS status
  FROM tokens t
  WHERE t.user_id = auth.uid()
    AND t.status IN ('pending', 'active', 'listed', 'acquiring', 'in_custody')
  ORDER BY t.purchase_date DESC;
END;
$$;

-- Also update the portfolio summary to include these statuses
CREATE OR REPLACE FUNCTION get_token_portfolio_summary()
RETURNS TABLE (
  total_value NUMERIC(12, 2),
  total_cost NUMERIC(12, 2),
  total_pnl_dollars NUMERIC(12, 2),
  total_pnl_percent NUMERIC(6, 2),
  token_count INTEGER,
  in_custody_count INTEGER,
  acquiring_count INTEGER,
  redeeming_count INTEGER,
  redeemed_count INTEGER
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
    COUNT(*) FILTER (WHERE t.status IN ('active', 'in_custody'))::INTEGER AS in_custody_count,
    COUNT(*) FILTER (WHERE t.status IN ('pending', 'acquiring'))::INTEGER AS acquiring_count,
    0::INTEGER AS redeeming_count,
    COUNT(*) FILTER (WHERE t.status IN ('sold', 'redeemed', 'transferred'))::INTEGER AS redeemed_count
  FROM tokens t
  WHERE t.user_id = auth.uid()
    AND t.status IN ('pending', 'active', 'listed', 'acquiring', 'in_custody');
END;
$$;
