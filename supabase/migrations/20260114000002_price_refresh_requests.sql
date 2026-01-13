-- Migration: Price Refresh Requests
-- Tracks refresh requests to prove pricing is real + verifiable

-- 1) Create price_refresh_requests table
CREATE TABLE IF NOT EXISTS public.price_refresh_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  style_code TEXT NOT NULL,
  size TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  request_source TEXT, -- 'user', 'system', 'worker'
  price_before NUMERIC(10, 2),
  price_after NUMERIC(10, 2),
  marketplace TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 2) Indexes
CREATE INDEX IF NOT EXISTS idx_price_refresh_style_code ON public.price_refresh_requests(style_code);
CREATE INDEX IF NOT EXISTS idx_price_refresh_status ON public.price_refresh_requests(status);
CREATE INDEX IF NOT EXISTS idx_price_refresh_created_at ON public.price_refresh_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_refresh_user_id ON public.price_refresh_requests(user_id);

-- 3) RLS
ALTER TABLE public.price_refresh_requests ENABLE ROW LEVEL SECURITY;

-- Users can read their own refresh requests
CREATE POLICY "Users can read own price_refresh_requests"
ON public.price_refresh_requests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR user_id IS NULL);

-- Users can insert refresh requests
CREATE POLICY "Users can insert price_refresh_requests"
ON public.price_refresh_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Service role can do everything
CREATE POLICY "Service role full access price_refresh_requests"
ON public.price_refresh_requests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4) RPC to request a price refresh
CREATE OR REPLACE FUNCTION request_price_refresh(
  p_style_code TEXT,
  p_size TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request_id UUID;
  v_current_price NUMERIC(10, 2);
BEGIN
  -- Get current price (if any)
  SELECT a.price INTO v_current_price
  FROM public.assets a
  WHERE a.stockx_sku = p_style_code
    AND a.price IS NOT NULL
  ORDER BY COALESCE(a.updated_at_pricing, a.last_price_updated_at) DESC NULLS LAST
  LIMIT 1;

  -- Create refresh request
  INSERT INTO public.price_refresh_requests (
    user_id,
    style_code,
    size,
    status,
    request_source,
    price_before
  ) VALUES (
    auth.uid(),
    p_style_code,
    p_size,
    'pending',
    'user',
    v_current_price
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION request_price_refresh(TEXT, TEXT) TO authenticated;

-- 5) RPC to get refresh request status
CREATE OR REPLACE FUNCTION get_price_refresh_status(p_request_id UUID)
RETURNS TABLE (
  id UUID,
  style_code TEXT,
  status TEXT,
  price_before NUMERIC(10, 2),
  price_after NUMERIC(10, 2),
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    prr.id,
    prr.style_code,
    prr.status,
    prr.price_before,
    prr.price_after,
    prr.created_at,
    prr.completed_at,
    prr.error_message
  FROM public.price_refresh_requests prr
  WHERE prr.id = p_request_id
    AND (prr.user_id = auth.uid() OR prr.user_id IS NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION get_price_refresh_status(UUID) TO authenticated;

-- 6) RPC to get recent refresh requests for a style code
CREATE OR REPLACE FUNCTION get_recent_price_refreshes(p_style_code TEXT, p_limit INTEGER DEFAULT 5)
RETURNS TABLE (
  id UUID,
  status TEXT,
  price_before NUMERIC(10, 2),
  price_after NUMERIC(10, 2),
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    prr.id,
    prr.status,
    prr.price_before,
    prr.price_after,
    prr.created_at,
    prr.completed_at
  FROM public.price_refresh_requests prr
  WHERE prr.style_code = p_style_code
  ORDER BY prr.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_recent_price_refreshes(TEXT, INTEGER) TO authenticated;

-- 7) Enhanced get_buy_quote with freshness states
DROP FUNCTION IF EXISTS get_buy_quote(TEXT);
CREATE OR REPLACE FUNCTION get_buy_quote(p_style_code TEXT)
RETURNS TABLE (
  available BOOLEAN,
  freshness TEXT,  -- 'fresh', 'stale', 'missing'
  marketplace TEXT,
  price NUMERIC(10, 2),
  fees NUMERIC(10, 2),
  shipping NUMERIC(10, 2),
  total NUMERIC(10, 2),
  updated_at TIMESTAMPTZ,
  minutes_ago INTEGER,
  reason_unavailable TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price NUMERIC(10, 2);
  v_updated_at TIMESTAMPTZ;
  v_fresh_minutes INTEGER := 15;  -- Fresh: within 15 minutes
  v_stale_hours INTEGER := 24;    -- Stale: within 24 hours
  v_fees NUMERIC(10, 2);
  v_shipping NUMERIC(10, 2) := 14.00;
  v_fee_rate NUMERIC := 0.12;
  v_minutes_ago INTEGER;
  v_freshness TEXT;
BEGIN
  -- Look for price in assets table by stockx_sku
  SELECT a.price, COALESCE(a.updated_at_pricing, a.last_price_updated_at, a.last_price_checked_at)
  INTO v_price, v_updated_at
  FROM public.assets a
  WHERE a.stockx_sku = p_style_code
    AND a.price IS NOT NULL
    AND a.price > 0
  ORDER BY COALESCE(a.updated_at_pricing, a.last_price_updated_at, a.last_price_checked_at) DESC NULLS LAST
  LIMIT 1;

  -- If no asset price, try catalog_items linked assets
  IF v_price IS NULL THEN
    SELECT a.price, COALESCE(a.updated_at_pricing, a.last_price_updated_at)
    INTO v_price, v_updated_at
    FROM public.assets a
    JOIN public.catalog_items c ON a.catalog_item_id = c.id
    WHERE c.style_code = p_style_code
      AND a.price IS NOT NULL
      AND a.price > 0
    ORDER BY COALESCE(a.updated_at_pricing, a.last_price_updated_at) DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- Calculate minutes ago
  IF v_updated_at IS NOT NULL THEN
    v_minutes_ago := EXTRACT(EPOCH FROM (NOW() - v_updated_at)) / 60;
  ELSE
    v_minutes_ago := NULL;
  END IF;

  -- Determine freshness
  IF v_price IS NULL OR v_updated_at IS NULL THEN
    v_freshness := 'missing';
  ELSIF v_minutes_ago <= v_fresh_minutes THEN
    v_freshness := 'fresh';
  ELSIF v_minutes_ago <= (v_stale_hours * 60) THEN
    v_freshness := 'stale';
  ELSE
    v_freshness := 'stale'; -- Very stale but still show it
  END IF;

  -- If missing, return unavailable
  IF v_freshness = 'missing' THEN
    RETURN QUERY SELECT
      false AS available,
      'missing'::TEXT AS freshness,
      NULL::TEXT AS marketplace,
      NULL::NUMERIC(10, 2) AS price,
      NULL::NUMERIC(10, 2) AS fees,
      NULL::NUMERIC(10, 2) AS shipping,
      NULL::NUMERIC(10, 2) AS total,
      v_updated_at AS updated_at,
      v_minutes_ago AS minutes_ago,
      'No price available'::TEXT AS reason_unavailable;
    RETURN;
  END IF;

  -- Calculate fees and total
  v_fees := ROUND(v_price * v_fee_rate, 2);

  RETURN QUERY SELECT
    true AS available,
    v_freshness AS freshness,
    'stockx'::TEXT AS marketplace,
    v_price AS price,
    v_fees AS fees,
    v_shipping AS shipping,
    (v_price + v_fees + v_shipping) AS total,
    v_updated_at AS updated_at,
    v_minutes_ago AS minutes_ago,
    NULL::TEXT AS reason_unavailable;
END;
$$;

GRANT EXECUTE ON FUNCTION get_buy_quote(TEXT) TO authenticated;
