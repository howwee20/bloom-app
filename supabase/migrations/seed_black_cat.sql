-- Seed: Insert Jordan 4 Retro Black Cat (2025) asset
-- This asset will be visible in the BLOOM (Marketplace) tab

INSERT INTO public.assets (
  name,
  brand,
  size,
  status,
  owner_id,
  price,
  purchase_price,
  image_url,
  category,
  description
) VALUES (
  'Jordan 4 Retro Black Cat (2025)',
  'Jordan',
  '10',
  'listed',
  NULL,
  350.00,
  337.20,
  'https://images.stockx.com/images/Air-Jordan-4-Retro-Black-Cat-2025-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1733858686',
  'Sneakers',
  'The Air Jordan 4 Retro "Black Cat" returns in 2025 with its iconic all-black colorway featuring a black nubuck upper, matching midsole, and subtle detailing.'
);

-- Verification query (run this to confirm the insert)
-- SELECT id, name, brand, size, status, owner_id, price, purchase_price, image_url
-- FROM public.assets
-- WHERE name LIKE '%Black Cat%';
