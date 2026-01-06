-- Migration: Create a test token for howeeva1@msu.edu
-- This gives the founder a Black Cat J4 token to test exchange functionality

-- First, make order_id nullable (needed for test/airdropped tokens)
ALTER TABLE public.tokens ALTER COLUMN order_id DROP NOT NULL;

DO $$
DECLARE
  v_user_id UUID;
  v_asset RECORD;
  v_token_id UUID;
BEGIN
  -- Find user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'howeeva1@msu.edu'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User howeeva1@msu.edu not found - skipping token creation';
    RETURN;
  END IF;

  -- Get the Black Cat J4 asset
  SELECT * INTO v_asset
  FROM public.assets
  WHERE name ILIKE '%Black Cat%' AND name ILIKE '%Jordan%'
  LIMIT 1;

  IF v_asset.id IS NULL THEN
    RAISE NOTICE 'Black Cat Jordan asset not found - skipping token creation';
    RETURN;
  END IF;

  -- Check if token already exists
  SELECT id INTO v_token_id
  FROM public.tokens
  WHERE user_id = v_user_id
    AND sku = COALESCE(v_asset.stockx_sku, 'DH7138-006');

  IF v_token_id IS NOT NULL THEN
    RAISE NOTICE 'Token already exists for this user and asset: %', v_token_id;
    RETURN;
  END IF;

  -- Create the test token
  INSERT INTO public.tokens (
    user_id,
    order_id,
    sku,
    product_name,
    size,
    product_image_url,
    purchase_price,
    purchase_date,
    custody_type,
    vault_location,
    verified_at,
    is_exchange_eligible,
    current_value,
    value_updated_at,
    status
  ) VALUES (
    v_user_id,
    NULL, -- No real order for test token
    COALESCE(v_asset.stockx_sku, 'DH7138-006'),
    v_asset.name,
    COALESCE(v_asset.size, '10'),
    v_asset.image_url,
    v_asset.price,
    NOW(),
    'bloom',
    'Bloom Vault - Detroit',
    NOW(),
    TRUE, -- Exchange eligible
    v_asset.price,
    NOW(),
    'in_custody' -- Ready to trade
  )
  RETURNING id INTO v_token_id;

  RAISE NOTICE 'Created test token: % for user %', v_token_id, v_user_id;
END $$;
