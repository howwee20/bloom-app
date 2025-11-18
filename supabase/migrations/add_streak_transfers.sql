-- Migration: Add Peer-to-Peer Streak Transfers
-- Allows users to send their Bloom streak days to other users

-- 1. Create streak_transfers table
CREATE TABLE IF NOT EXISTS streak_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES profile(id),
  to_user_id UUID NOT NULL REFERENCES profile(id),
  days_transferred INTEGER NOT NULL CHECK (days_transferred > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes for performance
CREATE INDEX idx_streak_transfers_from_user ON streak_transfers(from_user_id);
CREATE INDEX idx_streak_transfers_to_user ON streak_transfers(to_user_id);
CREATE INDEX idx_streak_transfers_created_at ON streak_transfers(created_at);

-- 3. Enable Row Level Security
ALTER TABLE streak_transfers ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy: Users can view their own transfers (sent or received)
CREATE POLICY "Users can view their transfers"
  ON streak_transfers
  FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- 5. RLS Policy: Users can create transfers (must be the sender)
CREATE POLICY "Users can create transfers"
  ON streak_transfers
  FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

-- 6. RPC Function: Transfer Streak Days
CREATE OR REPLACE FUNCTION transfer_streak_days(
  recipient_username TEXT,
  days_to_send INTEGER
) RETURNS JSON AS $$
DECLARE
  sender_user_id UUID;
  recipient_user_id UUID;
  sender_current_streak INTEGER;
  daily_transfer_count INTEGER;
  result JSON;
BEGIN
  -- Get authenticated user's ID
  sender_user_id := auth.uid();

  IF sender_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validation: days must be positive
  IF days_to_send <= 0 THEN
    RAISE EXCEPTION 'Must send at least 1 day';
  END IF;

  -- Get sender's current streak
  SELECT current_streak INTO sender_current_streak
  FROM profile
  WHERE id = sender_user_id;

  -- Validation: minimum 3 days to send (protect core streak)
  IF sender_current_streak < 3 THEN
    RAISE EXCEPTION 'Need at least 3 days in your streak to send';
  END IF;

  -- Validation: can't send more than you have (must keep at least 1 day)
  IF days_to_send >= sender_current_streak THEN
    RAISE EXCEPTION 'Cannot send all your days. You have % days, trying to send %', sender_current_streak, days_to_send;
  END IF;

  -- Find recipient by username (case-insensitive)
  SELECT id INTO recipient_user_id
  FROM profile
  WHERE LOWER(username) = LOWER(recipient_username);

  IF recipient_user_id IS NULL THEN
    RAISE EXCEPTION 'User "@%" not found', recipient_username;
  END IF;

  -- Validation: can't send to yourself
  IF sender_user_id = recipient_user_id THEN
    RAISE EXCEPTION 'Cannot send days to yourself';
  END IF;

  -- Anti-fraud: check daily send limit (max 20 days per 24 hours)
  SELECT COALESCE(SUM(days_transferred), 0) INTO daily_transfer_count
  FROM streak_transfers
  WHERE from_user_id = sender_user_id
    AND created_at >= NOW() - INTERVAL '24 hours';

  IF (daily_transfer_count + days_to_send) > 20 THEN
    RAISE EXCEPTION 'Daily transfer limit exceeded. You can send % more days today (max 20 per day)', 20 - daily_transfer_count;
  END IF;

  -- Execute transfer: subtract from sender
  UPDATE profile
  SET current_streak = current_streak - days_to_send
  WHERE id = sender_user_id;

  -- Execute transfer: add to recipient
  UPDATE profile
  SET current_streak = current_streak + days_to_send
  WHERE id = recipient_user_id;

  -- Record the transfer
  INSERT INTO streak_transfers (from_user_id, to_user_id, days_transferred)
  VALUES (sender_user_id, recipient_user_id, days_to_send);

  -- Build success response
  result := json_build_object(
    'success', true,
    'daysSent', days_to_send,
    'recipientUsername', recipient_username,
    'newSenderStreak', sender_current_streak - days_to_send
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION transfer_streak_days(TEXT, INTEGER) TO authenticated;

-- Migration complete!
-- Users can now send Bloom streak days to each other
