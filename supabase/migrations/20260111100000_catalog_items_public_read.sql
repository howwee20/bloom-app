-- Allow public read access to catalog_items
-- Catalog data is not sensitive and should be readable by anyone

CREATE POLICY "Catalog items readable by anyone"
ON public.catalog_items
FOR SELECT
TO anon
USING (true);

-- Also grant the search function to anon users
GRANT EXECUTE ON FUNCTION search_catalog_items(TEXT, INT) TO anon;
