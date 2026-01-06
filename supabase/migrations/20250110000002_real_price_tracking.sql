-- Migration: Real price tracking timestamps, matching status, and cron status

-- 1) Price check/update timestamps on assets
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS last_price_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_price_updated_at TIMESTAMPTZ;

-- 2) Matching + price timestamps on tokens
ALTER TABLE public.tokens
  ADD COLUMN IF NOT EXISTS match_status TEXT DEFAULT 'matched' CHECK (match_status IN ('matched', 'pending')),
  ADD COLUMN IF NOT EXISTS matched_asset_id UUID REFERENCES public.assets(id),
  ADD COLUMN IF NOT EXISTS last_price_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_price_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attributes JSONB;

-- 3) Cron status table for observability
CREATE TABLE IF NOT EXISTS public.cron_status (
  job_name TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_payload JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cron_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cron status readable by authenticated users"
ON public.cron_status
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role manages cron status"
ON public.cron_status
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4) Update add_home_token to support match status + custody + attributes
CREATE OR REPLACE FUNCTION add_home_token(
  p_sku TEXT,
  p_product_name TEXT,
  p_size TEXT,
  p_product_image_url TEXT,
  p_purchase_price NUMERIC(10,2),
  p_custody_type TEXT DEFAULT 'home',
  p_attributes JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_id UUID;
  v_current_value NUMERIC(10,2);
  v_asset_id UUID;
  v_last_checked TIMESTAMPTZ;
  v_last_updated TIMESTAMPTZ;
  v_match_status TEXT;
  v_custody_type TEXT;
BEGIN
  v_custody_type := CASE
    WHEN p_custody_type IN ('home', 'bloom') THEN p_custody_type
    ELSE 'home'
  END;

  SELECT a.id, a.price, a.last_price_checked_at, a.last_price_updated_at
  INTO v_asset_id, v_current_value, v_last_checked, v_last_updated
  FROM public.assets a
  WHERE a.stockx_sku = p_sku
  LIMIT 1;

  IF v_asset_id IS NULL THEN
    v_current_value := NULL;
    v_match_status := 'pending';
  ELSE
    v_match_status := 'matched';
  END IF;

  INSERT INTO public.tokens (
    user_id,
    order_id,
    sku,
    product_name,
    size,
    product_image_url,
    purchase_price,
    purchase_date,
    custody_type,
    vault_location,
    is_exchange_eligible,
    current_value,
    value_updated_at,
    status,
    match_status,
    matched_asset_id,
    last_price_checked_at,
    last_price_updated_at,
    attributes
  ) VALUES (
    auth.uid(),
    NULL,
    COALESCE(p_sku, 'MANUAL-' || gen_random_uuid()::TEXT),
    p_product_name,
    p_size,
    p_product_image_url,
    p_purchase_price,
    NOW(),
    v_custody_type,
    NULL,
    FALSE,
    v_current_value,
    v_last_updated,
    'in_custody',
    v_match_status,
    v_asset_id,
    v_last_checked,
    v_last_updated,
    p_attributes
  )
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

GRANT EXECUTE ON FUNCTION add_home_token(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB) TO authenticated;

-- 5) Sync token prices from assets (include checked/updated timestamps)
CREATE OR REPLACE FUNCTION sync_token_prices_from_assets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.tokens t
  SET
    current_value = a.price,
    value_updated_at = CASE
      WHEN t.current_value IS DISTINCT FROM a.price THEN COALESCE(a.last_price_updated_at, NOW())
      ELSE t.value_updated_at
    END,
    last_price_checked_at = a.last_price_checked_at,
    last_price_updated_at = CASE
      WHEN t.current_value IS DISTINCT FROM a.price THEN a.last_price_updated_at
      ELSE t.last_price_updated_at
    END,
    matched_asset_id = a.id,
    match_status = 'matched'
  FROM public.assets a
  WHERE t.sku = a.stockx_sku
    AND t.status IN ('pending', 'active', 'listed', 'in_custody', 'acquiring', 'shipping_to_bloom');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION sync_token_prices_from_assets() TO service_role;

-- 6) Update get_user_tokens to include match + timestamps
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
  status TEXT,
  match_status TEXT,
  matched_asset_id UUID,
  last_price_checked_at TIMESTAMPTZ,
  last_price_updated_at TIMESTAMPTZ
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
    CASE
      WHEN t.match_status = 'pending' THEN NULL
      ELSE COALESCE(t.current_value, t.purchase_price)
    END AS current_value,
    CASE
      WHEN t.match_status = 'pending' THEN NULL
      WHEN t.purchase_price > 0
      THEN COALESCE(t.current_value, t.purchase_price) - t.purchase_price
      ELSE NULL
    END AS pnl_dollars,
    CASE
      WHEN t.match_status = 'pending' THEN NULL
      WHEN t.purchase_price > 0
      THEN ROUND(((COALESCE(t.current_value, t.purchase_price) - t.purchase_price) / t.purchase_price * 100)::NUMERIC, 2)
      ELSE 0
    END AS pnl_percent,
    t.is_listed_for_sale,
    t.listing_price,
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
    END AS status,
    t.match_status,
    t.matched_asset_id,
    t.last_price_checked_at,
    t.last_price_updated_at
  FROM public.tokens t
  WHERE t.user_id = auth.uid()
    AND t.status IN ('pending', 'active', 'listed', 'acquiring', 'in_custody', 'shipping_to_bloom')
  ORDER BY t.purchase_date DESC;
