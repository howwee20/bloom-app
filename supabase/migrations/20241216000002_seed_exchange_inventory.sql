-- Seed Exchange Inventory
-- These are marketplace listings where users select size at checkout
-- All prices are "all-in" prices (StockX + 3% processing + 10% tax + $15 shipping)

-- Jordan 4 Retro Black Cat (2020)
INSERT INTO public.assets (
  name,
  image_url,
  price,
  owner_id,
  status,
  size,
  description,
  category,
  stockx_sku,
  stockx_slug
) VALUES (
  'Jordan 4 Retro Black Cat (2020)',
  'https://images.stockx.com/images/Air-Jordan-4-Retro-Black-Cat-2020-Product.jpg',
  363.87,
  NULL,
  'listed',
  NULL,
  'The Air Jordan 4 Black Cat returns in 2020 with an all-black colorway featuring light graphite accents. Premium nubuck upper with matching midsole and outsole.',
  'Sneakers',
  'CU1110-010',
  'air-jordan-4-retro-black-cat-2020'
);

-- Nike Dunk Low Panda
INSERT INTO public.assets (
  name,
  image_url,
  price,
  owner_id,
  status,
  size,
  description,
  category,
  stockx_sku,
  stockx_slug
) VALUES (
  'Nike Dunk Low Retro White Black Panda',
  'https://images.stockx.com/images/Nike-Dunk-Low-Retro-White-Black-2021-Product.jpg',
  127.50,
  NULL,
  'listed',
  NULL,
  'The Nike Dunk Low Retro White Black, also known as the Panda Dunk, features a clean white leather base with black leather overlays. A timeless colorway.',
  'Sneakers',
  'DD1391-100',
  'nike-dunk-low-retro-white-black-2021'
);

-- Jordan 1 Retro High OG Chicago Reimagined Lost and Found
INSERT INTO public.assets (
  name,
  image_url,
  price,
  owner_id,
  status,
  size,
  description,
  category,
  stockx_sku,
  stockx_slug
) VALUES (
  'Jordan 1 Retro High OG Chicago Lost and Found',
  'https://images.stockx.com/images/Air-Jordan-1-Retro-High-OG-Chicago-Reimagined-Product.jpg',
  238.00,
  NULL,
  'listed',
  NULL,
  'The Air Jordan 1 Retro High OG Lost and Found reimagines the iconic Chicago colorway with vintage details including cracked leather and aged accents.',
  'Sneakers',
  'DZ5485-612',
  'air-jordan-1-retro-high-og-chicago-reimagined'
);

-- New Balance 550 White Green
INSERT INTO public.assets (
  name,
  image_url,
  price,
  owner_id,
  status,
  size,
  description,
  category,
  stockx_sku,
  stockx_slug
) VALUES (
  'New Balance 550 White Green',
  'https://images.stockx.com/images/New-Balance-550-White-Green-Product.jpg',
  135.00,
  NULL,
  'listed',
  NULL,
  'The New Balance 550 White Green features a clean white leather upper with green accents on the N logo and heel. A retro basketball silhouette revived.',
  'Sneakers',
  'BB550WT1',
  'new-balance-550-white-green'
);

-- Jordan 11 Retro Gratitude
INSERT INTO public.assets (
  name,
  image_url,
  price,
  owner_id,
  status,
  size,
  description,
  category,
  stockx_sku,
  stockx_slug
) VALUES (
  'Jordan 11 Retro Gratitude',
  'https://images.stockx.com/images/Air-Jordan-11-Retro-Gratitude-Product.jpg',
  295.00,
  NULL,
  'listed',
  NULL,
  'The Air Jordan 11 Gratitude features a white upper with Metallic Gold accents commemorating MJs legacy. Released December 2023.',
  'Sneakers',
  'CT8012-170',
  'air-jordan-11-retro-gratitude'
);

-- Verify inserts
SELECT name, price, status, stockx_sku FROM public.assets WHERE owner_id IS NULL AND status = 'listed';
