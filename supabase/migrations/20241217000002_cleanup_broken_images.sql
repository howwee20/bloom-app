-- Cleanup: Delete assets with broken/non-working images
-- Tested via scripts/test-images.js on 2024-12-17
-- Result: 42 working items remain, 63 broken items deleted

-- First, delete any orders referencing these assets (to handle FK constraint)
DELETE FROM public.orders WHERE asset_id IN (
  '612c3d80-1968-45f2-b188-78e72937dffb',
  'd3a75845-f1a3-4c76-a3cd-0e92f3ea0b1a',
  '73acc2c4-372f-4ffc-a349-a21a49c22920',
  'a19ae8c6-b2eb-4bd2-8056-a3c6bf19b151',
  'fa6c4818-df1d-419c-85f1-d88098ae9c02',
  'bd715636-7f00-4b33-93a3-8d2b20200ce3',
  '7fe9456c-1a93-469d-864a-ca9d02525160',
  'fc110c63-6e09-4a0a-a02f-60301424df8c',
  '555a3e9f-f253-419f-bdd0-27063706e05f',
  'a83ca069-fdbd-407a-8e4d-a7c3ce7ed662',
  '7c9eea1a-9a68-406c-9910-5ee0e446d41d',
  '947196df-edf2-4949-9406-f978bd70fa12',
  '98d34e5b-b1c9-491b-ad43-5773070d6eb1',
  'f5c6ef4c-5492-4805-87d7-2fbf380e03a6',
  '57bc9964-4352-465d-95d4-7f3ad5a28a00',
  'cccbaab8-2c8d-48f1-8118-1955a174d9c1',
  '21d36e44-dd20-4180-a2c1-9c924ebb862d',
  'dc6caeb6-f522-4ba5-888b-bcbd1417c851',
  '2f55812b-e497-4e5e-8f1f-040433d8929d',
  'b17c70ea-e7a7-483d-82d3-fd587ca6068b',
  '445068f3-dc16-4e51-86d5-2027b7cb6a18',
  'c6415072-76a7-420e-bfd2-aa62b74387bd',
  '8123b1bd-44a9-40c6-a189-2b012d7d700e',
  'b8749124-a7bf-4fec-b934-0ae306c892e0',
  'c46e111d-f0b0-4f98-b03c-e11b37a7c233',
  '658d98ae-7842-4eac-8527-33bc1f6136f3',
  '54e785f3-c9e1-4fb6-887b-17b503f58b81',
  '3be0f0f3-74c9-4dee-af4b-03faa94ef7d1',
  '5483629a-cded-49db-a7c6-6e8c4753ef85',
  'd52f754d-9eeb-45d8-add1-e41be5bf1524',
  '5373f503-a205-4d6a-8f2e-0aba0d42892c',
  '7e9c94bc-b1e6-4681-b292-ffcf666949f9',
  '047965c4-c1ca-451b-aaa5-ad0a2b5493e3',
  'e2124727-494b-4a99-9673-f8514bb11ab1',
  '3049131a-1d1f-488b-988c-eb6200c73e23',
  '2e6bf0e1-b24a-436e-bb00-c693be6b5059',
  '9c66c7dd-4185-4f46-8165-75d9ac6bafaa',
  '9639feb2-214d-413e-b477-29e7c16810d7',
  '981d83e1-544d-4275-9343-32df9becf9b9',
  '1f23f66e-f158-48cf-8086-b7b7ec653811',
  '12876387-38f6-4c43-954a-d8dd4dfcf9de',
  'e9fc3d5f-2849-4ffc-8afd-d18711903347',
  '414da6e8-7e4e-4bb0-9d92-406aadbdacbd',
  '7679e215-fe8d-42ce-a6ad-dae66c7bdbb4',
  '7c9764c7-0234-4542-b859-8ed1cd74f81b',
  '4d75d195-33e7-4ba0-8e17-678c8ee34e5b',
  '6531a17b-e6ca-4c2b-a133-a7e27a917748',
  '01b5d69f-2b2f-4812-af12-41faf9b1b160',
  '8106625c-06c1-40df-a699-b7c37928d272',
  '29591d4a-dcb3-4433-b981-41502638799a',
  '85094b6d-c2f6-4180-85ec-2017dfb846c0',
  'e6477546-8b33-46c5-879a-41b7ab9e187f',
  '07b3fce1-98e8-4e75-8b43-b3bd8db2a6bd',
  'abfb4b08-2a47-4946-997b-bdb80dfa5ea8',
  'f15643a2-8fed-499b-8a89-7581a88fe7a9',
  'a6945a9e-e29d-4295-9f18-78b05bfae396',
  'ca9302eb-72ad-457e-970a-0fbc69a2fa4b',
  'f17420af-edc1-4fa4-96df-d027e2a7b7e8',
  '29622025-2c93-403c-a6ba-61c5ed9c4e49',
  'b56318f4-8367-4854-b357-79441db7228f',
  '8cad415c-1ecd-4010-9784-d13a7eff3e18',
  '93e3a625-ac5a-4728-b4c0-ddb67658927c',
  '869c9ee0-b769-4763-b1fd-82f7410ba8c9'
);