END;
$$;

-- 7) Update token portfolio summary to ignore pending matches in totals
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
    COALESCE(SUM(CASE WHEN t.match_status = 'pending' THEN 0 ELSE COALESCE(t.current_value, t.purchase_price) END), 0)::NUMERIC(12,2) AS total_value,
    COALESCE(SUM(CASE WHEN t.match_status = 'pending' THEN 0 ELSE t.purchase_price END), 0)::NUMERIC(12,2) AS total_cost,
    COALESCE(SUM(CASE WHEN t.match_status = 'pending' THEN 0 ELSE COALESCE(t.current_value, t.purchase_price) - t.purchase_price END), 0)::NUMERIC(12,2) AS total_pnl_dollars,
    CASE
      WHEN COALESCE(SUM(CASE WHEN t.match_status = 'pending' THEN 0 ELSE t.purchase_price END), 0) > 0
      THEN ROUND(((COALESCE(SUM(CASE WHEN t.match_status = 'pending' THEN 0 ELSE COALESCE(t.current_value, t.purchase_price) END), 0) - COALESCE(SUM(CASE WHEN t.match_status = 'pending' THEN 0 ELSE t.purchase_price END), 0)) / SUM(CASE WHEN t.match_status = 'pending' THEN 0 ELSE t.purchase_price END) * 100)::NUMERIC, 2)
      ELSE 0
    END::NUMERIC(6,2) AS total_pnl_percent,
    COUNT(*)::INTEGER AS token_count,
    COUNT(*) FILTER (WHERE t.status IN ('active', 'in_custody'))::INTEGER AS in_custody_count,
    COUNT(*) FILTER (WHERE t.status IN ('pending', 'acquiring', 'shipping_to_bloom'))::INTEGER AS acquiring_count,
    0::INTEGER AS redeeming_count,
    COUNT(*) FILTER (WHERE t.status IN ('sold', 'redeemed', 'transferred'))::INTEGER AS redeemed_count
  FROM public.tokens t
  WHERE t.user_id = auth.uid()
    AND t.status IN ('pending', 'active', 'listed', 'acquiring', 'in_custody', 'shipping_to_bloom');
END;
$$;

-- 8) Update token detail to include match status and timestamps
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
  status TEXT,
  match_status TEXT,
  matched_asset_id UUID,
  last_price_checked_at TIMESTAMPTZ,
  last_price_updated_at TIMESTAMPTZ
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
    CASE
      WHEN t.match_status = 'pending' THEN NULL
      ELSE COALESCE(t.current_value, t.purchase_price)
    END AS current_value,
    CASE
      WHEN t.match_status = 'pending' THEN NULL
      WHEN t.purchase_price > 0
      THEN COALESCE(t.current_value, t.purchase_price) - t.purchase_price
      ELSE NULL
    END AS pnl_dollars,
    CASE
      WHEN t.match_status = 'pending' THEN NULL
      WHEN t.purchase_price > 0
      THEN ROUND(((COALESCE(t.current_value, t.purchase_price) - t.purchase_price) / t.purchase_price * 100)::NUMERIC, 2)
      ELSE 0
    END AS pnl_percent,
    t.is_listed_for_sale,
    t.listing_price,
    t.status,
    t.match_status,
    t.matched_asset_id,
    t.last_price_checked_at,
    t.last_price_updated_at
  FROM public.tokens t
  WHERE t.id = p_token_id
    AND t.user_id = auth.uid();
END;
$$;

-- 9) Update portfolio with P&L to include checked/updated timestamps
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
  last_price_update TIMESTAMPTZ,
  last_price_checked_at TIMESTAMPTZ,
  last_price_updated_at TIMESTAMPTZ
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
    a.last_price_update,
    a.last_price_checked_at,
    a.last_price_updated_at
  FROM public.assets a
  WHERE a.owner_id = auth.uid()
  ORDER BY a.created_at DESC;
END;
$$;

-- 10) Update asset-with-change to expose checked/updated timestamps
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
  last_price_checked_at TIMESTAMPTZ,
  last_price_updated_at TIMESTAMPTZ,
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
    a.last_price_checked_at,
    a.last_price_updated_at,
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

-- 11) Update market assets with changes to include checked/updated timestamps
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
  last_price_checked_at TIMESTAMPTZ,
  last_price_updated_at TIMESTAMPTZ,
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
    a.last_price_checked_at,
    a.last_price_updated_at,
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
