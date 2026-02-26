
-- Function to propagate admin's global_webhook_url to all other users
CREATE OR REPLACE FUNCTION public.propagate_global_webhook(p_webhook_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin required';
  END IF;
  
  UPDATE public.user_settings
  SET global_webhook_url = p_webhook_url, updated_at = now()
  WHERE user_id != auth.uid();
END;
$$;
