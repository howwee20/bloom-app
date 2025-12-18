-- Migration: Pricing Configuration Table
-- Stores configurable fee rates for Michigan all-in pricing calculation

-- Create singleton pricing config table
CREATE TABLE IF NOT EXISTS public.pricing_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Fee rates (calibrated from real StockX checkout)
  processing_rate NUMERIC(6, 5) DEFAULT 0.04831,   -- 4.831% processing fee
  tax_rate NUMERIC(6, 5) DEFAULT 0.06,             -- 6% Michigan sales tax
  -- Shipping fees by category
  shipping_sneakers NUMERIC(10, 2) DEFAULT 14.95,
  shipping_slides NUMERIC(10, 2) DEFAULT 14.95,
  shipping_collectibles NUMERIC(10, 2) DEFAULT 14.95,
  -- Staleness thresholds
  stale_minutes INTEGER DEFAULT 240,               -- 4 hours before price is stale
  quote_expiration_minutes INTEGER DEFAULT 10,     -- 10 minutes to complete checkout
  -- ALIVE Protocol
  alive_fluctuation NUMERIC(6, 5) DEFAULT 0.015,   -- +/- 1.5% synthetic fluctuation
  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config
INSERT INTO public.pricing_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Grant access to authenticated users (read-only)
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing config is readable by all"
ON public.pricing_config FOR SELECT
USING (true);

-- Only service role can update config
CREATE POLICY "Only service role can update config"
ON public.pricing_config FOR UPDATE
USING (auth.role() = 'service_role');

-- Add comment for documentation
COMMENT ON TABLE public.pricing_config IS 'Singleton table storing configurable pricing parameters for Michigan all-in calculation';
