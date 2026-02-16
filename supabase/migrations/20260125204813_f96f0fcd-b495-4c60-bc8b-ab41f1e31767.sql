
-- 1. Deletar duplicatas mantendo apenas o registro mais recente (por created_at DESC)
-- Para OVTSk4yReXeokCK3KlUk: manter 5f3ab44f-1157-49b0-8120-95fc84c30733, deletar 646c6e57-4dce-4fd3-84cc-243dc2d9ec9f
-- Para PGsPTAjpOPBcdd3G7mlI: manter 3467fb68-ace4-48ba-ba98-1aabbf7d1011, deletar 1f12760e-913b-4917-9cf7-c5ad6343a73d
-- Para rHJoSeoIQ8JYw9ACBQQE: manter 09b63810-759b-4d5f-8c68-a9bbe70377b3, deletar a5c3bb1f-24f3-4e93-a1f0-43b799828cec

DELETE FROM ghl_subaccounts 
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY location_id ORDER BY created_at DESC) as rn
    FROM ghl_subaccounts
  ) sub
  WHERE rn > 1
);

-- 2. Adicionar UNIQUE constraint na coluna location_id para prevenir duplicatas futuras
ALTER TABLE ghl_subaccounts 
ADD CONSTRAINT ghl_subaccounts_location_id_unique UNIQUE (location_id);

-- 3. Criar índice para melhor performance nas buscas por location_id (se ainda não existir)
CREATE INDEX IF NOT EXISTS idx_ghl_subaccounts_location_id ON ghl_subaccounts(location_id);
