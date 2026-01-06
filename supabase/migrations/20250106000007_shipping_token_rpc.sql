-- Migration: Add shipping_to_bloom status and RPC for creating shipping tokens
-- For items users are shipping to Bloom for instant resale

-- 1. Update status constraint to include shipping_to_bloom
ALTER TABLE public.tokens DROP CONSTRAINT IF EXISTS tokens_status_check;
ALTER TABLE public.tokens ADD CONSTRAINT tokens_status_check
  CHECK (status IN ('pending', 'active', 'listed', 'sold', 'redeemed', 'transferred', 'acquiring', 'in_custody', 'shipping_to_bloom'));

-- 2. Create RPC function for creating shipping tokens
CREATE OR REPLACE FUNCTION create_shipping_token(
  p_sku TEXT,
  p_product_name TEXT,
  p_size TEXT,
  p_product_image_url TEXT,
  p_purchase_price NUMERIC(10,2),
  p_shipping_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_id UUID;
  v_current_value NUMERIC(10,2);
BEGIN
  -- Try to get current value from assets table if SKU matches
  SELECT a.price INTO v_current_value
  FROM assets a
  WHERE a.stockx_sku = p_sku
  LIMIT 1;

  -- If no match, use purchase price as current value
  IF v_current_value IS NULL THEN
    v_current_value := p_purchase_price;
  END IF;

  -- Insert the shipping token
  INSERT INTO tokens (
    user_id,
    order_id,
    sku,
    product_name,
    size,
    product_image_url,
    purchase_price,
    purchase_date,
    custody_type,
    vault_location,  -- Store shipping code here
    is_exchange_eligible,
    current_value,
    value_updated_at,
    status
  ) VALUES (
    auth.uid(),
    NULL,  -- No order for shipping tokens
    COALESCE(p_sku, 'MANUAL-' || gen_random_uuid()::TEXT),
    p_product_name,
    p_size,
    p_product_image_url,
    COALESCE(p_purchase_price, 0),
    NOW(),
    'home',  -- Still home custody until received at Bloom
    p_shipping_code,  -- Store shipping code in vault_location
    FALSE,   -- Not exchange eligible until received
    v_current_value,
    NOW(),
    'shipping_to_bloom'  -- Shipping status
  )
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION create_shipping_token(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO authenticated;

-- 3. Update get_user_tokens to include shipping_to_bloom status
DROP FUNCTION IF EXISTS get_user_tokens();

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
      WHEN 'shipping_to_bloom' THEN 'shipping_to_bloom'
      ELSE t.status
    END AS status
  FROM tokens t
  WHERE t.user_id = auth.uid()
    AND t.status IN ('pending', 'active', 'listed', 'acquiring', 'in_custody', 'shipping_to_bloom')
  ORDER BY t.purchase_date DESC;
END;
$$;

-- 4. Update portfolio summary to include shipping tokens
DROP FUNCTION IF EXISTS get_token_portfolio_summary();

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
    COUNT(*) FILTER (WHERE t.status IN ('pending', 'acquiring', 'shipping_to_bloom'))::INTEGER AS acquiring_count,
    0::INTEGER AS redeeming_count,
    COUNT(*) FILTER (WHERE t.status IN ('sold', 'redeemed', 'transferred'))::INTEGER AS redeemed_count
  FROM tokens t
  WHERE t.user_id = auth.uid()
    AND t.status IN ('pending', 'active', 'listed', 'acquiring', 'in_custody', 'shipping_to_bloom');
END;
$$;

-- 5. Update token detail to include shipping_to_bloom
DROP FUNCTION IF EXISTS get_token_detail(UUID);

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
      WHEN 'shipping_to_bloom' THEN 'shipping_to_bloom'
      ELSE t.status
    END AS status
  FROM tokens t
  WHERE t.id = p_token_id
    AND t.user_id = auth.uid();
END;
$$;
