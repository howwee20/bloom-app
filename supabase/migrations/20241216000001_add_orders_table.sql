-- Orders table for tracking purchases
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  asset_id UUID REFERENCES assets NOT NULL,

  -- Stripe fields
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,

  -- Order details
  size TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,

  -- Status flow: pending_payment → paid → fulfilling → shipped → delivered → complete
  status TEXT DEFAULT 'pending_payment',

  -- Fulfillment tracking
  stockx_order_id TEXT,
  tracking_number TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_session_id);

-- RLS policies
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert/update (via Edge Functions)
CREATE POLICY "Service role can manage orders" ON orders
  FOR ALL USING (auth.role() = 'service_role');

-- Function to get user's orders with asset details
CREATE OR REPLACE FUNCTION get_user_orders()
RETURNS TABLE (
  id UUID,
  asset_id UUID,
  asset_name TEXT,
  asset_image_url TEXT,
  size TEXT,
  amount_cents INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ,
  tracking_number TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.asset_id,
    a.name AS asset_name,
    a.image_url AS asset_image_url,
    o.size,
    o.amount_cents,
    o.status,
    o.created_at,
    o.tracking_number
  FROM orders o
  JOIN assets a ON o.asset_id = a.id
  WHERE o.user_id = auth.uid()
  ORDER BY o.created_at DESC;
END;
$$;

-- Function to complete an order (assign token to buyer)
CREATE OR REPLACE FUNCTION complete_order(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_new_asset_id UUID;
BEGIN
  -- Get the order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status != 'delivered' THEN
    RAISE EXCEPTION 'Order must be delivered before completing';
  END IF;

  -- Create a new asset record for the buyer (the "token")
  INSERT INTO assets (
    name,
    image_url,
    price,
    owner_id,
    status,
    size,
    stockx_sku,
    stockx_slug,
    description,
    provenance,
    category
  )
  SELECT
    a.name,
    a.image_url,
    v_order.amount_cents / 100.0,
    v_order.user_id,
    'owned',
    v_order.size,
    a.stockx_sku,
    a.stockx_slug,
    a.description,
    'Purchased via Bloom Exchange on ' || NOW()::DATE,
    a.category
  FROM assets a
  WHERE a.id = v_order.asset_id
  RETURNING id INTO v_new_asset_id;

  -- Update order status
  UPDATE orders
  SET status = 'complete', updated_at = NOW()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$;
