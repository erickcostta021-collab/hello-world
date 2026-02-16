-- Função para fazer upsert de subcontas ignorando RLS
CREATE OR REPLACE FUNCTION public.upsert_subaccounts(
  p_user_id uuid,
  p_locations jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  location_record jsonb;
BEGIN
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
$$;