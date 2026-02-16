-- Update upsert_subaccounts to also delete subaccounts not in the GHL response
CREATE OR REPLACE FUNCTION public.upsert_subaccounts(p_user_id uuid, p_locations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  location_record jsonb;
  location_ids text[];
BEGIN
  -- Build array of location_ids from input
  SELECT array_agg(loc->>'id') INTO location_ids
  FROM jsonb_array_elements(p_locations) AS loc;

  -- Delete subaccounts that are no longer in GHL for this user
  -- Only delete if they don't have associated instances
  DELETE FROM ghl_subaccounts
  WHERE user_id = p_user_id
    AND location_id NOT IN (SELECT unnest(location_ids))
    AND NOT EXISTS (
      SELECT 1 FROM instances WHERE instances.subaccount_id = ghl_subaccounts.id
    );

  -- Para cada location no array JSON
  FOR location_record IN SELECT * FROM jsonb_array_elements(p_locations)
  LOOP
    -- Upsert usando location_id como chave
    -- Se já existir, atualiza o user_id e account_name
    -- Se não existir, insere novo registro
    INSERT INTO ghl_subaccounts (user_id, location_id, account_name)
    VALUES (
      p_user_id,
      location_record->>'id',
      location_record->>'name'
    )
    ON CONFLICT (location_id) DO UPDATE
    SET 
      user_id = EXCLUDED.user_id,
      account_name = EXCLUDED.account_name,
      updated_at = now();
  END LOOP;
END;
$function$;