-- Also delete any price history for these assets
DELETE FROM public.price_history WHERE asset_id IN (
  '612c3d80-1968-45f2-b188-78e72937dffb',
  'd3a75845-f1a3-4c76-a3cd-0e92f3ea0b1a',
  '73acc2c4-372f-4ffc-a349-a21a49c22920',
  'a19ae8c6-b2eb-4bd2-8056-a3c6bf19b151',
  'fa6c4818-df1d-419c-85f1-d88098ae9c02',
  'bd715636-7f00-4b33-93a3-8d2b20200ce3',
  '7fe9456c-1a93-469d-864a-ca9d02525160',
  'fc110c63-6e09-4a0a-a02f-60301424df8c',
  '555a3e9f-f253-419f-bdd0-27063706e05f',
  'a83ca069-fdbd-407a-8e4d-a7c3ce7ed662',
  '7c9eea1a-9a68-406c-9910-5ee0e446d41d',
  '947196df-edf2-4949-9406-f978bd70fa12',
  '98d34e5b-b1c9-491b-ad43-5773070d6eb1',
  'f5c6ef4c-5492-4805-87d7-2fbf380e03a6',
  '57bc9964-4352-465d-95d4-7f3ad5a28a00',
  'cccbaab8-2c8d-48f1-8118-1955a174d9c1',
  '21d36e44-dd20-4180-a2c1-9c924ebb862d',
  'dc6caeb6-f522-4ba5-888b-bcbd1417c851',
  '2f55812b-e497-4e5e-8f1f-040433d8929d',
  'b17c70ea-e7a7-483d-82d3-fd587ca6068b',
  '445068f3-dc16-4e51-86d5-2027b7cb6a18',
  'c6415072-76a7-420e-bfd2-aa62b74387bd',
  '8123b1bd-44a9-40c6-a189-2b012d7d700e',
  'b8749124-a7bf-4fec-b934-0ae306c892e0',
  'c46e111d-f0b0-4f98-b03c-e11b37a7c233',
  '658d98ae-7842-4eac-8527-33bc1f6136f3',
  '54e785f3-c9e1-4fb6-887b-17b503f58b81',
  '3be0f0f3-74c9-4dee-af4b-03faa94ef7d1',
  '5483629a-cded-49db-a7c6-6e8c4753ef85',
  'd52f754d-9eeb-45d8-add1-e41be5bf1524',
  '5373f503-a205-4d6a-8f2e-0aba0d42892c',
  '7e9c94bc-b1e6-4681-b292-ffcf666949f9',
  '047965c4-c1ca-451b-aaa5-ad0a2b5493e3',
  'e2124727-494b-4a99-9673-f8514bb11ab1',
  '3049131a-1d1f-488b-988c-eb6200c73e23',
  '2e6bf0e1-b24a-436e-bb00-c693be6b5059',
  '9c66c7dd-4185-4f46-8165-75d9ac6bafaa',
  '9639feb2-214d-413e-b477-29e7c16810d7',
  '981d83e1-544d-4275-9343-32df9becf9b9',
  '1f23f66e-f158-48cf-8086-b7b7ec653811',
  '12876387-38f6-4c43-954a-d8dd4dfcf9de',
  'e9fc3d5f-2849-4ffc-8afd-d18711903347',
  '414da6e8-7e4e-4bb0-9d92-406aadbdacbd',
  '7679e215-fe8d-42ce-a6ad-dae66c7bdbb4',
  '7c9764c7-0234-4542-b859-8ed1cd74f81b',
  '4d75d195-33e7-4ba0-8e17-678c8ee34e5b',
  '6531a17b-e6ca-4c2b-a133-a7e27a917748',
  '01b5d69f-2b2f-4812-af12-41faf9b1b160',
  '8106625c-06c1-40df-a699-b7c37928d272',
  '29591d4a-dcb3-4433-b981-41502638799a',
  '85094b6d-c2f6-4180-85ec-2017dfb846c0',
  'e6477546-8b33-46c5-879a-41b7ab9e187f',
  '07b3fce1-98e8-4e75-8b43-b3bd8db2a6bd',
  'abfb4b08-2a47-4946-997b-bdb80dfa5ea8',
  'f15643a2-8fed-499b-8a89-7581a88fe7a9',
  'a6945a9e-e29d-4295-9f18-78b05bfae396',
  'ca9302eb-72ad-457e-970a-0fbc69a2fa4b',
  'f17420af-edc1-4fa4-96df-d027e2a7b7e8',
  '29622025-2c93-403c-a6ba-61c5ed9c4e49',
  'b56318f4-8367-4854-b357-79441db7228f',
  '8cad415c-1ecd-4010-9784-d13a7eff3e18',
  '93e3a625-ac5a-4728-b4c0-ddb67658927c',
  '869c9ee0-b769-4763-b1fd-82f7410ba8c9'
);

