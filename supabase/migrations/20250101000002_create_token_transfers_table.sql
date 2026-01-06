-- Migration: Create token_transfers table for provenance tracking
-- Records every transfer of token ownership

CREATE TABLE IF NOT EXISTS token_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens NOT NULL,

  -- From NULL for initial_grant (first issuance after purchase)
  from_user_id UUID REFERENCES auth.users,
  to_user_id UUID REFERENCES auth.users NOT NULL,

  -- Type of transfer
  transfer_type TEXT NOT NULL CHECK (transfer_type IN (
    'initial_grant',   -- First issuance after purchase
    'exchange_sale',   -- Sold on exchange
    'redemption'       -- Transferred out for physical delivery
  )),

  -- For exchange sales
  sale_price NUMERIC(10, 2),
  bloom_fee NUMERIC(10, 2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_token_transfers_token ON token_transfers(token_id);
CREATE INDEX idx_token_transfers_from ON token_transfers(from_user_id);
CREATE INDEX idx_token_transfers_to ON token_transfers(to_user_id);
CREATE INDEX idx_token_transfers_type ON token_transfers(transfer_type);

-- Enable Row Level Security
ALTER TABLE token_transfers ENABLE ROW LEVEL SECURITY;

-- Users can view transfers involving them
CREATE POLICY "Users can view transfers involving them" ON token_transfers
  FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Service role can manage all transfers
CREATE POLICY "Service role manages transfers" ON token_transfers
  FOR ALL USING (auth.role() = 'service_role');
