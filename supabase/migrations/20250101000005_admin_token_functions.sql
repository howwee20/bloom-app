-- Migration: Admin functions for manual fulfillment workflow

-- Activate token after delivery confirmed (for manual fulfillment)
-- Call this when order is delivered and verified
CREATE OR REPLACE FUNCTION activate_token(p_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_id UUID;
BEGIN
  -- Update token status to active
  UPDATE tokens
  SET
    status = 'active',
    updated_at = NOW()
  WHERE order_id = p_order_id
    AND status = 'pending'
  RETURNING id INTO v_token_id;

  -- Update order status to complete
  UPDATE orders
  SET
    status = 'complete',
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN v_token_id;
END;
$$;

-- For vault tokens: add verification photos and mark verified
CREATE OR REPLACE FUNCTION verify_vault_token(
  p_token_id UUID,
  p_photos TEXT[],
  p_vault_location TEXT DEFAULT 'Bloom Vault #1 - Michigan'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE tokens
  SET
    verification_photos = p_photos,
    vault_location = p_vault_location,
    verified_at = NOW(),
    verified_by = auth.uid(),
    is_exchange_eligible = TRUE,
    status = 'active',
    updated_at = NOW()
  WHERE id = p_token_id
    AND custody_type = 'bloom'
    AND status = 'pending';

  RETURN FOUND;
END;
$$;

-- Update order status (for manual fulfillment workflow)
CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id UUID,
  p_status TEXT,
  p_tracking_number TEXT DEFAULT NULL,
  p_tracking_carrier TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE orders
  SET
    status = p_status,
    tracking_number = COALESCE(p_tracking_number, tracking_number),
    tracking_carrier = COALESCE(p_tracking_carrier, tracking_carrier),
    updated_at = NOW(),
    -- Set timestamp based on status
    fulfilled_at = CASE WHEN p_status = 'fulfilling' THEN NOW() ELSE fulfilled_at END,
    delivered_at = CASE WHEN p_status = 'delivered' THEN NOW() ELSE delivered_at END
  WHERE id = p_order_id;

  RETURN FOUND;
END;
$$;

-- Update token current value (called by price update job)
CREATE OR REPLACE FUNCTION update_token_values_from_assets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Update token current_value from the corresponding asset's current price
  UPDATE tokens t
  SET
    current_value = a.price,
    value_updated_at = NOW()
  FROM orders o
  JOIN assets a ON o.asset_id = a.id
  WHERE t.order_id = o.id
    AND t.status IN ('pending', 'active', 'listed');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
