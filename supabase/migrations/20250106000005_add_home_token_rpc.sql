-- Migration: Add RPC function for adding home custody tokens
-- Allows users to add items they already own to their portfolio

CREATE OR REPLACE FUNCTION add_home_token(
  p_sku TEXT,
  p_product_name TEXT,
  p_size TEXT,
  p_product_image_url TEXT,
  p_purchase_price NUMERIC(10,2)
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

  -- Insert the home custody token
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
    vault_location,
    is_exchange_eligible,
    current_value,
    value_updated_at,
    status
  ) VALUES (
    auth.uid(),
    NULL,  -- No order for home tokens
    COALESCE(p_sku, 'MANUAL-' || gen_random_uuid()::TEXT),
    p_product_name,
    p_size,
    p_product_image_url,
    p_purchase_price,
    NOW(),
    'home',  -- Home custody
    NULL,    -- No vault location
    FALSE,   -- Not exchange eligible (home custody)
    v_current_value,
    NOW(),
    'in_custody'  -- Will be mapped to 'in_custody' by get_user_tokens
  )
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION add_home_token(TEXT, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
