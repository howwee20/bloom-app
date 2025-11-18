-- Migration: Add Dynamic Liquidation with Proportional Streak Value
-- This replaces the static $0.10/day with dynamic calculation based on
-- the user's share of the total streak pool

-- 1. Create or replace get_streak_value function
-- This calculates a user's streak value as their proportional share of the prize pool
-- Formula: (user_streak / total_streaks_across_all_users) * prize_pool
CREATE OR REPLACE FUNCTION get_streak_value()
RETURNS NUMERIC AS $$
DECLARE
  user_current_streak INTEGER;
  total_network_streaks NUMERIC;
  current_prize_pool NUMERIC;
  user_streak_value NUMERIC;
BEGIN
  -- Get the current user's streak
  SELECT current_streak INTO user_current_streak
  FROM profile
  WHERE id = auth.uid();

  -- If no streak, return 0
  IF user_current_streak IS NULL OR user_current_streak = 0 THEN
    RETURN 0;
  END IF;

  -- Calculate total streaks across all users
  SELECT COALESCE(SUM(current_streak), 0) INTO total_network_streaks
  FROM profile
  WHERE current_streak > 0;

  -- Avoid division by zero
  IF total_network_streaks = 0 THEN
    RETURN 0;
  END IF;

  -- Get today's prize pool (assuming you have a daily_prizes table)
  -- If prize pool is stored differently, adjust this query
  SELECT COALESCE(prize_amount, 5.00) INTO current_prize_pool
  FROM daily_prizes
  WHERE date = CURRENT_DATE
  LIMIT 1;

  -- If no prize found for today, use default of $5.00
  IF current_prize_pool IS NULL THEN
    current_prize_pool := 5.00;
  END IF;

  -- Calculate proportional value: (user_streak / total_streaks) * prize_pool
  user_streak_value := (user_current_streak::NUMERIC / total_network_streaks) * current_prize_pool;

  RETURN user_streak_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_streak_value() TO authenticated;


-- 2. Create calculate_liquidation_payout function
-- This calculates how much the user gets for burning X days
-- Formula: (current_value - new_value) * 0.10
CREATE OR REPLACE FUNCTION calculate_liquidation_payout(days_to_burn INTEGER)
RETURNS JSON AS $$
DECLARE
  user_current_streak INTEGER;
  total_network_streaks NUMERIC;
  current_prize_pool NUMERIC;
  current_value_dollars NUMERIC;
  new_value_dollars NUMERIC;
  equity_lost_dollars NUMERIC;
  payout_dollars NUMERIC;
  payout_cents INTEGER;
  equity_lost_cents INTEGER;
