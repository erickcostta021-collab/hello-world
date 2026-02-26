
-- Function to get admin's global webhook URL (readable by any authenticated user)
CREATE OR REPLACE FUNCTION public.get_admin_webhook_url()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT us.global_webhook_url
  FROM public.user_settings us
  INNER JOIN public.user_roles ur ON ur.user_id = us.user_id
  WHERE ur.role = 'admin'
    AND us.global_webhook_url IS NOT NULL
  ORDER BY us.created_at ASC
  LIMIT 1;
$$;
