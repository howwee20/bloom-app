-- Migration: Stripe Saved Cards for True 3-Tap Buying
-- Adds Stripe Customer + PaymentMethod tracking to profile
-- Adds payment fields to order_intents for instant checkout

-- 1) Add Stripe fields to profile table
ALTER TABLE public.profile
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_default_payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_card_last4 TEXT,
  ADD COLUMN IF NOT EXISTS stripe_card_brand TEXT;

-- Index for quick Stripe customer lookup
CREATE INDEX IF NOT EXISTS idx_profile_stripe_customer_id ON public.profile(stripe_customer_id);

-- 2) Add payment fields to order_intents
ALTER TABLE public.order_intents
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_charge_status TEXT
    CHECK (stripe_charge_status IS NULL OR stripe_charge_status IN (
      'requires_payment_method',
      'requires_confirmation',
      'requires_action',
      'processing',
      'succeeded',
      'failed',
      'canceled'
    )),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Index for webhook reconciliation
CREATE INDEX IF NOT EXISTS idx_order_intents_stripe_pi ON public.order_intents(stripe_payment_intent_id);

-- 3) Also add to orders table for consistency
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_charge_status TEXT
    CHECK (stripe_charge_status IS NULL OR stripe_charge_status IN (
      'requires_payment_method',
      'requires_confirmation',
      'requires_action',
      'processing',
      'succeeded',
      'failed',
      'canceled'
    ));

-- 4) RPC to get user's Stripe payment info
CREATE OR REPLACE FUNCTION get_stripe_payment_info()
RETURNS TABLE (
  has_saved_card BOOLEAN,
  stripe_customer_id TEXT,
  card_last4 TEXT,
  card_brand TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.stripe_default_payment_method_id IS NOT NULL AS has_saved_card,
    p.stripe_customer_id,
    p.stripe_card_last4 AS card_last4,
    p.stripe_card_brand AS card_brand
  FROM public.profile p
  WHERE p.id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION get_stripe_payment_info() TO authenticated;

-- 5) RPC to save Stripe payment info (called by edge function)
CREATE OR REPLACE FUNCTION save_stripe_payment_info(
  p_user_id UUID,
  p_customer_id TEXT,
  p_payment_method_id TEXT DEFAULT NULL,
  p_card_last4 TEXT DEFAULT NULL,
  p_card_brand TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profile
  SET
    stripe_customer_id = COALESCE(p_customer_id, stripe_customer_id),
    stripe_default_payment_method_id = COALESCE(p_payment_method_id, stripe_default_payment_method_id),
    stripe_card_last4 = COALESCE(p_card_last4, stripe_card_last4),
    stripe_card_brand = COALESCE(p_card_brand, stripe_card_brand)
  WHERE id = p_user_id;

  RETURN FOUND;
END;
$$;

-- Only service role can update Stripe info (from edge functions)
GRANT EXECUTE ON FUNCTION save_stripe_payment_info(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 6) RPC to clear saved payment method (user action)
CREATE OR REPLACE FUNCTION clear_saved_payment_method()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profile
  SET
    stripe_default_payment_method_id = NULL,
    stripe_card_last4 = NULL,
    stripe_card_brand = NULL
  WHERE id = auth.uid();

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION clear_saved_payment_method() TO authenticated;

-- 7) Update get_user_order_intents to include payment info
DROP FUNCTION IF EXISTS get_user_order_intents();
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
  stripe_charge_status TEXT,
  paid_at TIMESTAMPTZ,
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
      WHEN 'pending' THEN
        CASE oi.stripe_charge_status
          WHEN 'succeeded' THEN 'Paid'
          WHEN 'processing' THEN 'Processing...'
          WHEN 'requires_action' THEN 'Action Required'
          WHEN 'failed' THEN 'Payment Failed'
          ELSE 'Requested'
        END
      WHEN 'executing' THEN 'Buying...'
      WHEN 'ordered' THEN 'Ordered'
      WHEN 'shipped' THEN 'In transit'
      WHEN 'delivered' THEN CASE WHEN oi.route = 'bloom' THEN 'In Bloom' ELSE 'Delivered' END
      WHEN 'cancelled' THEN 'Cancelled'
      WHEN 'failed' THEN 'Failed'
      ELSE oi.status
    END AS status_label,
    oi.stripe_charge_status,
    oi.paid_at,
    oi.created_at,
    oi.updated_at
  FROM public.order_intents oi
  WHERE oi.user_id = auth.uid()
  ORDER BY oi.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_order_intents() TO authenticated;

-- 8) Update admin function to include payment info
DROP FUNCTION IF EXISTS get_all_order_intents(TEXT);
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
  stripe_payment_intent_id TEXT,
  stripe_charge_status TEXT,
  paid_at TIMESTAMPTZ,
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
    oi.stripe_payment_intent_id,
    oi.stripe_charge_status,
    oi.paid_at,
    oi.created_at,
    oi.updated_at
  FROM public.order_intents oi
  LEFT JOIN auth.users u ON oi.user_id = u.id
  WHERE (p_status IS NULL OR oi.status = p_status)
  ORDER BY oi.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_order_intents(TEXT) TO service_role;