BEGIN
  -- Get the current user's streak
  SELECT current_streak INTO user_current_streak
  FROM profile
  WHERE id = auth.uid();

  -- Validate minimum 3-day streak requirement
  IF user_current_streak IS NULL OR user_current_streak < 3 THEN
    RAISE EXCEPTION 'Need a Bloom Streak of 3 to liquidate';
  END IF;

  -- Validate sufficient days to burn
  IF user_current_streak < days_to_burn THEN
    RAISE EXCEPTION 'Insufficient streak days';
  END IF;

  -- Calculate total streaks across all users
  SELECT COALESCE(SUM(current_streak), 0) INTO total_network_streaks
  FROM profile
  WHERE current_streak > 0;

  IF total_network_streaks = 0 THEN
    RAISE EXCEPTION 'No network streaks available';
  END IF;

  -- Get today's prize pool
  SELECT COALESCE(prize_amount, 5.00) INTO current_prize_pool
  FROM daily_prizes
  WHERE date = CURRENT_DATE
  LIMIT 1;

  IF current_prize_pool IS NULL THEN
    current_prize_pool := 5.00;
  END IF;

  -- Calculate CURRENT value (before burn)
  current_value_dollars := (user_current_streak::NUMERIC / total_network_streaks) * current_prize_pool;

  -- Calculate NEW value (after burn)
  -- Important: Network total decreases when user burns days
  new_value_dollars := ((user_current_streak - days_to_burn)::NUMERIC / (total_network_streaks - days_to_burn)) * current_prize_pool;

  -- Calculate equity lost
  equity_lost_dollars := current_value_dollars - new_value_dollars;

  -- User gets 10% of equity lost
  payout_dollars := equity_lost_dollars * 0.10;

  -- Convert to cents for storage
  payout_cents := CEIL(payout_dollars * 100);
  equity_lost_cents := ROUND(equity_lost_dollars * 100);

  -- Return JSON with all values
  RETURN json_build_object(
    'currentValueDollars', current_value_dollars,
    'newValueDollars', new_value_dollars,
    'equityLostCents', equity_lost_cents,
    'equityLostDollars', equity_lost_dollars,
    'payoutCents', payout_cents,
    'payoutDollars', payout_dollars,
    'newStreak', user_current_streak - days_to_burn
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION calculate_liquidation_payout(INTEGER) TO authenticated;


-- 3. Update process_liquidation to use dynamic calculation
CREATE OR REPLACE FUNCTION process_liquidation(
  days_to_burn INTEGER,
  payment_method_input TEXT,
  payment_handle_input TEXT
) RETURNS JSON AS $$
DECLARE
  user_current_streak INTEGER;
  user_last_liquidation DATE;
  payout_calc JSON;
  payout_cents_value INTEGER;
  equity_cents_value INTEGER;
  weekly_total_cents INTEGER;
  new_streak_days INTEGER;
  result JSON;
BEGIN
  -- Validate payment method
  IF payment_method_input NOT IN ('venmo', 'cashapp') THEN
    RAISE EXCEPTION 'Invalid payment method. Must be venmo or cashapp.';
  END IF;

  -- Validate payment handle
  IF payment_handle_input IS NULL OR LENGTH(payment_handle_input) < 3 OR LENGTH(payment_handle_input) > 30 THEN
    RAISE EXCEPTION 'Invalid payment handle. Must be 3-30 characters.';
  END IF;

  -- Get current streak and last liquidation date
  SELECT current_streak, last_liquidation_date
  INTO user_current_streak, user_last_liquidation
  FROM profile
  WHERE id = auth.uid();

  -- Check daily limit: only one liquidation per day
  IF user_last_liquidation = CURRENT_DATE THEN
    RAISE EXCEPTION 'You can only liquidate once per day. Try again tomorrow.';
  END IF;

  -- Validate minimum 3-day streak requirement
  IF user_current_streak < 3 THEN
    RAISE EXCEPTION 'Need a Bloom Streak of 3 to liquidate';
  END IF;

  -- Validate minimum days to burn
  IF days_to_burn < 3 THEN
    RAISE EXCEPTION 'Minimum 3 days required to liquidate';
  END IF;

  -- Validate user has enough streak days
  IF user_current_streak < days_to_burn THEN
    RAISE EXCEPTION 'Insufficient streak days. You have % days but trying to liquidate % days.', user_current_streak, days_to_burn;
  END IF;

  -- *** USE DYNAMIC CALCULATION ***
  -- Call calculate_liquidation_payout to get exact values
  payout_calc := calculate_liquidation_payout(days_to_burn);

  -- Extract values from JSON
  payout_cents_value := (payout_calc->>'payoutCents')::INTEGER;
  equity_cents_value := (payout_calc->>'equityLostCents')::INTEGER;
  new_streak_days := (payout_calc->>'newStreak')::INTEGER;

  -- Check weekly cap: $5.00 = 500 cents
  SELECT COALESCE(SUM(payout_cents), 0) INTO weekly_total_cents
  FROM streak_liquidations
  WHERE user_id = auth.uid()
    AND created_at >= NOW() - INTERVAL '7 days';

  -- Validate weekly cap
  IF (weekly_total_cents + payout_cents_value) > 500 THEN
    RAISE EXCEPTION 'Weekly cashout limit exceeded. You can cash out $%.2f more this week (max $5.00 per week).',
      (500 - weekly_total_cents)::DECIMAL / 100;
  END IF;

  -- Update profile: deduct days, add to total cashed out, update last liquidation date
  UPDATE profile
  SET
    current_streak = new_streak_days,
    total_cashed_out_cents = COALESCE(total_cashed_out_cents, 0) + payout_cents_value,
    last_liquidation_date = CURRENT_DATE
  WHERE id = auth.uid();

  -- Insert liquidation record
  INSERT INTO streak_liquidations (
    user_id,
    days_liquidated,
    equity_cents,
    payout_cents,
    payment_method,
    payment_handle
  ) VALUES (
    auth.uid(),
    days_to_burn,
    equity_cents_value,
    payout_cents_value,
    payment_method_input,
    payment_handle_input
  );

  -- Build success response with all values from calculation
  result := json_build_object(
    'success', true,
    'newStreakDays', new_streak_days,
    'equityCents', equity_cents_value,
    'payoutCents', payout_cents_value,
    'payoutDollars', (payout_calc->>'payoutDollars')::NUMERIC,
    'currentValueDollars', (payout_calc->>'currentValueDollars')::NUMERIC,
    'newValueDollars', (payout_calc->>'newValueDollars')::NUMERIC,
    'paymentMethod', payment_method_input,
    'paymentHandle', payment_handle_input,
    'weeklyTotalCents', weekly_total_cents + payout_cents_value
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION process_liquidation(INTEGER, TEXT, TEXT) TO authenticated;

-- Migration complete!
-- Liquidation now uses dynamic calculation based on proportional streak value
