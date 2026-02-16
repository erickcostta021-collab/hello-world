-- Allow admin users to update any profile (for managing instance limits, pausing, etc.)
CREATE POLICY "Admin can update any profile"
ON public.profiles
FOR UPDATE
USING (is_admin())
WITH CHECK (is_admin());