-- Allow admins to UPDATE any instance (needed for impersonation mode)
CREATE POLICY "Admin can update all instances"
ON public.instances
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
