-- Block users from self-selecting BLOOM location on INSERT
-- BLOOM custody should only be set via system flows (buy->ship to bloom, bloom exchange)
-- This trigger coerces any client-side BLOOM selection to HOME

CREATE OR REPLACE FUNCTION coerce_bloom_to_home()
RETURNS TRIGGER AS $$
BEGIN
  -- Users cannot self-select BLOOM - it's set by system flows only
  -- On INSERT, if location is 'bloom', change it to 'home'
  IF NEW.location = 'bloom' AND TG_OP = 'INSERT' THEN
    NEW.location := 'home';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create BEFORE INSERT trigger (needs to modify the row before insert)
DROP TRIGGER IF EXISTS trigger_coerce_bloom_to_home ON public.assets;
CREATE TRIGGER trigger_coerce_bloom_to_home
BEFORE INSERT ON public.assets
FOR EACH ROW
EXECUTE FUNCTION coerce_bloom_to_home();

-- Note: BLOOM can still be set via UPDATE (for system flows like bloom purchase)
-- This only blocks direct INSERT with location='bloom'
