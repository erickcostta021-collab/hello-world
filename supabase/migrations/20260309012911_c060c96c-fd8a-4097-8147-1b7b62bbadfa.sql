
CREATE OR REPLACE FUNCTION public.get_admin_uazapi_credentials()
RETURNS TABLE(uazapi_base_url text, uazapi_admin_token text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT us.uazapi_base_url, us.uazapi_admin_token
  FROM public.user_settings us
  INNER JOIN public.user_roles ur ON ur.user_id = us.user_id
  WHERE ur.role = 'admin'
    AND us.uazapi_base_url IS NOT NULL
    AND us.uazapi_admin_token IS NOT NULL
  ORDER BY us.created_at ASC
  LIMIT 1;
END;
$$;
