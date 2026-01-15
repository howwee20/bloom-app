-- Permissionless Offer Indexing System ("Backrub for Commerce")
-- Separates indexing (background) from querying (instant)

-- 1) product_sources: The link graph (product -> merchant URLs)
CREATE TABLE IF NOT EXISTS product_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES catalog_items(id) ON DELETE CASCADE,
  style_code TEXT NOT NULL,
  merchant TEXT NOT NULL, -- 'nike', 'adidas', 'stockx', 'goat', 'grailed', 'ebay', etc.
  url TEXT NOT NULL,
  adapter_type TEXT NOT NULL, -- 'jsonld' | 'next_data' | 'shopify' | 'api' | 'playwright'
  confidence NUMERIC DEFAULT 1.0,
  last_verified_at TIMESTAMPTZ,
  last_error TEXT, -- Store last extraction error for debugging
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(style_code, merchant, url)
);

-- Index for fast lookups by product
CREATE INDEX IF NOT EXISTS idx_product_sources_product ON product_sources(product_id);
CREATE INDEX IF NOT EXISTS idx_product_sources_style ON product_sources(style_code);
CREATE INDEX IF NOT EXISTS idx_product_sources_merchant ON product_sources(merchant);

-- 2) offers: The indexed offers (cached prices)
CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES catalog_items(id) ON DELETE CASCADE,
  style_code TEXT NOT NULL,
  merchant TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  in_stock BOOLEAN DEFAULT true,
  sizes JSONB, -- [{size: "10", available: true, price: 120}]
  image_url TEXT,
  product_url TEXT NOT NULL,
  condition TEXT DEFAULT 'new', -- 'new' | 'used' | 'deadstock'
  title TEXT, -- Product title from merchant
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  source_id UUID REFERENCES product_sources(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast offer queries
CREATE INDEX IF NOT EXISTS idx_offers_product ON offers(product_id);
CREATE INDEX IF NOT EXISTS idx_offers_style ON offers(style_code);
CREATE INDEX IF NOT EXISTS idx_offers_expires ON offers(expires_at);
CREATE INDEX IF NOT EXISTS idx_offers_price ON offers(style_code, price);
CREATE INDEX IF NOT EXISTS idx_offers_merchant ON offers(merchant);

-- 3) Trigger to update updated_at on product_sources
CREATE OR REPLACE FUNCTION update_product_sources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_sources_updated_at ON product_sources;
CREATE TRIGGER product_sources_updated_at
  BEFORE UPDATE ON product_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_product_sources_updated_at();

-- 4) RPC to get offers for a product (with freshness info)
CREATE OR REPLACE FUNCTION get_offers_for_product(
  p_product_id UUID DEFAULT NULL,
  p_style_code TEXT DEFAULT NULL,
  p_include_expired BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  merchant TEXT,
  price NUMERIC,
  currency TEXT,
  in_stock BOOLEAN,
  sizes JSONB,
  image_url TEXT,
  product_url TEXT,
  condition TEXT,
  title TEXT,
  fetched_at TIMESTAMPTZ,
  is_stale BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.merchant,
    o.price,
    o.currency,
    o.in_stock,
    o.sizes,
    o.image_url,
    o.product_url,
    o.condition,
    o.title,
    o.fetched_at,
    (o.expires_at < NOW()) AS is_stale
  FROM offers o
  WHERE
    (p_product_id IS NULL OR o.product_id = p_product_id)
    AND (p_style_code IS NULL OR o.style_code = p_style_code)
    AND (p_include_expired OR o.expires_at > NOW())
  ORDER BY o.price ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) RPC to upsert an offer (used by refresh orchestrator)
CREATE OR REPLACE FUNCTION upsert_offer(
  p_product_id UUID,
  p_style_code TEXT,
  p_merchant TEXT,
  p_price NUMERIC,
  p_product_url TEXT,
  p_image_url TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_sizes JSONB DEFAULT NULL,
  p_condition TEXT DEFAULT 'new',
  p_ttl_minutes INTEGER DEFAULT 30
)
RETURNS UUID AS $$
DECLARE
  v_offer_id UUID;
BEGIN
  INSERT INTO offers (
    product_id, style_code, merchant, price, product_url,
    image_url, title, sizes, condition,
    fetched_at, expires_at
  )
  VALUES (
    p_product_id, p_style_code, p_merchant, p_price, p_product_url,
    p_image_url, p_title, p_sizes, p_condition,
    NOW(), NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
  )
  ON CONFLICT (style_code, merchant, product_url)
  DO UPDATE SET
    price = EXCLUDED.price,
    image_url = COALESCE(EXCLUDED.image_url, offers.image_url),
    title = COALESCE(EXCLUDED.title, offers.title),
    sizes = COALESCE(EXCLUDED.sizes, offers.sizes),
    condition = EXCLUDED.condition,
    fetched_at = NOW(),
    expires_at = NOW() + (p_ttl_minutes || ' minutes')::INTERVAL
  RETURNING id INTO v_offer_id;

  RETURN v_offer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add unique constraint for upsert to work
ALTER TABLE offers ADD CONSTRAINT offers_unique_merchant_url
  UNIQUE (style_code, merchant, product_url);

-- 6) RPC to clean up expired offers (called by cron)
CREATE OR REPLACE FUNCTION cleanup_expired_offers(p_older_than_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM offers
  WHERE expires_at < NOW() - (p_older_than_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7) Enable RLS
ALTER TABLE product_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

-- Public read access for both tables
CREATE POLICY "Public read access for product_sources" ON product_sources
  FOR SELECT TO public USING (true);

CREATE POLICY "Public read access for offers" ON offers
  FOR SELECT TO public USING (true);

-- Service role can do everything
CREATE POLICY "Service role full access for product_sources" ON product_sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access for offers" ON offers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION get_offers_for_product TO public;
GRANT EXECUTE ON FUNCTION upsert_offer TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_offers TO service_role;
