-- Drop the problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin can delete any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin can delete any user_settings" ON public.user_settings;
DROP POLICY IF EXISTS "Admin can delete any instances" ON public.instances;
DROP POLICY IF EXISTS "Admin can delete any ghl_subaccounts" ON public.ghl_subaccounts;

-- Create a security definer function to check if user is admin (avoids recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND email IN ('erickcostta021@gmail.com', 'erickcostta.br@gmail.com')
  )
$$;

-- Recreate policies using the security definer function
CREATE POLICY "Admin can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (public.is_admin());

CREATE POLICY "Admin can delete any profile" 
ON public.profiles 
FOR DELETE 
USING (public.is_admin());

CREATE POLICY "Admin can delete any user_settings" 
ON public.user_settings 
FOR DELETE 
USING (public.is_admin());

CREATE POLICY "Admin can delete any instances" 
ON public.instances 
FOR DELETE 
USING (public.is_admin());

CREATE POLICY "Admin can delete any ghl_subaccounts" 
ON public.ghl_subaccounts 
FOR DELETE 
USING (public.is_admin());