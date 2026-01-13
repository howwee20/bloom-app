-- Migration: Order Intents (Wizard-of-Oz Buy Flow)
-- Captures purchase intent for manual execution

-- 1) Create order_intents table
CREATE TABLE IF NOT EXISTS public.order_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Product info (denormalized for convenience)
  catalog_item_id UUID REFERENCES public.catalog_items(id),
  shoe_id TEXT NOT NULL,              -- style_code from catalog
  shoe_name TEXT,                     -- display_name
  style_code TEXT,
  image_url TEXT,
  size TEXT NOT NULL,

  -- Route: where to ship
  route TEXT NOT NULL CHECK (route IN ('home', 'bloom')),

  -- Quote snapshot at time of intent
  quoted_marketplace TEXT,            -- e.g., 'stockx'
  quoted_price NUMERIC(10, 2),        -- base item price
  quoted_fees NUMERIC(10, 2),         -- estimated fees
  quoted_shipping NUMERIC(10, 2),     -- estimated shipping
  quoted_total NUMERIC(10, 2),        -- total estimate
  max_total NUMERIC(10, 2) NOT NULL,  -- user-approved ceiling

  -- Shipping address (for route='home')
  shipping_address JSONB,             -- {name, line1, line2, city, state, zip, country, phone}
  email TEXT,                         -- user email (denormalized)

  -- Execution tracking (filled by admin)
  marketplace_used TEXT,              -- actual marketplace used
  actual_total NUMERIC(10, 2),        -- actual amount paid
  tracking_number TEXT,
  tracking_carrier TEXT,
  notes TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'executing', 'ordered', 'shipped', 'delivered', 'cancelled', 'failed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Create updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_order_intents_updated_at ON public.order_intents;
CREATE TRIGGER set_order_intents_updated_at
BEFORE UPDATE ON public.order_intents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) RLS policies
ALTER TABLE public.order_intents ENABLE ROW LEVEL SECURITY;

-- Users can read their own order intents
CREATE POLICY "Users can read own order_intents"
ON public.order_intents
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own order intents
CREATE POLICY "Users can insert own order_intents"
ON public.order_intents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for admin updates)
CREATE POLICY "Service role full access order_intents"
ON public.order_intents
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4) Indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_intents_user_id ON public.order_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_order_intents_status ON public.order_intents(status);
CREATE INDEX IF NOT EXISTS idx_order_intents_created_at ON public.order_intents(created_at DESC);

