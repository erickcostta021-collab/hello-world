-- Índices para otimização de queries frequentes

-- Tabela instances: acelera busca por subaccount e status
CREATE INDEX IF NOT EXISTS idx_instances_subaccount_id ON public.instances(subaccount_id);
CREATE INDEX IF NOT EXISTS idx_instances_status ON public.instances(instance_status);
CREATE INDEX IF NOT EXISTS idx_instances_subaccount_status ON public.instances(subaccount_id, instance_status);

-- Tabela ghl_subaccounts: acelera busca por location_id (usado em webhooks e get-instances)
CREATE INDEX IF NOT EXISTS idx_ghl_subaccounts_location_id ON public.ghl_subaccounts(location_id);

-- Tabela contact_instance_preferences: índice composto para Bridge Switcher
CREATE INDEX IF NOT EXISTS idx_contact_preferences_contact_location ON public.contact_instance_preferences(contact_id, location_id);

-- Tabela ghl_processed_messages: acelera verificação de duplicatas
CREATE INDEX IF NOT EXISTS idx_processed_messages_message_id ON public.ghl_processed_messages(message_id);