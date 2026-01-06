-- Migration: Add highest_bid to assets for spread display
-- This enables showing users what they'd actually GET if they sold (vs market value)

-- Add bid price tracking to assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS highest_bid DECIMAL(10,2);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS bid_updated_at TIMESTAMPTZ;

-- Add sale tracking fields to tokens (for future cash out flow)
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS sold_price DECIMAL(10,2);
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS sale_type TEXT; -- 'p2p', 'instant_cashout', 'external_listing'
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS external_listing_id TEXT;

-- Comment for clarity
COMMENT ON COLUMN assets.highest_bid IS 'StockX highest bid - what user would get if they sold instantly';
COMMENT ON COLUMN assets.bid_updated_at IS 'When the bid price was last updated';
COMMENT ON COLUMN tokens.sale_type IS 'How token was sold: p2p (to another user), instant_cashout (to Bloom via StockX), external_listing (listed on StockX)';
