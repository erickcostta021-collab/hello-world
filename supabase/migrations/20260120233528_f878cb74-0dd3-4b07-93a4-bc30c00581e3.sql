-- Tabela para armazenar solicitações de registro pendentes com códigos de aprovação
CREATE TABLE public.registration_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    code text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'used')),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '24 hours'),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;

-- Política para permitir inserção anônima (para solicitação de registro)
CREATE POLICY "Anyone can create registration request"
ON public.registration_requests
FOR INSERT
TO anon
WITH CHECK (true);

-- Política para permitir leitura anônima (para verificar código)
CREATE POLICY "Anyone can read registration requests"
ON public.registration_requests
FOR SELECT
TO anon
USING (true);

-- Política para permitir atualização anônima (para marcar como usado)
CREATE POLICY "Anyone can update registration requests"
ON public.registration_requests
FOR UPDATE
TO anon
USING (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_registration_requests_updated_at
BEFORE UPDATE ON public.registration_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();