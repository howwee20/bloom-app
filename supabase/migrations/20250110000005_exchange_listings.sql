-- Migration: Exchange listings table

CREATE TABLE IF NOT EXISTS public.exchange_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  token_id UUID REFERENCES public.tokens NOT NULL,
  ask_price NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'sold')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exchange_listings_user_id ON public.exchange_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_listings_token_id ON public.exchange_listings(token_id);
CREATE INDEX IF NOT EXISTS idx_exchange_listings_status ON public.exchange_listings(status);

ALTER TABLE public.exchange_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own exchange listings"
ON public.exchange_listings
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages exchange listings"
ON public.exchange_listings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
