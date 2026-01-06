-- Migration: Ownership-First Model Refactor
-- This migration pivots from two-lane checkout to ownership-first model
-- All purchases are now ownership purchases with redemption from portfolio

-- =============================================================================
-- 1. UPDATE TOKEN STATUS CONSTRAINT
-- =============================================================================
-- New statuses:
--   'acquiring'  - Bloom is purchasing and shipping to custody
--   'in_custody' - Item received and verified, token is LIVE (tradeable)
--   'listed'     - Listed for sale on exchange
--   'sold'       - Sold to another user
--   'redeeming'  - User requested redemption, shipping to them
--   'shipped'    - Redemption shipment in transit
--   'redeemed'   - User has physical possession, no longer tradeable

ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_status_check;
ALTER TABLE tokens ADD CONSTRAINT tokens_status_check
  CHECK (status IN ('acquiring', 'in_custody', 'listed', 'sold', 'redeeming', 'shipped', 'redeemed'));

-- =============================================================================
-- 2. MIGRATE EXISTING TOKENS TO NEW STATUSES
-- =============================================================================
-- Bloom custody pending → acquiring
UPDATE tokens SET status = 'acquiring' WHERE status = 'pending' AND custody_type = 'bloom';

-- Bloom custody active → in_custody
UPDATE tokens SET status = 'in_custody' WHERE status = 'active' AND custody_type = 'bloom';

-- Home custody (existing Lane A) = user already has physical possession = 'redeemed'
UPDATE tokens SET status = 'redeemed', custody_type = 'bloom' WHERE custody_type = 'home';

-- =============================================================================
-- 3. ADD REDEMPTION FIELDS TO TOKENS TABLE
-- =============================================================================
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS redemption_name TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS redemption_address_line1 TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS redemption_address_line2 TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS redemption_city TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS redemption_state TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS redemption_zip TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS redemption_requested_at TIMESTAMPTZ;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS redemption_shipped_at TIMESTAMPTZ;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS redemption_delivered_at TIMESTAMPTZ;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS redemption_tracking_number TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS redemption_tracking_carrier TEXT;

-- =============================================================================
-- 4. CREATE REDEMPTION REQUEST FUNCTION
-- =============================================================================
CREATE OR REPLACE FUNCTION request_token_redemption(
  p_token_id UUID,
  p_name TEXT,
  p_address_line1 TEXT,
  p_address_line2 TEXT,
  p_city TEXT,
  p_state TEXT,
  p_zip TEXT
) RETURNS tokens AS $$
DECLARE
  v_token tokens;
BEGIN
  UPDATE tokens SET
    status = 'redeeming',
    redemption_name = p_name,
    redemption_address_line1 = p_address_line1,
    redemption_address_line2 = p_address_line2,
    redemption_city = p_city,
    redemption_state = p_state,
    redemption_zip = p_zip,
    redemption_requested_at = NOW(),
    is_exchange_eligible = FALSE,
    updated_at = NOW()
  WHERE id = p_token_id
    AND user_id = auth.uid()
    AND status = 'in_custody'
  RETURNING * INTO v_token;

  IF v_token IS NULL THEN
    RAISE EXCEPTION 'Token not found or not eligible for redemption';
  END IF;

  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. UPDATE GET_USER_TOKENS TO USE NEW STATUSES
-- =============================================================================
-- Drop existing function first (return type changed)
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
  redemption_requested_at TIMESTAMPTZ,
  redemption_tracking_number TEXT,
  redemption_delivered_at TIMESTAMPTZ
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
    t.status,
    t.redemption_requested_at,
    t.redemption_tracking_number,
    t.redemption_delivered_at
  FROM tokens t
  WHERE t.user_id = auth.uid()
    AND t.status IN ('acquiring', 'in_custody', 'listed', 'redeeming', 'shipped', 'redeemed')
  ORDER BY t.purchase_date DESC;
END;
$$;

