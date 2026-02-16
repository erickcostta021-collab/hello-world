-- Create function to cleanup old message mappings (older than 24 hours)
CREATE OR REPLACE FUNCTION public.cleanup_old_message_mappings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.message_map
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$;