-- Migration: Unified Market Index
-- Adds support for multi-source price aggregation

-- 1) Add marketplace_source_url to order_intents for clickable purchase links
ALTER TABLE public.order_intents
ADD COLUMN IF NOT EXISTS marketplace_source_url TEXT;

-- 2) Add offer_metadata to store full offer details at time of purchase
ALTER TABLE public.order_intents
ADD COLUMN IF NOT EXISTS offer_metadata JSONB;

-- 3) Update create_order_intent function to accept new params
CREATE OR REPLACE FUNCTION create_order_intent(
  p_catalog_item_id UUID,
  p_size TEXT,
  p_destination TEXT,
  p_marketplace TEXT DEFAULT 'stockx',
  p_source_url TEXT DEFAULT NULL,
  p_quoted_total NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_user_id UUID;
  v_email TEXT;
  v_catalog_item RECORD;
  v_quote RECORD;
  v_max_total NUMERIC(10, 2);
  v_shipping_address JSONB;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get user email
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  -- Get catalog item details
  SELECT id, display_name, brand, style_code, image_url_thumb
  INTO v_catalog_item
  FROM public.catalog_items
  WHERE id = p_catalog_item_id;

  IF v_catalog_item IS NULL THEN
    RAISE EXCEPTION 'Catalog item not found';
  END IF;

  -- If quoted_total provided (from offers API), use it; otherwise get fresh quote
  IF p_quoted_total IS NOT NULL THEN
    v_max_total := ROUND(p_quoted_total * 1.05, 2); -- 5% buffer
  ELSE
    -- Get quote from existing function
    SELECT * INTO v_quote FROM get_buy_quote(v_catalog_item.style_code);
    IF NOT v_quote.available THEN
      RAISE EXCEPTION 'Quote unavailable: %', COALESCE(v_quote.reason_unavailable, 'Price updating');
    END IF;
    v_max_total := ROUND(v_quote.total * 1.05, 2); -- 5% buffer
    p_quoted_total := v_quote.total;
  END IF;

  -- Get saved shipping address if routing home
  IF p_destination = 'home' THEN
    SELECT shipping_address INTO v_shipping_address
    FROM public.saved_shipping_addresses
    WHERE user_id = v_user_id
    ORDER BY updated_at DESC
    LIMIT 1;
  END IF;

  -- Insert order intent
  INSERT INTO public.order_intents (
    user_id,
    catalog_item_id,
    shoe_id,
    shoe_name,
    style_code,
    image_url,
    size,
    route,
    quoted_marketplace,
    quoted_price,
    quoted_fees,
    quoted_shipping,
    quoted_total,
    max_total,
    shipping_address,
    email,
    marketplace_source_url,
    status
  ) VALUES (
    v_user_id,
    p_catalog_item_id,
    v_catalog_item.style_code,
    v_catalog_item.display_name,
    v_catalog_item.style_code,
    v_catalog_item.image_url_thumb,
    p_size,
    p_destination,
    p_marketplace,
    p_quoted_total * 0.85, -- Rough estimate: ~85% is base price
    p_quoted_total * 0.10, -- Rough estimate: ~10% fees
    14.00,                 -- Standard shipping
    p_quoted_total,
    v_max_total,
    v_shipping_address,
    v_email,
    p_source_url,
    'pending'
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_intent(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;

-- 4) Update get_all_order_intents to include source_url
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
  marketplace_source_url TEXT,
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
    oi.marketplace_source_url,
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