-- Now delete the assets with broken StockX image URLs
DELETE FROM public.assets WHERE id IN (
  '612c3d80-1968-45f2-b188-78e72937dffb', -- Fear of God Essentials Tee Jet Black
  'd3a75845-f1a3-4c76-a3cd-0e92f3ea0b1a', -- Fear of God Essentials Tee (FW24) Black
  '73acc2c4-372f-4ffc-a349-a21a49c22920', -- Supreme Digital Camera Keychain
  'a19ae8c6-b2eb-4bd2-8056-a3c6bf19b151', -- adidas Yeezy Slide Onyx
  'fa6c4818-df1d-419c-85f1-d88098ae9c02', -- adidas Yeezy Slide Resin (2022)
  'bd715636-7f00-4b33-93a3-8d2b20200ce3', -- adidas Yeezy Slide Bone (2022)
  '7fe9456c-1a93-469d-864a-ca9d02525160', -- adidas Yeezy Foam RNR Clay Taupe
  'fc110c63-6e09-4a0a-a02f-60301424df8c', -- Supreme Heat Reactive Digi Camo Balaclava
  '555a3e9f-f253-419f-bdd0-27063706e05f', -- adidas Yeezy Foam RNR Stone Salt
  'a83ca069-fdbd-407a-8e4d-a7c3ce7ed662', -- adidas Yeezy Foam RNR Carbon
  '7c9eea1a-9a68-406c-9910-5ee0e446d41d', -- adidas Yeezy Foam RNR MX Granite
  '947196df-edf2-4949-9406-f978bd70fa12', -- Nike Air Force 1 Low 07 White
  '98d34e5b-b1c9-491b-ad43-5773070d6eb1', -- Nike Dunk Low Cacao Wow (Womens)
  'f5c6ef4c-5492-4805-87d7-2fbf380e03a6', -- Nike Dunk Low Grey Fog
  '57bc9964-4352-465d-95d4-7f3ad5a28a00', -- Pop Mart The Monsters Labubu
  'cccbaab8-2c8d-48f1-8118-1955a174d9c1', -- Fear of God Essentials Hoodie Jet Black
  '21d36e44-dd20-4180-a2c1-9c924ebb862d', -- Fear of God Essentials Hoodie (FW24) Black
  'dc6caeb6-f522-4ba5-888b-bcbd1417c851', -- Fear of God Essentials Hoodie Light Heather Gray
  '2f55812b-e497-4e5e-8f1f-040433d8929d', -- Fear of God Essentials Hoodie Dark Heather Oatmeal
  'b17c70ea-e7a7-483d-82d3-fd587ca6068b', -- ASICS Gel-Kayano 14 White Graphite
  '445068f3-dc16-4e51-86d5-2027b7cb6a18', -- Jordan 1 Retro Low OG Black Toe (2023)
  'c6415072-76a7-420e-bfd2-aa62b74387bd', -- Fear of God Essentials Hoodie Cloud Dancer
  '8123b1bd-44a9-40c6-a189-2b012d7d700e', -- Jordan 1 Retro Low OG Zion Voodoo
  'b8749124-a7bf-4fec-b934-0ae306c892e0', -- New Balance 9060 Quartz Grey
  'c46e111d-f0b0-4f98-b03c-e11b37a7c233', -- Supreme Playboi Carti Tee Black
  '658d98ae-7842-4eac-8527-33bc1f6136f3', -- Jordan 1 Retro Low OG Chicago (2025)
  '54e785f3-c9e1-4fb6-887b-17b503f58b81', -- New Balance 9060 Cherry Blossom
  '3be0f0f3-74c9-4dee-af4b-03faa94ef7d1', -- Pokemon 151 Ultra Premium Collection
  '5483629a-cded-49db-a7c6-6e8c4753ef85', -- Nike SB Dunk Low City of Love Light Bone
  'd52f754d-9eeb-45d8-add1-e41be5bf1524', -- Nike SB Dunk Low Rayssa Leal
  '5373f503-a205-4d6a-8f2e-0aba0d42892c', -- New Balance 2002R Protection Pack Rain Cloud
  '7e9c94bc-b1e6-4681-b292-ffcf666949f9', -- Jordan 1 Retro High OG UNC Reimagined
  '047965c4-c1ca-451b-aaa5-ad0a2b5493e3', -- Jordan 1 Retro High OG Black Toe Reimagined
  'e2124727-494b-4a99-9673-f8514bb11ab1', -- Jordan 5 Retro Black Metallic Reimagined
  '3049131a-1d1f-488b-988c-eb6200c73e23', -- Jordan 12 Retro Taxi (2025)
  '2e6bf0e1-b24a-436e-bb00-c693be6b5059', -- Jordan 4 Retro Rare Air
  '9c66c7dd-4185-4f46-8165-75d9ac6bafaa', -- Jordan 11 Retro Legend Blue (2024)
  '9639feb2-214d-413e-b477-29e7c16810d7', -- New Balance 550 ALD White Green
  '981d83e1-544d-4275-9343-32df9becf9b9', -- Nike SB Dunk Low Futura Laboratories
  '1f23f66e-f158-48cf-8086-b7b7ec653811', -- The North Face 1996 Retro Nuptse Black
  '12876387-38f6-4c43-954a-d8dd4dfcf9de', -- Jordan 4 Retro White Cement (2025)
  'e9fc3d5f-2849-4ffc-8afd-d18711903347', -- Jordan 11 Retro Gratitude
  '414da6e8-7e4e-4bb0-9d92-406aadbdacbd', -- Jordan 4 Retro SB Navy
  '7679e215-fe8d-42ce-a6ad-dae66c7bdbb4', -- Denim Tears The Cotton Wreath Hoodie Black
  '7c9764c7-0234-4542-b859-8ed1cd74f81b', -- Supreme Box Logo Hoodie (FW24) Green
  '4d75d195-33e7-4ba0-8e17-678c8ee34e5b', -- Supreme Box Logo Hoodie (FW24) Stone
  '6531a17b-e6ca-4c2b-a133-a7e27a917748', -- Charizard-GX Burning Shadows Full Art #150
  '01b5d69f-2b2f-4812-af12-41faf9b1b160', -- Nike Kobe 6 Protro Reverse Grinch
  '8106625c-06c1-40df-a699-b7c37928d272', -- Supreme Box Logo Hoodie (FW24) Black
  '29591d4a-dcb3-4433-b981-41502638799a', -- Supreme Box Logo Hoodie (FW24) Multicolor
  '85094b6d-c2f6-4180-85ec-2017dfb846c0', -- Pokemon TCG Classic Box (2023)
  'e6477546-8b33-46c5-879a-41b7ab9e187f', -- Jordan 1 Retro Low OG Travis Scott Canary
  '07b3fce1-98e8-4e75-8b43-b3bd8db2a6bd', -- Supreme Box Logo Hoodie (FW25) Realtree Camo
  'abfb4b08-2a47-4946-997b-bdb80dfa5ea8', -- KAWS Holiday Thailand Vinyl Figure Black
  'f15643a2-8fed-499b-8a89-7581a88fe7a9', -- KAWS Holiday Thailand Vinyl Figure Brown
  'a6945a9e-e29d-4295-9f18-78b05bfae396', -- Jordan 1 Retro Low OG Travis Scott Medium Olive
  'ca9302eb-72ad-457e-970a-0fbc69a2fa4b', -- Chrome Hearts Hollywood Trucker Hat Black/White
  'f17420af-edc1-4fa4-96df-d027e2a7b7e8', -- Chrome Hearts Hollywood Trucker Hat Black/Black
  '29622025-2c93-403c-a6ba-61c5ed9c4e49', -- KAWS Family Vinyl Figures Grey/Pink
  'b56318f4-8367-4854-b357-79441db7228f', -- Chrome Hearts Chomper Hollywood Trucker Hat
  '8cad415c-1ecd-4010-9784-d13a7eff3e18', -- Bearbrick The Joker Batman Animated 1000%
  '93e3a625-ac5a-4728-b4c0-ddb67658927c', -- Bearbrick The Joker 1000%
  '869c9ee0-b769-4763-b1fd-82f7410ba8c9'  -- Bearbrick Marble 1000%
);

-- Verify remaining items
SELECT COUNT(*) as remaining_items FROM public.assets WHERE status = 'listed' OR owner_id IS NULL;
