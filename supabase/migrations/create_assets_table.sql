-- Migration: Create assets table for physical asset wallet/exchange
-- This table stores physical items that can be owned and traded

-- 1. Create assets table
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'listed' CHECK (status IN ('listed', 'sold', 'reserved', 'pending')),
  size TEXT,
  description TEXT,
  provenance TEXT,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create indexes for common queries
CREATE INDEX idx_assets_owner_id ON public.assets(owner_id);
CREATE INDEX idx_assets_status ON public.assets(status);
CREATE INDEX idx_assets_created_at ON public.assets(created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Anyone can view listed assets or Bloom-owned assets (owner_id IS NULL)
CREATE POLICY "Anyone can view available assets" ON public.assets
  FOR SELECT USING (status = 'listed' OR owner_id IS NULL);

-- Users can view their own assets regardless of status
CREATE POLICY "Users can view their own assets" ON public.assets
  FOR SELECT USING (auth.uid() = owner_id);

-- Only authenticated users can purchase (update owner_id)
CREATE POLICY "Authenticated users can purchase assets" ON public.assets
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND (status = 'listed' OR owner_id IS NULL)
  )
  WITH CHECK (auth.uid() = owner_id);

-- 5. Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger for updated_at
CREATE TRIGGER trigger_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION update_assets_updated_at();

-- 7. Create RPC function to get user's portfolio value
CREATE OR REPLACE FUNCTION get_portfolio_value()
RETURNS NUMERIC AS $$
DECLARE
  total_value NUMERIC;
BEGIN
  SELECT COALESCE(SUM(price), 0) INTO total_value
  FROM public.assets
  WHERE owner_id = auth.uid();

  RETURN total_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_portfolio_value() TO authenticated;

-- 8. Create RPC function to purchase an asset
CREATE OR REPLACE FUNCTION purchase_asset(asset_id UUID)
RETURNS JSON AS $$
DECLARE
  asset_record RECORD;
  result JSON;
BEGIN
  -- Get the asset and lock it
  SELECT * INTO asset_record
  FROM public.assets
  WHERE id = asset_id
  FOR UPDATE;

  -- Validate asset exists
  IF asset_record IS NULL THEN
    RAISE EXCEPTION 'Asset not found';
  END IF;

  -- Validate asset is available
  IF asset_record.status != 'listed' AND asset_record.owner_id IS NOT NULL THEN
    RAISE EXCEPTION 'Asset is not available for purchase';
  END IF;

  -- Transfer ownership
  UPDATE public.assets
  SET
    owner_id = auth.uid(),
    status = 'sold'
  WHERE id = asset_id;

  -- Return success
  result := json_build_object(
    'success', true,
    'assetId', asset_id,
    'newOwnerId', auth.uid()
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION purchase_asset(UUID) TO authenticated;

-- 9. Grant table permissions
GRANT SELECT ON public.assets TO authenticated;
GRANT UPDATE ON public.assets TO authenticated;
