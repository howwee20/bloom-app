-- Migration: Add Quote Expiration to Orders
-- Enables price locking with expiration to prevent slippage

-- Add quote-related columns to orders table
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS quote_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS price_breakdown JSONB,
ADD COLUMN IF NOT EXISTS base_price NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS processing_fee NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS sales_tax NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10, 2);

-- Add index for expired quote cleanup
CREATE INDEX IF NOT EXISTS idx_orders_quote_expires
ON public.orders(quote_expires_at)
WHERE status = 'pending_payment';

-- Function to clean up expired pending orders (run via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_quotes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE public.orders
  SET status = 'expired'
  WHERE status = 'pending_payment'
    AND quote_expires_at IS NOT NULL
    AND quote_expires_at < NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

COMMENT ON COLUMN public.orders.quote_expires_at IS 'Timestamp when the quoted price expires (typically 10 minutes from creation)';
COMMENT ON COLUMN public.orders.price_breakdown IS 'JSON breakdown of price components: { base, processingFee, salesTax, shippingFee }';