-- =============================================================================
-- 6. UPDATE GET_TOKEN_PORTFOLIO_SUMMARY FOR NEW MODEL
-- =============================================================================
-- Drop existing function first (return type changed)
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
    COUNT(*) FILTER (WHERE t.status IN ('in_custody', 'listed'))::INTEGER AS in_custody_count,
    COUNT(*) FILTER (WHERE t.status = 'acquiring')::INTEGER AS acquiring_count,
    COUNT(*) FILTER (WHERE t.status IN ('redeeming', 'shipped'))::INTEGER AS redeeming_count,
    COUNT(*) FILTER (WHERE t.status = 'redeemed')::INTEGER AS redeemed_count
  FROM tokens t
  WHERE t.user_id = auth.uid()
    AND t.status IN ('acquiring', 'in_custody', 'listed', 'redeeming', 'shipped', 'redeemed');
END;
$$;

-- =============================================================================
-- 7. UPDATE GET_TOKEN_DETAIL FOR REDEMPTION INFO
-- =============================================================================
-- Drop existing function first (return type changed)
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
  redemption_name TEXT,
  redemption_address_line1 TEXT,
  redemption_address_line2 TEXT,
  redemption_city TEXT,
  redemption_state TEXT,
  redemption_zip TEXT,
  redemption_requested_at TIMESTAMPTZ,
  redemption_shipped_at TIMESTAMPTZ,
  redemption_delivered_at TIMESTAMPTZ,
  redemption_tracking_number TEXT,
  redemption_tracking_carrier TEXT
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
    t.status,
    t.redemption_name,
    t.redemption_address_line1,
    t.redemption_address_line2,
    t.redemption_city,
    t.redemption_state,
    t.redemption_zip,
    t.redemption_requested_at,
    t.redemption_shipped_at,
    t.redemption_delivered_at,
    t.redemption_tracking_number,
    t.redemption_tracking_carrier
  FROM tokens t
  WHERE t.id = p_token_id
    AND t.user_id = auth.uid();
END;
$$;

-- =============================================================================
-- 8. UPDATE ADMIN FUNCTIONS FOR NEW STATUSES
-- =============================================================================

-- Activate token after Bloom receives and verifies item
CREATE OR REPLACE FUNCTION activate_token(p_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_id UUID;
BEGIN
  -- Update token status from acquiring to in_custody
  UPDATE tokens
  SET
    status = 'in_custody',
    is_exchange_eligible = TRUE,
    updated_at = NOW()
  WHERE order_id = p_order_id
    AND status = 'acquiring'
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

-- Verify vault token (same as before but uses new status)
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
    status = 'in_custody',
    updated_at = NOW()
  WHERE id = p_token_id
    AND custody_type = 'bloom'
    AND status = 'acquiring';

  RETURN FOUND;
END;
$$;

-- Update token values (uses new statuses)
CREATE OR REPLACE FUNCTION update_token_values_from_assets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE tokens t
  SET
    current_value = a.price,
    value_updated_at = NOW()
  FROM orders o
  JOIN assets a ON o.asset_id = a.id
  WHERE t.order_id = o.id
    AND t.status IN ('acquiring', 'in_custody', 'listed');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- =============================================================================
-- 9. ADD ADMIN FUNCTION FOR REDEMPTION FULFILLMENT
-- =============================================================================
CREATE OR REPLACE FUNCTION update_redemption_status(
  p_token_id UUID,
  p_status TEXT,
  p_tracking_number TEXT DEFAULT NULL,
  p_tracking_carrier TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate status
  IF p_status NOT IN ('shipped', 'redeemed') THEN
    RAISE EXCEPTION 'Invalid redemption status: must be shipped or redeemed';
  END IF;

  UPDATE tokens
  SET
    status = p_status,
    redemption_tracking_number = COALESCE(p_tracking_number, redemption_tracking_number),
    redemption_tracking_carrier = COALESCE(p_tracking_carrier, redemption_tracking_carrier),
    redemption_shipped_at = CASE WHEN p_status = 'shipped' THEN NOW() ELSE redemption_shipped_at END,
    redemption_delivered_at = CASE WHEN p_status = 'redeemed' THEN NOW() ELSE redemption_delivered_at END,
    updated_at = NOW()
  WHERE id = p_token_id
    AND status IN ('redeeming', 'shipped');

  RETURN FOUND;
END;
$$;
