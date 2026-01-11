-- Migration: Create catalog-images storage bucket

-- Create the bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalog-images', 'catalog-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to catalog images
CREATE POLICY "Public catalog images read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'catalog-images');

-- Allow service role to manage catalog images
CREATE POLICY "Service role manages catalog images"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'catalog-images')
WITH CHECK (bucket_id = 'catalog-images');
