-- Fix search_path for the cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_old_phone_mappings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  DELETE FROM public.ghl_contact_phone_mapping
  WHERE updated_at < now() - INTERVAL '30 days';
END;
$function$;