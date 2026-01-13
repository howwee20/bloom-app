-- Migration: Marketplace execution metadata + sell requests

-- Orders: capture marketplace execution details
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS marketplace TEXT,
  ADD COLUMN IF NOT EXISTS execution_mode TEXT CHECK (execution_mode IN ('brokered', 'exchange', 'internal'));

CREATE INDEX IF NOT EXISTS idx_orders_marketplace ON public.orders(marketplace);

-- Sell requests: Bloom-managed marketplace listing
CREATE TABLE IF NOT EXISTS public.marketplace_sell_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES public.tokens(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  marketplace TEXT NOT NULL,
  size TEXT,
  requested_price NUMERIC(10, 2),
  payout_estimate NUMERIC(10, 2),
  status TEXT DEFAULT 'requested' CHECK (status IN ('requested', 'listed', 'sold', 'cancelled')),
  external_listing_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_sell_requests_user
  ON public.marketplace_sell_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_sell_requests_token
  ON public.marketplace_sell_requests(token_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_sell_requests_status
  ON public.marketplace_sell_requests(status);

ALTER TABLE public.marketplace_sell_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sell requests"
  ON public.marketplace_sell_requests
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can request marketplace sells for own tokens"
  ON public.marketplace_sell_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.tokens t
      WHERE t.id = token_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages sell requests"
  ON public.marketplace_sell_requests
  FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger to update updated_at on changes
CREATE OR REPLACE FUNCTION update_marketplace_sell_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS marketplace_sell_requests_updated_at_trigger ON public.marketplace_sell_requests;
CREATE TRIGGER marketplace_sell_requests_updated_at_trigger
  BEFORE UPDATE ON public.marketplace_sell_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_marketplace_sell_requests_updated_at();
