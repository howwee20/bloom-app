-- Step 1: Setup for Price Worker
-- Add columns for SKU tracking and quotes table

-- Add columns for SKU tracking
ALTER TABLE assets ADD COLUMN IF NOT EXISTS stockx_sku TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS curated BOOLEAN DEFAULT false;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS base_price NUMERIC(10,2);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ;

-- Create quotes table for price locking
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id),
  user_id UUID REFERENCES auth.users(id),
  base_price NUMERIC(10,2),
  total_price NUMERIC(10,2),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used BOOLEAN DEFAULT false,
  stripe_session_id TEXT
);

-- Enable RLS on quotes
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quotes"
ON quotes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage quotes"
ON quotes FOR ALL
USING (auth.role() = 'service_role');

-- Mark curated items and add SKUs
UPDATE assets SET curated = true, stockx_sku = 'FV5029-010' WHERE name ILIKE '%Black Cat%';
UPDATE assets SET curated = true, stockx_sku = 'CT8012-004' WHERE name ILIKE '%Gamma Blue%';
UPDATE assets SET curated = true, stockx_sku = 'DD1391-100' WHERE name ILIKE '%Panda%';
UPDATE assets SET curated = true, stockx_sku = 'HQ6448' WHERE name ILIKE '%Yeezy%Slide%Onyx%';
UPDATE assets SET curated = true, stockx_sku = 'B75806' WHERE name ILIKE '%Samba%';
UPDATE assets SET curated = true, stockx_sku = '1201A844-001' WHERE name ILIKE '%1130%';
UPDATE assets SET curated = true, stockx_sku = 'U9060BLK' WHERE name ILIKE '%9060%';
UPDATE assets SET curated = true, stockx_sku = 'CT8012-141' WHERE name ILIKE '%Legend Blue%';
UPDATE assets SET curated = true, stockx_sku = 'DZ5485-612' WHERE name ILIKE '%Lost%Found%';
UPDATE assets SET curated = true, stockx_sku = 'DO9392-700' WHERE name ILIKE '%SB Dunk%Nardwuar%';
UPDATE assets SET curated = true, stockx_sku = 'GX7138' WHERE name ILIKE '%Yeezy%Flax%';
