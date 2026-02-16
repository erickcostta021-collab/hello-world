-- Allow admin to view all profiles
CREATE POLICY "Admin can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (
  (SELECT email FROM public.profiles WHERE user_id = auth.uid()) = 'erickcostta021@gmail.com'
);

-- Allow admin to delete any profile
CREATE POLICY "Admin can delete any profile" 
ON public.profiles 
FOR DELETE 
USING (
  (SELECT email FROM public.profiles WHERE user_id = auth.uid()) = 'erickcostta021@gmail.com'
);

-- Allow admin to delete any user_settings
CREATE POLICY "Admin can delete any user_settings" 
ON public.user_settings 
FOR DELETE 
USING (
  (SELECT email FROM public.profiles WHERE user_id = auth.uid()) = 'erickcostta021@gmail.com'
);

-- Allow admin to delete any instances
CREATE POLICY "Admin can delete any instances" 
ON public.instances 
FOR DELETE 
USING (
  (SELECT email FROM public.profiles WHERE user_id = auth.uid()) = 'erickcostta021@gmail.com'
);

-- Allow admin to delete any ghl_subaccounts
CREATE POLICY "Admin can delete any ghl_subaccounts" 
ON public.ghl_subaccounts 
FOR DELETE 
USING (
  (SELECT email FROM public.profiles WHERE user_id = auth.uid()) = 'erickcostta021@gmail.com'
);