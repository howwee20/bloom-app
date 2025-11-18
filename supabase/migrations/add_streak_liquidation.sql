-- Migration: Add Streak Liquidation Feature
-- Execute this in Supabase SQL Editor

-- 1. Add total_cashed_out_cents column to profile table
ALTER TABLE profile
ADD COLUMN IF NOT EXISTS total_cashed_out_cents INTEGER DEFAULT 0;

-- 2. Create streak_liquidations table
CREATE TABLE IF NOT EXISTS streak_liquidations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  days_liquidated INTEGER NOT NULL CHECK (days_liquidated >= 1),
  equity_cents INTEGER NOT NULL CHECK (equity_cents > 0),
  payout_cents INTEGER NOT NULL CHECK (payout_cents > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('venmo', 'cashapp')),
  payment_handle TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 3. Create index for efficient weekly cap queries
CREATE INDEX IF NOT EXISTS idx_liquidations_user_date
ON streak_liquidations(user_id, created_at DESC);

-- 4. Enable Row Level Security
ALTER TABLE streak_liquidations ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policy: users can only view their own liquidations
CREATE POLICY "Users can view own liquidations"
ON streak_liquidations
FOR SELECT
USING (auth.uid() = user_id);

-- 6. Create RLS policy: users can only insert their own liquidations (via RPC)
CREATE POLICY "Users can insert own liquidations"
ON streak_liquidations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 7. Create RPC function to process liquidation
CREATE OR REPLACE FUNCTION process_liquidation(
  days_to_burn INTEGER,
  payment_method_input TEXT,
  payment_handle_input TEXT
) RETURNS JSON AS $$
DECLARE
  user_current_streak INTEGER;
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

  -- Get current streak from profile table
  SELECT current_streak INTO user_current_streak
  FROM profile
  WHERE id = auth.uid();

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

  -- Update profile: deduct days and add to total cashed out
  UPDATE profile
  SET
    current_streak = new_streak_days,
    total_cashed_out_cents = total_cashed_out_cents + payout_cents_value
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

-- 8. Grant execute permission on RPC function to authenticated users
GRANT EXECUTE ON FUNCTION process_liquidation(INTEGER, TEXT, TEXT) TO authenticated;

-- Migration complete!
-- Users can now liquidate their streak days for cash
