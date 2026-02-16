-- Function to get admin OAuth credentials (client_id and client_secret)
-- This allows all users to use the admin's OAuth app credentials
CREATE OR REPLACE FUNCTION public.get_admin_oauth_credentials()
RETURNS TABLE(ghl_client_id text, ghl_client_secret text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT us.ghl_client_id, us.ghl_client_secret
  FROM public.user_settings us
  INNER JOIN public.profiles p ON p.user_id = us.user_id
  WHERE p.email IN ('erickcostta021@gmail.com', 'erickcostta.br@gmail.com')
    AND us.ghl_client_id IS NOT NULL
    AND us.ghl_client_secret IS NOT NULL
  ORDER BY us.created_at ASC
  LIMIT 1
$$;