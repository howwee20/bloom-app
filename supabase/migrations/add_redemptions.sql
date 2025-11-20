-- Migration: Add Redemptions Feature
-- Allows users to redeem Bloom streak days for gift cards

-- 1. Create redemptions table
CREATE TABLE IF NOT EXISTS redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profile(id),
  days_redeemed INTEGER NOT NULL CHECK (days_redeemed > 0),
  item_name TEXT NOT NULL,
  item_value DECIMAL(10,2) NOT NULL,
  code_sent TEXT,
  user_email TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes for performance
CREATE INDEX idx_redemptions_user ON redemptions(user_id);
CREATE INDEX idx_redemptions_created ON redemptions(created_at DESC);
CREATE INDEX idx_redemptions_status ON redemptions(status);

-- 3. Enable Row Level Security
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy: Users can view their own redemptions
CREATE POLICY "Users can view their redemptions"
  ON redemptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- 5. RLS Policy: Users can create redemptions (must be the redeemer)
CREATE POLICY "Users can create redemptions"
  ON redemptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 6. RPC Function: Process Redemption
CREATE OR REPLACE FUNCTION process_redemption(
  user_email_input TEXT
) RETURNS JSON AS $$
DECLARE
  redeemer_user_id UUID;
  redeemer_current_streak INTEGER;
  days_required INTEGER := 10;
  item_name_val TEXT := 'Starbucks $5';
  item_value_val DECIMAL := 5.00;
  result JSON;
BEGIN
  -- Get authenticated user's ID
  redeemer_user_id := auth.uid();

  IF redeemer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate email
  IF user_email_input IS NULL OR user_email_input = '' THEN
    RAISE EXCEPTION 'Email is required for delivery';
  END IF;

  -- Get user's current streak
  SELECT current_streak INTO redeemer_current_streak
  FROM profile
  WHERE id = redeemer_user_id;

  -- Validation: minimum 10 days to redeem
  IF redeemer_current_streak < days_required THEN
    RAISE EXCEPTION 'Need at least % days to redeem. You have % days', days_required, redeemer_current_streak;
  END IF;

  -- Execute redemption: subtract days from user
  UPDATE profile
  SET current_streak = current_streak - days_required
  WHERE id = redeemer_user_id;

  -- Record the redemption
  INSERT INTO redemptions (user_id, days_redeemed, item_name, item_value, user_email, status)
  VALUES (redeemer_user_id, days_required, item_name_val, item_value_val, user_email_input, 'pending');

  -- Build success response
  result := json_build_object(
    'success', true,
    'daysRedeemed', days_required,
    'itemName', item_name_val,
    'itemValue', item_value_val,
    'newStreak', redeemer_current_streak - days_required,
    'email', user_email_input
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION process_redemption(TEXT) TO authenticated;

-- Migration complete!
-- Users can now redeem Bloom streak days for gift cards
