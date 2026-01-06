-- Migration: Order detail RPC function and missing columns

-- Add tracking_carrier column if not exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_carrier TEXT;

-- Get full order detail for receipt screen
CREATE OR REPLACE FUNCTION get_order_detail(p_order_id UUID)
RETURNS TABLE (
  -- Order fields
  id UUID,
  status TEXT,
  lane TEXT,
  amount_cents INTEGER,
  created_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  -- Product fields (from asset)
  sku TEXT,
  product_name TEXT,
  size TEXT,
  product_image_url TEXT,
  -- Shipping fields (Lane A)
  shipping_name TEXT,
  shipping_address_line1 TEXT,
  shipping_address_line2 TEXT,
  shipping_city TEXT,
  shipping_state TEXT,
  shipping_zip TEXT,
  -- Tracking
  tracking_number TEXT,
  tracking_carrier TEXT,
  -- Token link
  token_id UUID,
  token_status TEXT,
  -- User email (for display)
  user_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.status,
    o.lane,
    o.amount_cents,
    o.created_at,
    o.paid_at,
    o.fulfilled_at,
    o.delivered_at,
    a.stockx_sku AS sku,
    a.name AS product_name,
    o.size,
    a.image_url AS product_image_url,
    o.shipping_name,
    o.shipping_address_line1,
    o.shipping_address_line2,
    o.shipping_city,
    o.shipping_state,
    o.shipping_zip,
    o.tracking_number,
    o.tracking_carrier,
    t.id AS token_id,
    t.status AS token_status,
    u.email AS user_email
  FROM orders o
  LEFT JOIN assets a ON o.asset_id = a.id
  LEFT JOIN tokens t ON t.order_id = o.id
  LEFT JOIN auth.users u ON o.user_id = u.id
  WHERE o.id = p_order_id
    AND o.user_id = auth.uid();
END;
$$;

-- Get most recent order for the current user (for success screen)
CREATE OR REPLACE FUNCTION get_latest_user_order()
RETURNS TABLE (
  id UUID,
  status TEXT,
  lane TEXT,
  amount_cents INTEGER,
  created_at TIMESTAMPTZ,
  sku TEXT,
  product_name TEXT,
  size TEXT,
  product_image_url TEXT,
  shipping_name TEXT,
  shipping_address_line1 TEXT,
  shipping_city TEXT,
  shipping_state TEXT,
  shipping_zip TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.status,
    o.lane,
    o.amount_cents,
    o.created_at,
    a.stockx_sku AS sku,
    a.name AS product_name,
    o.size,
    a.image_url AS product_image_url,
    o.shipping_name,
    o.shipping_address_line1,
    o.shipping_city,
    o.shipping_state,
    o.shipping_zip
  FROM orders o
  LEFT JOIN assets a ON o.asset_id = a.id
  WHERE o.user_id = auth.uid()
  ORDER BY o.created_at DESC
  LIMIT 1;
END;
$$;