-- 5) RPC to get user's order intents with status labels
CREATE OR REPLACE FUNCTION get_user_order_intents()
RETURNS TABLE (
  id UUID,
  shoe_id TEXT,
  shoe_name TEXT,
  style_code TEXT,
  image_url TEXT,
  size TEXT,
  route TEXT,
  quoted_marketplace TEXT,
  quoted_price NUMERIC(10, 2),
  quoted_total NUMERIC(10, 2),
  max_total NUMERIC(10, 2),
  marketplace_used TEXT,
  actual_total NUMERIC(10, 2),
  tracking_number TEXT,
  tracking_carrier TEXT,
  status TEXT,
  status_label TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    oi.id,
    oi.shoe_id,
    oi.shoe_name,
    oi.style_code,
    oi.image_url,
    oi.size,
    oi.route,
    oi.quoted_marketplace,
    oi.quoted_price,
    oi.quoted_total,
    oi.max_total,
    oi.marketplace_used,
    oi.actual_total,
    oi.tracking_number,
    oi.tracking_carrier,
    oi.status,
    CASE oi.status
      WHEN 'pending' THEN 'Requested'
      WHEN 'executing' THEN 'Buying...'
      WHEN 'ordered' THEN 'Ordered'
      WHEN 'shipped' THEN 'In transit'
      WHEN 'delivered' THEN CASE WHEN oi.route = 'bloom' THEN 'In Bloom' ELSE 'Delivered' END
      WHEN 'cancelled' THEN 'Cancelled'
      WHEN 'failed' THEN 'Failed'
      ELSE oi.status
    END AS status_label,
    oi.created_at,
    oi.updated_at
  FROM public.order_intents oi
  WHERE oi.user_id = auth.uid()
  ORDER BY oi.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_order_intents() TO authenticated;

-- 6) Admin RPC to get all order intents (service role only)
CREATE OR REPLACE FUNCTION get_all_order_intents(p_status TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_email TEXT,
  shoe_id TEXT,
  shoe_name TEXT,
  style_code TEXT,
  image_url TEXT,
  size TEXT,
  route TEXT,
  quoted_marketplace TEXT,
  quoted_price NUMERIC(10, 2),
  quoted_total NUMERIC(10, 2),
  max_total NUMERIC(10, 2),
  shipping_address JSONB,
  email TEXT,
  marketplace_used TEXT,
  actual_total NUMERIC(10, 2),
  tracking_number TEXT,
  tracking_carrier TEXT,
  notes TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    oi.id,
    oi.user_id,
    u.email AS user_email,
    oi.shoe_id,
    oi.shoe_name,
    oi.style_code,
    oi.image_url,
    oi.size,
    oi.route,
    oi.quoted_marketplace,
    oi.quoted_price,
    oi.quoted_total,
    oi.max_total,
    oi.shipping_address,
    oi.email,
    oi.marketplace_used,
    oi.actual_total,
    oi.tracking_number,
    oi.tracking_carrier,
    oi.notes,
    oi.status,
    oi.created_at,
    oi.updated_at
  FROM public.order_intents oi
  LEFT JOIN auth.users u ON oi.user_id = u.id
  WHERE (p_status IS NULL OR oi.status = p_status)
  ORDER BY oi.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_order_intents(TEXT) TO service_role;

-- 7) Admin RPC to update order intent (service role only)
CREATE OR REPLACE FUNCTION update_order_intent(
  p_id UUID,
  p_status TEXT DEFAULT NULL,
  p_marketplace_used TEXT DEFAULT NULL,
  p_actual_total NUMERIC DEFAULT NULL,
  p_tracking_number TEXT DEFAULT NULL,
  p_tracking_carrier TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.order_intents
  SET
    status = COALESCE(p_status, status),
    marketplace_used = COALESCE(p_marketplace_used, marketplace_used),
    actual_total = COALESCE(p_actual_total, actual_total),
    tracking_number = COALESCE(p_tracking_number, tracking_number),
    tracking_carrier = COALESCE(p_tracking_carrier, tracking_carrier),
    notes = COALESCE(p_notes, notes)
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION update_order_intent(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO service_role;

-- 8) Function to get quote for a style code
CREATE OR REPLACE FUNCTION get_buy_quote(p_style_code TEXT)
RETURNS TABLE (
  available BOOLEAN,
  marketplace TEXT,
  price NUMERIC(10, 2),
  fees NUMERIC(10, 2),
  shipping NUMERIC(10, 2),
  total NUMERIC(10, 2),
  updated_at TIMESTAMPTZ,
  reason_unavailable TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price NUMERIC(10, 2);
  v_updated_at TIMESTAMPTZ;
  v_stale_hours INTEGER := 24;
  v_fees NUMERIC(10, 2);
  v_shipping NUMERIC(10, 2) := 14.00;  -- Standard StockX shipping
  v_fee_rate NUMERIC := 0.12;          -- 12% StockX seller fee estimate for buyer
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

  -- Check if price is too stale (more than 24 hours old)
  IF v_price IS NULL OR v_updated_at IS NULL OR v_updated_at < NOW() - (v_stale_hours || ' hours')::INTERVAL THEN
    RETURN QUERY SELECT
      false AS available,
      NULL::TEXT AS marketplace,
      NULL::NUMERIC(10, 2) AS price,
      NULL::NUMERIC(10, 2) AS fees,
      NULL::NUMERIC(10, 2) AS shipping,
      NULL::NUMERIC(10, 2) AS total,
      v_updated_at AS updated_at,
      'Updating prices...' AS reason_unavailable;
    RETURN;
  END IF;

  -- Calculate fees and total
  v_fees := ROUND(v_price * v_fee_rate, 2);

  RETURN QUERY SELECT
    true AS available,
    'stockx'::TEXT AS marketplace,
    v_price AS price,
    v_fees AS fees,
    v_shipping AS shipping,
    (v_price + v_fees + v_shipping) AS total,
    v_updated_at AS updated_at,
    NULL::TEXT AS reason_unavailable;
END;
$$;

GRANT EXECUTE ON FUNCTION get_buy_quote(TEXT) TO authenticated;
