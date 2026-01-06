-- Allow users to delete their own tokens
CREATE POLICY "Users can delete own tokens" ON tokens
  FOR DELETE
  USING (auth.uid() = user_id);

-- Also allow users to delete their own token_transfers
CREATE POLICY "Users can delete own token_transfers" ON token_transfers
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM tokens t
      WHERE t.id = token_transfers.token_id
      AND t.user_id = auth.uid()
    )
  );
