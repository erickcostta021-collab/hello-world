-- Adicionar campos OAuth à tabela ghl_subaccounts
ALTER TABLE public.ghl_subaccounts
ADD COLUMN IF NOT EXISTS ghl_access_token TEXT,
ADD COLUMN IF NOT EXISTS ghl_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS ghl_token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ghl_token_scopes TEXT,
ADD COLUMN IF NOT EXISTS oauth_installed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS oauth_last_refresh TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS company_id TEXT;

-- Adicionar coluna para Conversation Provider ID nas configurações do usuário
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS ghl_client_id TEXT,
ADD COLUMN IF NOT EXISTS ghl_client_secret TEXT,
ADD COLUMN IF NOT EXISTS ghl_conversation_provider_id TEXT;

-- Criar índice para busca por location_id (já existe unique constraint, mas adicionamos para performance)
CREATE INDEX IF NOT EXISTS idx_ghl_subaccounts_location_id ON public.ghl_subaccounts(location_id);

-- Criar índice para tokens expirados (útil para refresh automático)
CREATE INDEX IF NOT EXISTS idx_ghl_subaccounts_token_expires ON public.ghl_subaccounts(ghl_token_expires_at)
WHERE ghl_token_expires_at IS NOT NULL;