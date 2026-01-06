-- Migration: Unified Exchange Inventory
-- Merges Bloom assets + user-listed tokens into ONE pool
-- "One pool. One quality. One marketplace."

CREATE OR REPLACE FUNCTION get_unified_exchange_inventory()
RETURNS TABLE (
  id UUID,
  source TEXT,                    -- 'bloom' or 'user'
  product_name TEXT,
  size TEXT,
  image_url TEXT,
  price NUMERIC(10, 2),
  is_instant BOOLEAN,             -- TRUE = in vault (any source), FALSE = acquire
  seller_id UUID,                 -- NULL for Bloom items, user_id for listings
  category TEXT,
  brand TEXT
) AS $$
BEGIN
  RETURN QUERY

  -- ============================================
  -- BLOOM INVENTORY (vault + acquirable)
  -- ============================================
  SELECT
    a.id,
    'bloom'::TEXT AS source,
    a.name AS product_name,
    a.size,
    a.image_url,
    a.price,
    (a.custody_status = 'in_vault')::BOOLEAN AS is_instant,
    NULL::UUID AS seller_id,
    a.category,
    a.brand
  FROM public.assets a
  WHERE a.status = 'listed'
    AND a.owner_id IS NULL  -- Bloom-owned inventory only

  UNION ALL

  -- ============================================
  -- USER-LISTED TOKENS (always instant - item in vault)
  -- ============================================
  SELECT
    t.id,
    'user'::TEXT AS source,
    t.product_name,
    t.size,
    t.product_image_url AS image_url,
    t.listing_price AS price,
    TRUE AS is_instant,  -- User listings are ALWAYS instant (item in vault)
    t.user_id AS seller_id,
    NULL::TEXT AS category,
    NULL::TEXT AS brand
  FROM public.tokens t
  WHERE t.is_listed_for_sale = TRUE
    AND t.status = 'listed'
    AND t.user_id != auth.uid()  -- Exclude current user's own listings

  -- Order: Instant items first, then by price
  ORDER BY is_instant DESC, price ASC;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant access
GRANT EXECUTE ON FUNCTION get_unified_exchange_inventory() TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_unified_exchange_inventory() IS
'Returns unified exchange inventory - Bloom assets + user listings in one pool.
User listings are always "instant" because item is already in vault.';
