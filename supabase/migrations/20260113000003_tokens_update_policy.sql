-- Allow users to update their own tokens (purchase_price for cost basis)
CREATE POLICY "Users can update own tokens" ON tokens
  FOR UPDATE USING (auth.uid() = user_id);
