-- Allow users to delete their own assets
CREATE POLICY "Users can delete own assets"
ON public.assets
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());
