-- Migration: Create tokens table for Lane A/B checkout
-- Tokens represent user ownership of verified physical items

CREATE TABLE IF NOT EXISTS tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  order_id UUID REFERENCES orders NOT NULL,

  -- Denormalized product info (snapshot at purchase time)
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  size TEXT NOT NULL,
  product_image_url TEXT,

  -- Purchase info
  purchase_price NUMERIC(10, 2) NOT NULL,
  purchase_date TIMESTAMPTZ DEFAULT NOW(),

  -- Custody tracking
  -- 'home' = user has physical possession (Lane A, or redeemed Lane B)
  -- 'bloom' = Bloom vault has physical possession (Lane B, not redeemed)
  custody_type TEXT NOT NULL CHECK (custody_type IN ('home', 'bloom')),

  -- Vault-specific fields (NULL for home custody)
  vault_location TEXT,
  verification_photos TEXT[],
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users,

  -- Exchange eligibility (only 'bloom' custody can be TRUE)
  is_exchange_eligible BOOLEAN DEFAULT FALSE,

  -- Current valuation (updated by price engine)
  current_value NUMERIC(10, 2),
  value_updated_at TIMESTAMPTZ,

  -- Listing state (for exchange)
  is_listed_for_sale BOOLEAN DEFAULT FALSE,
  listing_price NUMERIC(10, 2),
  listed_at TIMESTAMPTZ,

  -- Status flow: pending -> active -> listed -> sold -> redeemed -> transferred
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'listed', 'sold', 'redeemed', 'transferred')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: only bloom custody can be exchange-eligible
  CONSTRAINT tokens_exchange_custody_check CHECK (custody_type = 'bloom' OR is_exchange_eligible = FALSE)
);

-- Indexes for common queries
CREATE INDEX idx_tokens_user_id ON tokens(user_id);
CREATE INDEX idx_tokens_order_id ON tokens(order_id);
CREATE INDEX idx_tokens_status ON tokens(status);
CREATE INDEX idx_tokens_custody ON tokens(custody_type);
CREATE INDEX idx_tokens_listed ON tokens(is_listed_for_sale) WHERE is_listed_for_sale = TRUE;
CREATE INDEX idx_tokens_sku ON tokens(sku);

-- Enable Row Level Security
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;

-- Users can only view their own tokens
CREATE POLICY "Users can view own tokens" ON tokens
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role manages tokens" ON tokens
  FOR ALL USING (auth.role() = 'service_role');

-- Trigger to update updated_at on changes
CREATE OR REPLACE FUNCTION update_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tokens_updated_at_trigger
  BEFORE UPDATE ON tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_tokens_updated_at();
