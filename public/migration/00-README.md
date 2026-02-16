# Bridge API - Guia de Migração

## Arquivos incluídos

| Arquivo | Descrição |
|---------|-----------|
| `01-schema.sql` | Schema completo: tabelas, índices, funções, triggers, RLS policies, storage buckets |
| `02-data-profiles.sql` | Dados da tabela profiles (8 registros) |
| `03-data-instances.sql` | Dados da tabela instances (7 registros) |

## Como importar no Supabase externo

### 1. Schema
1. Acesse o **SQL Editor** do seu projeto Supabase
2. Cole e execute o conteúdo de `01-schema.sql`
3. **IMPORTANTE**: Configure manualmente o trigger `on_auth_user_created` em **Database > Triggers**:
   - Tabela: `auth.users`
   - Evento: `AFTER INSERT`
   - Função: `public.handle_new_user()`

### 2. Dados
1. Execute `02-data-profiles.sql` 
2. Execute `03-data-instances.sql`
3. Para ghl_subaccounts e user_settings, os dados contêm tokens sensíveis - importe manualmente via SQL Editor

### 3. Edge Functions
- Copie a pasta `supabase/functions/` do projeto
- Deploy com: `supabase functions deploy --project-ref SEU_PROJECT_REF`
- Configure os secrets necessários: `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `FRONTEND_URL`

### 4. Auth Trigger
```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

### 5. Cron Jobs (configure em Database > Extensions > pg_cron)
```sql
SELECT cron.schedule('cleanup-processed-messages', '*/30 * * * *', 'SELECT public.cleanup_old_processed_messages()');
SELECT cron.schedule('cleanup-phone-mappings', '0 3 * * *', 'SELECT public.cleanup_old_phone_mappings()');
SELECT cron.schedule('cleanup-webhook-metrics', '0 4 * * *', 'SELECT public.cleanup_old_webhook_metrics()');
SELECT cron.schedule('cleanup-health-alerts', '0 5 * * *', 'SELECT public.cleanup_old_health_alerts()');
SELECT cron.schedule('cleanup-message-mappings', '*/30 * * * *', 'SELECT public.cleanup_old_message_mappings()');
```

### Tabelas de alta rotatividade (NÃO incluídas nos dados)
- `webhook_metrics` (10.453 registros) - dados transientes
- `message_map` (344 registros) - limpos a cada 24h
- `ghl_processed_messages` (37 registros) - limpos a cada 1h
- `ghl_contact_phone_mapping` (245 registros) - limpos a cada 30 dias

### Notas
- As webhook_url das instances apontam para o projeto atual. Atualize para o novo project URL.
- Os tokens OAuth do GHL precisarão ser reautorizados no novo projeto.
