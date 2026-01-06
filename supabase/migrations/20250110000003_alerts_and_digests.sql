-- Migration: Alerts, notifications, top movers, weekly digests

-- 1) Price alerts
CREATE TABLE IF NOT EXISTS public.price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  asset_id UUID REFERENCES public.assets NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('above', 'below', 'percent_change_24h')),
  threshold NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_triggered_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alerts"
ON public.price_alerts
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages alerts"
ON public.price_alerts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2) Notifications (in-app)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_read BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Service role inserts notifications"
ON public.notifications
FOR INSERT
TO service_role
WITH CHECK (true);

-- 3) Weekly digests
CREATE TABLE IF NOT EXISTS public.weekly_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  week_start DATE NOT NULL,
  total_value NUMERIC(12, 2),
  total_cost NUMERIC(12, 2),
  total_pnl_dollars NUMERIC(12, 2),
  total_pnl_percent NUMERIC(6, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS weekly_digests_unique
ON public.weekly_digests(user_id, week_start);

ALTER TABLE public.weekly_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own digests"
ON public.weekly_digests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Service role manages digests"
ON public.weekly_digests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4) Top movers for user portfolio
CREATE OR REPLACE FUNCTION get_user_top_movers(p_limit INTEGER DEFAULT 5)
RETURNS TABLE (
  item_type TEXT,
  item_id UUID,
  name TEXT,
  image_url TEXT,
  size TEXT,
  current_value NUMERIC(10, 2),
  price_change NUMERIC(10, 2),
  price_change_percent NUMERIC(6, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH token_prices AS (
    SELECT
      'token'::TEXT AS item_type,
      t.id AS item_id,
      t.product_name AS name,
      t.product_image_url AS image_url,
      t.size AS size,
      t.current_value AS current_value,
      COALESCE(t.current_value, a.price) - COALESCE(ph.price, a.price) AS price_change,
      CASE
        WHEN ph.price IS NOT NULL AND ph.price > 0
        THEN ROUND(((COALESCE(t.current_value, a.price) - ph.price) / ph.price * 100)::NUMERIC, 2)
        ELSE 0
      END AS price_change_percent
    FROM public.tokens t
    JOIN public.assets a ON a.stockx_sku = t.sku
    LEFT JOIN LATERAL (
      SELECT ph.price
      FROM public.price_history ph
      WHERE ph.asset_id = a.id
        AND ph.created_at <= NOW() - INTERVAL '24 hours'
      ORDER BY ph.created_at DESC
      LIMIT 1
    ) ph ON TRUE
    WHERE t.user_id = auth.uid()
      AND t.match_status = 'matched'
      AND t.current_value IS NOT NULL
  ),
  asset_prices AS (
    SELECT
      'asset'::TEXT AS item_type,
      a.id AS item_id,
      a.name AS name,
      a.image_url AS image_url,
      a.size AS size,
      a.price AS current_value,
      a.price - COALESCE(ph.price, a.price) AS price_change,
      CASE
        WHEN ph.price IS NOT NULL AND ph.price > 0
        THEN ROUND(((a.price - ph.price) / ph.price * 100)::NUMERIC, 2)
        ELSE 0
      END AS price_change_percent
    FROM public.assets a
    LEFT JOIN LATERAL (
      SELECT ph.price
      FROM public.price_history ph
      WHERE ph.asset_id = a.id
        AND ph.created_at <= NOW() - INTERVAL '24 hours'
      ORDER BY ph.created_at DESC
      LIMIT 1
    ) ph ON TRUE
    WHERE a.owner_id = auth.uid()
  )
  SELECT *
  FROM (
    SELECT * FROM token_prices
    UNION ALL
    SELECT * FROM asset_prices
  ) combined
  WHERE current_value IS NOT NULL
  ORDER BY ABS(price_change_percent) DESC
  LIMIT p_limit;
END;
$$;

-- 5) Weekly digest generator
CREATE OR REPLACE FUNCTION generate_weekly_digests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_week_start DATE := DATE_TRUNC('week', NOW())::DATE;
  v_count INTEGER;
BEGIN
  WITH combined AS (
    SELECT user_id, SUM(total_value) AS total_value, SUM(total_cost) AS total_cost
    FROM (
      SELECT
        t.user_id AS user_id,
        SUM(COALESCE(t.current_value, t.purchase_price)) AS total_value,
        SUM(t.purchase_price) AS total_cost
      FROM public.tokens t
      WHERE t.match_status = 'matched'
      GROUP BY t.user_id
      UNION ALL
      SELECT
        a.owner_id AS user_id,
        SUM(a.price) AS total_value,
        SUM(a.purchase_price) AS total_cost
      FROM public.assets a
      WHERE a.owner_id IS NOT NULL
      GROUP BY a.owner_id
    ) totals
    GROUP BY user_id
  )
  INSERT INTO public.weekly_digests (
    user_id,
    week_start,
    total_value,
    total_cost,
    total_pnl_dollars,
    total_pnl_percent
  )
  SELECT
    user_id,
    v_week_start,
    total_value,
    total_cost,
    total_value - total_cost,
    CASE
      WHEN total_cost > 0
      THEN ROUND(((total_value - total_cost) / total_cost * 100)::NUMERIC, 2)
      ELSE 0
    END
  FROM combined
  ON CONFLICT (user_id, week_start)
  DO UPDATE SET
    total_value = EXCLUDED.total_value,
    total_cost = EXCLUDED.total_cost,
    total_pnl_dollars = EXCLUDED.total_pnl_dollars,
    total_pnl_percent = EXCLUDED.total_pnl_percent,
    created_at = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
