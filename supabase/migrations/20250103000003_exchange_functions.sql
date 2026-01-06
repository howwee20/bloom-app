-- Migration: Token Exchange Functions
-- Allows users to list tokens for sale and buy tokens from other users

-- 1. RPC to list a token for sale
CREATE OR REPLACE FUNCTION list_token_for_sale(
  p_token_id UUID,
  p_listing_price NUMERIC(10, 2)
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token tokens%ROWTYPE;
  v_result JSON;
BEGIN
  -- Get the token and verify ownership
  SELECT * INTO v_token
  FROM tokens
  WHERE id = p_token_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Token not found or not owned by user');
  END IF;

  -- Check if token is exchange eligible
  IF NOT v_token.is_exchange_eligible THEN
    RETURN json_build_object('success', false, 'error', 'Token is not exchange eligible');
  END IF;

  -- Check if token is in valid status
  IF v_token.status NOT IN ('active', 'in_custody') THEN
    RETURN json_build_object('success', false, 'error', 'Token cannot be listed in its current status');
  END IF;

  -- Validate price (minimum $50, maximum $50,000)
  IF p_listing_price < 50 OR p_listing_price > 50000 THEN
    RETURN json_build_object('success', false, 'error', 'Listing price must be between $50 and $50,000');
  END IF;

  -- Update the token
  UPDATE tokens
  SET
    is_listed_for_sale = TRUE,
    listing_price = p_listing_price,
    listed_at = NOW(),
    status = 'listed',
    updated_at = NOW()
  WHERE id = p_token_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Token listed successfully',
    'listing_price', p_listing_price
  );
END;
$$;

-- 2. RPC to unlist a token
CREATE OR REPLACE FUNCTION unlist_token(p_token_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token tokens%ROWTYPE;
BEGIN
  -- Get the token and verify ownership
  SELECT * INTO v_token
  FROM tokens
  WHERE id = p_token_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Token not found or not owned by user');
  END IF;

  -- Check if token is listed
  IF NOT v_token.is_listed_for_sale THEN
    RETURN json_build_object('success', false, 'error', 'Token is not listed');
  END IF;

  -- Update the token
  UPDATE tokens
  SET
    is_listed_for_sale = FALSE,
    listing_price = NULL,
    listed_at = NULL,
    status = 'in_custody',
    updated_at = NOW()
  WHERE id = p_token_id;

  RETURN json_build_object('success', true, 'message', 'Token unlisted successfully');
END;
$$;

-- 3. RPC to update listing price
CREATE OR REPLACE FUNCTION update_listing_price(
  p_token_id UUID,
  p_new_price NUMERIC(10, 2)
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token tokens%ROWTYPE;
BEGIN
  -- Get the token and verify ownership
  SELECT * INTO v_token
  FROM tokens
  WHERE id = p_token_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Token not found or not owned by user');
  END IF;

  -- Check if token is listed
  IF NOT v_token.is_listed_for_sale THEN
    RETURN json_build_object('success', false, 'error', 'Token is not listed');
  END IF;

  -- Validate price
  IF p_new_price < 50 OR p_new_price > 50000 THEN
    RETURN json_build_object('success', false, 'error', 'Price must be between $50 and $50,000');
  END IF;

  -- Update the price
  UPDATE tokens
  SET
    listing_price = p_new_price,
    updated_at = NOW()
  WHERE id = p_token_id;

  RETURN json_build_object('success', true, 'message', 'Price updated successfully', 'new_price', p_new_price);
END;
$$;

-- 4. RPC to get all exchange listings (tokens listed for sale)
CREATE OR REPLACE FUNCTION get_exchange_listings()
RETURNS TABLE (
  id UUID,
  seller_id UUID,
  sku TEXT,
  product_name TEXT,
  size TEXT,
  product_image_url TEXT,
  listing_price NUMERIC(10, 2),
  listed_at TIMESTAMPTZ,
  purchase_price NUMERIC(10, 2),
  current_value NUMERIC(10, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.user_id AS seller_id,
    t.sku,
    t.product_name,
    t.size,
    t.product_image_url,
    t.listing_price,
    t.listed_at,
    t.purchase_price,
    t.current_value
  FROM tokens t
  WHERE t.is_listed_for_sale = TRUE
    AND t.status = 'listed'
    AND t.user_id != auth.uid() -- Exclude user's own listings
  ORDER BY t.listed_at DESC;
END;
$$;

-- 5. RPC to get user's own listings
CREATE OR REPLACE FUNCTION get_my_listings()
RETURNS TABLE (
  id UUID,
  sku TEXT,
  product_name TEXT,
  size TEXT,
  product_image_url TEXT,
  listing_price NUMERIC(10, 2),
  listed_at TIMESTAMPTZ,
  purchase_price NUMERIC(10, 2),
  current_value NUMERIC(10, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.sku,
    t.product_name,
    t.size,
    t.product_image_url,
    t.listing_price,
    t.listed_at,
    t.purchase_price,
    t.current_value
  FROM tokens t
  WHERE t.user_id = auth.uid()
    AND t.is_listed_for_sale = TRUE
    AND t.status = 'listed'
  ORDER BY t.listed_at DESC;
END;
$$;

-- 6. RPC to get a single listing detail (for buy flow)
CREATE OR REPLACE FUNCTION get_listing_detail(p_token_id UUID)
RETURNS TABLE (
  id UUID,
  seller_id UUID,
  sku TEXT,
  product_name TEXT,
  size TEXT,
  product_image_url TEXT,
  listing_price NUMERIC(10, 2),
  listed_at TIMESTAMPTZ,
  current_value NUMERIC(10, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.user_id AS seller_id,
    t.sku,
    t.product_name,
    t.size,
    t.product_image_url,
    t.listing_price,
    t.listed_at,
    t.current_value
  FROM tokens t
  WHERE t.id = p_token_id
    AND t.is_listed_for_sale = TRUE
    AND t.status = 'listed';
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION list_token_for_sale(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION unlist_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_listing_price(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION get_exchange_listings() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_listings() TO authenticated;
GRANT EXECUTE ON FUNCTION get_listing_detail(UUID) TO authenticated;

-- 7. Create token_transfers table to track exchange trades
CREATE TABLE IF NOT EXISTS token_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens NOT NULL,
  seller_id UUID REFERENCES auth.users NOT NULL,
  buyer_id UUID REFERENCES auth.users NOT NULL,
  sale_price NUMERIC(10, 2) NOT NULL,
  platform_fee NUMERIC(10, 2) NOT NULL, -- 3% fee
  seller_payout NUMERIC(10, 2) NOT NULL,
  stripe_payment_intent_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_token_trades_token ON token_trades(token_id);
CREATE INDEX IF NOT EXISTS idx_token_trades_seller ON token_trades(seller_id);
CREATE INDEX IF NOT EXISTS idx_token_trades_buyer ON token_trades(buyer_id);

-- RLS for token_trades
ALTER TABLE token_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trades" ON token_trades
  FOR SELECT USING (auth.uid() = seller_id OR auth.uid() = buyer_id);

CREATE POLICY "Service role manages trades" ON token_trades
  FOR ALL USING (auth.role() = 'service_role');
