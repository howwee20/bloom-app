-- Migration: Add saved shipping address to profile for faster checkout

-- Add shipping address columns to profile table
ALTER TABLE public.profile
  ADD COLUMN IF NOT EXISTS shipping_name TEXT,
  ADD COLUMN IF NOT EXISTS shipping_line1 TEXT,
  ADD COLUMN IF NOT EXISTS shipping_line2 TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city TEXT,
  ADD COLUMN IF NOT EXISTS shipping_state TEXT,
  ADD COLUMN IF NOT EXISTS shipping_zip TEXT,
  ADD COLUMN IF NOT EXISTS shipping_country TEXT DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS shipping_phone TEXT;

-- RPC to get saved shipping address
CREATE OR REPLACE FUNCTION get_saved_shipping_address()
RETURNS TABLE (
  name TEXT,
  line1 TEXT,
  line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT,
  phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.shipping_name AS name,
    p.shipping_line1 AS line1,
    p.shipping_line2 AS line2,
    p.shipping_city AS city,
    p.shipping_state AS state,
    p.shipping_zip AS zip,
    p.shipping_country AS country,
    p.shipping_phone AS phone
  FROM public.profile p
  WHERE p.id = auth.uid()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_saved_shipping_address() TO authenticated;

-- RPC to save shipping address
CREATE OR REPLACE FUNCTION save_shipping_address(
  p_name TEXT,
  p_line1 TEXT,
  p_line2 TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL,
  p_country TEXT DEFAULT 'US',
  p_phone TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profile
  SET
    shipping_name = p_name,
    shipping_line1 = p_line1,
    shipping_line2 = p_line2,
    shipping_city = p_city,
    shipping_state = p_state,
    shipping_zip = p_zip,
    shipping_country = p_country,
    shipping_phone = p_phone
  WHERE id = auth.uid();

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION save_shipping_address(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
