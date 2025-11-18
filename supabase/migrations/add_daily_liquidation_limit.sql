-- Migration: Add Daily Liquidation Limit
-- Execute this in Supabase SQL Editor

-- 1. Add last_liquidation_date column to profile table
ALTER TABLE profile
ADD COLUMN IF NOT EXISTS last_liquidation_date DATE;

-- 2. Update process_liquidation function to enforce daily limit
CREATE OR REPLACE FUNCTION process_liquidation(
  days_to_burn INTEGER,
  payment_method_input TEXT,
  payment_handle_input TEXT
) RETURNS JSON AS $$
DECLARE
  user_current_streak INTEGER;
  user_last_liquidation DATE;
  equity_cents_value INTEGER;
  payout_cents_value INTEGER;
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

  -- Validate minimum days
  IF days_to_burn < 1 THEN
    RAISE EXCEPTION 'Minimum 1 day required to liquidate';
  END IF;

  -- Validate user has enough streak days
  IF user_current_streak < days_to_burn THEN
    RAISE EXCEPTION 'Insufficient streak days. You have % days but trying to liquidate % days.', user_current_streak, days_to_burn;
  END IF;

  -- Calculate values
  -- Equity: days * 10 cents per day
  -- Payout: 10% of equity value
  equity_cents_value := days_to_burn * 10;
  payout_cents_value := ROUND(equity_cents_value * 0.10);

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

  -- Calculate new streak
  new_streak_days := user_current_streak - days_to_burn;

  -- Update profile: deduct days, add to total cashed out, update last liquidation date
  UPDATE profile
  SET
    current_streak = new_streak_days,
    total_cashed_out_cents = total_cashed_out_cents + payout_cents_value,
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

  -- Build success response
  result := json_build_object(
    'success', true,
    'newStreakDays', new_streak_days,
    'equityCents', equity_cents_value,
    'payoutCents', payout_cents_value,
    'payoutDollars', payout_cents_value::DECIMAL / 100,
    'paymentMethod', payment_method_input,
    'paymentHandle', payment_handle_input,
    'weeklyTotalCents', weekly_total_cents + payout_cents_value
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration complete!
-- Now enforcing: only one liquidation per day
