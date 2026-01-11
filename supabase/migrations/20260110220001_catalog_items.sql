-- Migration: Catalog items + search + asset linking

-- 1) Extensions for search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2) Catalog items table
CREATE TABLE IF NOT EXISTS public.catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  colorway_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  style_code TEXT NOT NULL UNIQUE,
  release_year INT,
  image_url_thumb TEXT,
  aliases TEXT[],
  popularity_rank INT NOT NULL,
  search_text TEXT GENERATED ALWAYS AS (
    unaccent(lower(
      display_name || ' ' || style_code || ' ' || COALESCE(array_to_string(aliases, ' '), '')
    ))
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_catalog_items_search_text
ON public.catalog_items USING gin (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_catalog_items_style_code
ON public.catalog_items (style_code);

CREATE INDEX IF NOT EXISTS idx_catalog_items_popularity
ON public.catalog_items (popularity_rank);

-- 3) RLS policies
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catalog items readable by authenticated users"
ON public.catalog_items
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role manages catalog items"
ON public.catalog_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4) Search function
CREATE OR REPLACE FUNCTION search_catalog_items(q TEXT, limit_n INT DEFAULT 20)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  brand TEXT,
  model TEXT,
  colorway_name TEXT,
  style_code TEXT,
  release_year INT,
  image_url_thumb TEXT,
  popularity_rank INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_query TEXT := trim(q);
  v_query_norm TEXT := unaccent(lower(trim(q)));
  v_is_style_code BOOLEAN := v_query ~ '[0-9]' AND v_query ~ '-';
BEGIN
  IF v_query IS NULL OR v_query = '' THEN
    RETURN QUERY
    SELECT
      c.id,
      c.display_name,
      c.brand,
      c.model,
      c.colorway_name,
      c.style_code,
      c.release_year,
      c.image_url_thumb,
      c.popularity_rank
    FROM public.catalog_items c
    ORDER BY c.popularity_rank ASC
    LIMIT limit_n;
    RETURN;
  END IF;

  IF v_is_style_code THEN
    RETURN QUERY
    SELECT
      c.id,
      c.display_name,
      c.brand,
      c.model,
      c.colorway_name,
      c.style_code,
      c.release_year,
      c.image_url_thumb,
      c.popularity_rank
    FROM public.catalog_items c
    WHERE c.style_code ILIKE v_query || '%'
       OR c.style_code ILIKE '%' || v_query || '%'
    ORDER BY
      CASE
        WHEN c.style_code = v_query THEN 0
        WHEN c.style_code ILIKE v_query || '%' THEN 1
        ELSE 2
      END,
      c.popularity_rank ASC
    LIMIT limit_n;
  ELSE
    RETURN QUERY
    SELECT
      c.id,
      c.display_name,
      c.brand,
      c.model,
      c.colorway_name,
      c.style_code,
      c.release_year,
      c.image_url_thumb,
      c.popularity_rank
    FROM public.catalog_items c
    WHERE c.search_text % v_query_norm
    ORDER BY
      similarity(c.search_text, v_query_norm) DESC,
      c.popularity_rank ASC
    LIMIT limit_n;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION search_catalog_items(TEXT, INT) TO authenticated;

-- 5) Assets: catalog link + optional fields
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS catalog_item_id UUID REFERENCES public.catalog_items(id),
  ADD COLUMN IF NOT EXISTS condition TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT DEFAULT 'home';

ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_location_check;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_location_check
  CHECK (location IN ('home', 'bloom', 'watchlist'));

CREATE INDEX IF NOT EXISTS idx_assets_catalog_item_id
ON public.assets (catalog_item_id);

-- Allow authenticated inserts for own assets
CREATE POLICY "Users can insert own assets"
ON public.assets
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- 6) Update portfolio RPC to include catalog data
DROP FUNCTION IF EXISTS get_portfolio_with_pnl();

CREATE OR REPLACE FUNCTION get_portfolio_with_pnl()
RETURNS TABLE (
  id UUID,
  name TEXT,
  image_url TEXT,
  size TEXT,
  category TEXT,
  stockx_sku TEXT,
  current_price NUMERIC(10, 2),
  entry_price NUMERIC(10, 2),
  pnl_dollars NUMERIC(10, 2),
  pnl_percent NUMERIC(5, 2),
  last_price_update TIMESTAMPTZ,
  last_price_checked_at TIMESTAMPTZ,
  last_price_updated_at TIMESTAMPTZ,
  updated_at_pricing TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    COALESCE(a.name, c.display_name) AS name,
    COALESCE(a.image_url, c.image_url_thumb) AS image_url,
    a.size,
    a.category,
    COALESCE(a.stockx_sku, c.style_code) AS stockx_sku,
    a.price AS current_price,
    a.purchase_price AS entry_price,
    CASE
      WHEN a.purchase_price IS NOT NULL AND a.purchase_price > 0
      THEN a.price - a.purchase_price
      ELSE NULL
    END AS pnl_dollars,
    CASE
      WHEN a.purchase_price IS NOT NULL AND a.purchase_price > 0
      THEN ROUND(((a.price - a.purchase_price) / a.purchase_price * 100)::NUMERIC, 2)
      ELSE NULL
    END AS pnl_percent,
    a.last_price_update,
    a.last_price_checked_at,
    a.last_price_updated_at,
    a.updated_at_pricing
  FROM public.assets a
  LEFT JOIN public.catalog_items c ON a.catalog_item_id = c.id
  WHERE a.owner_id = auth.uid()
  ORDER BY a.created_at DESC;
END;
$$;
