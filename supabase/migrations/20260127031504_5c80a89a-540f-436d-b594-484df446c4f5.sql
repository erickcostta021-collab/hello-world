-- Create function to cleanup old phone mappings (contacts not active in 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_phone_mappings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.ghl_contact_phone_mapping
  WHERE updated_at < now() - INTERVAL '30 days';
END;
$function$;