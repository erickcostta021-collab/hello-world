-- Add RLS policy to allow users to view their own unlinked instances (subaccount_id IS NULL)
CREATE POLICY "Users can view own unlinked instances"
  ON public.instances
  FOR SELECT
  USING (auth.uid() = user_id AND subaccount_id IS NULL);

-- Add RLS policy to allow users to update their own unlinked instances
CREATE POLICY "Users can update own unlinked instances"
  ON public.instances
  FOR UPDATE
  USING (auth.uid() = user_id AND subaccount_id IS NULL);