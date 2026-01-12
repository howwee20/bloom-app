-- Migration: Asset price points for charts + stats

CREATE TABLE IF NOT EXISTS public.asset_price_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price NUMERIC(10, 2) NOT NULL,
  source TEXT DEFAULT 'stockx'
);

CREATE INDEX IF NOT EXISTS idx_asset_price_points_asset_ts
ON public.asset_price_points(asset_id, ts DESC);

ALTER TABLE public.asset_price_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Asset price points readable by authenticated users"
ON public.asset_price_points
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role manages asset price points"
ON public.asset_price_points
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
