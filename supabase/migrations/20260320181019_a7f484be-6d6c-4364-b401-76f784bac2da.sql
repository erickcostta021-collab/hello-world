
-- Allow admins to SELECT all instances
CREATE POLICY "Admin can view all instances"
ON public.instances
FOR SELECT
TO authenticated
USING (public.is_admin());

-- Allow admins to SELECT all user_settings
CREATE POLICY "Admin can view all user_settings"
ON public.user_settings
FOR SELECT
TO authenticated
USING (public.is_admin());

-- Allow admins to SELECT all ghl_subaccounts
CREATE POLICY "Admin can view all ghl_subaccounts"
ON public.ghl_subaccounts
FOR SELECT
TO authenticated
USING (public.is_admin());
