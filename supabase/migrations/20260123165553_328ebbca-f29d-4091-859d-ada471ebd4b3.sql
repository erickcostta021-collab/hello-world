-- Tabela para armazenar preferência de instância por contato
CREATE TABLE public.contact_instance_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  instance_id UUID NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contact_id, location_id)
);

-- Enable RLS
ALTER TABLE public.contact_instance_preferences ENABLE ROW LEVEL SECURITY;

-- Policy para permitir acesso via embed (mesma lógica das outras tabelas)
CREATE POLICY "Anyone can manage contact preferences for embed"
ON public.contact_instance_preferences
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.instances i
    JOIN public.ghl_subaccounts s ON s.id = i.subaccount_id
    WHERE i.id = contact_instance_preferences.instance_id
    AND s.embed_token IS NOT NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.instances i
    JOIN public.ghl_subaccounts s ON s.id = i.subaccount_id
    WHERE i.id = contact_instance_preferences.instance_id
    AND s.embed_token IS NOT NULL
  )
);

-- Policy para usuários autenticados
CREATE POLICY "Users can manage own contact preferences"
ON public.contact_instance_preferences
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.instances i
    WHERE i.id = contact_instance_preferences.instance_id
    AND i.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.instances i
    WHERE i.id = contact_instance_preferences.instance_id
    AND i.user_id = auth.uid()
  )
);

-- Trigger para updated_at
CREATE TRIGGER update_contact_instance_preferences_updated_at
BEFORE UPDATE ON public.contact_instance_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();