# 🚀 Prompt para Criar CRM com Integração WhatsApp (UAZAPI) + GoHighLevel

> Use este prompt ao iniciar um novo projeto de CRM. Ele contém toda a arquitetura, lógicas e padrões já validados em produção.

---

## 📋 Contexto do Projeto

Estou criando um CRM que integra **WhatsApp** (via API UAZAPI) com o **GoHighLevel** (GHL). A stack é **React + Vite + TypeScript + Tailwind CSS + Supabase** (auth, banco, Edge Functions, Realtime).

---

## 🗄️ Schema do Banco de Dados (Supabase/Postgres)

### Tabelas Principais

```sql
-- Enum de status
CREATE TYPE instance_status AS ENUM ('connected', 'connecting', 'disconnected');
CREATE TYPE app_role AS ENUM ('admin', 'moderator', 'user');

-- Perfis de usuário
CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  phone text,
  instance_limit integer DEFAULT 0,
  is_paused boolean DEFAULT false,
  paused_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Roles separadas (NUNCA na tabela profiles)
CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Configurações por usuário
CREATE TABLE user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  uazapi_base_url text,           -- URL base do servidor UAZAPI
  uazapi_admin_token text,        -- Token admin para criar/deletar instâncias
  global_webhook_url text,        -- URL do webhook inbound
  ghl_client_id text,
  ghl_client_secret text,
  ghl_conversation_provider_id text,
  ghl_agency_token text,          -- Token PIT da agência GHL
  track_id text DEFAULT gen_random_uuid()::text, -- Anti-loop
  queue_enabled boolean DEFAULT true,
  queue_batch_ms integer DEFAULT 1000,
  shared_from_user_id uuid,       -- Compartilhamento de conta
  webhook_inbound_url text,
  webhook_outbound_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Subcontas GHL (locations)
CREATE TABLE ghl_subaccounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  location_id text NOT NULL,
  account_name text NOT NULL,
  company_id text,
  ghl_access_token text,
  ghl_refresh_token text,
  ghl_token_expires_at timestamptz,
  ghl_token_scopes text,
  ghl_user_id text,
  ghl_subaccount_token text,
  embed_token text,               -- Token para acesso via iframe
  embed_password text,
  skip_outbound boolean DEFAULT false,
  oauth_installed_at timestamptz,
  oauth_last_refresh timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, location_id)
);

-- Instâncias WhatsApp
CREATE TABLE instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subaccount_id uuid REFERENCES ghl_subaccounts(id),
  instance_name text NOT NULL,
  uazapi_instance_token text NOT NULL,
  uazapi_base_url text,           -- Override per-instance
  instance_status instance_status DEFAULT 'disconnected',
  webhook_url text,
  phone text,
  profile_pic_url text,
  ghl_user_id text,
  is_official_api boolean DEFAULT false,
  ignore_groups boolean DEFAULT false,
  embed_visible_options jsonb DEFAULT '{"token":true,"status":true,"connect":true,"webhook":true,"base_url":true,"messages":true,"track_id":true,"disconnect":true,"api_oficial":false,"assign_user":true,"group_manager":true}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Preferência de instância por contato (para round-robin de resposta)
CREATE TABLE contact_instance_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id text NOT NULL,
  instance_id uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  location_id text NOT NULL,
  lead_phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Mapeamento de mensagens WhatsApp ↔ GHL
CREATE TABLE message_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_message_id text NOT NULL UNIQUE,
  uazapi_message_id text,
  location_id text NOT NULL,
  contact_id text,
  message_text text,
  message_type text DEFAULT 'text',
  from_me boolean DEFAULT false,
  is_deleted boolean DEFAULT false,
  is_edited boolean DEFAULT false,
  reactions jsonb DEFAULT '[]',
  original_timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Deduplicação de mensagens processadas
CREATE TABLE ghl_processed_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Métricas de webhook
CREATE TABLE webhook_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  status_code integer DEFAULT 200,
  error_type text,
  instance_id uuid REFERENCES instances(id) ON DELETE CASCADE,
  location_id text,
  processing_time_ms integer,
  created_at timestamptz DEFAULT now()
);

-- Mensagens agendadas para grupos
CREATE TABLE scheduled_group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  instance_id uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  group_jid text NOT NULL,
  group_name text DEFAULT '',
  message_text text NOT NULL,
  media_url text,
  media_type text,
  mention_all boolean DEFAULT false,
  scheduled_for timestamptz NOT NULL,
  is_recurring boolean DEFAULT false,
  recurring_interval text,
  weekdays integer[],
  day_of_month integer,
  send_time text,
  end_date timestamptz,
  max_executions integer,
  execution_count integer DEFAULT 0,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### Funções SQL Importantes

```sql
-- Verificar role (SECURITY DEFINER para evitar recursão RLS)
CREATE FUNCTION has_role(_user_id uuid, _role app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT has_role(auth.uid(), 'admin')
$$;

-- Resolver user_id efetivo (para contas compartilhadas)
CREATE FUNCTION get_effective_user_id(p_user_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(shared_from_user_id, p_user_id) FROM user_settings WHERE user_id = p_user_id
$$;

-- Auto-criar profile + settings ao registrar
CREATE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (user_id, email) VALUES (NEW.id, NEW.email);
  INSERT INTO user_settings (user_id, track_id) VALUES (NEW.id, gen_random_uuid()::text);
  RETURN NEW;
END;
$$;
-- Trigger: AFTER INSERT ON auth.users → handle_new_user()
```

---

## 🔌 Integração UAZAPI (API WhatsApp)

### Padrões de Comunicação

A UAZAPI tem variações de endpoints entre versões. Sempre use **fallback multi-endpoint**:

```typescript
// Padrão: tentar múltiplos paths até encontrar o correto
const candidatePaths = [
  "/instance/status",
  "/api/instance/status", 
  "/v2/instance/status",
  "/api/v2/instance/status"
];

for (const path of candidatePaths) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", token: instanceToken }
  });
  if (res.status === 404) continue;
  return res;
}
```

### Autenticação UAZAPI
- **Per-instance**: Header `token: <instance_token>` (para status, connect, qr, send, groups)
- **Admin**: Header `admintoken: <admin_token>` (para criar/deletar instâncias, listar todas)

### Endpoints Principais

| Ação | Método | Path | Headers |
|------|--------|------|---------|
| Status | GET | `/instance/status` | `token` |
| Conectar (gera QR) | POST | `/instance/connect` | `token` |
| QR Code | GET | `/instance/qrcode` | `token` |
| Desconectar | POST | `/instance/disconnect` ou `/instance/logout` | `token` |
| Criar instância | POST | `/instance/init` | `admintoken` |
| Deletar instância | DELETE | `/instance` | `token` |
| Listar todas | GET | `/instance/all` | `admintoken` |
| Enviar texto | POST | `/send/text` | `token` |
| Enviar mídia | POST | `/send/image`, `/send/video`, `/send/audio`, `/send/document` | `token` |
| Listar grupos | GET | `/group/list?force=true&refresh=true` | `token` |
| Info grupo | GET | `/group/info?groupjid=XXX` | `token` |
| Criar grupo | POST | `/group/create` | `token` |
| Webhook config | POST | `/webhook` | `token` |
| Listar webhooks | GET | `/webhook/list` | `token` |
| Disparo em massa | POST | `/sender/simple` ou `/sender/advanced` | `token` |
| Limpar fila | POST `/sender/cleardone` / DELETE `/sender/clearall` | `token` |

### Resolução de Status

```typescript
function parseStatus(data: any): { status: string; phone?: string; profilePicUrl?: string } {
  const phone = data.instance?.owner || data.status?.jid?.split("@")?.[0] || data.phone || "";
  const profilePicUrl = data.instance?.profilePicUrl || data.profilePicUrl || "";
  
  const loggedIn = data.status?.loggedIn === true || data.instance?.loggedIn === true;
  const jid = data.status?.jid || data.instance?.jid;
  const rawStatus = data.instance?.status || data.status || data.state || "disconnected";
  const isConnected = loggedIn || !!jid || ["connected","open","authenticated"].includes(rawStatus.toLowerCase());
  
  return {
    status: isConnected ? (phone ? "connected" : "connecting") : "disconnected",
    phone,
    profilePicUrl
  };
}
```

### Estratégia de QR Code (com reconexão forçada)

1. Tenta `POST /instance/connect` → extrai QR
2. Tenta `GET /instance/qrcode` (múltiplos paths)
3. Se falhar: desconecta (`POST /instance/disconnect` ou `/instance/logout`), espera 1.5s, reconecta

---

## 🔄 Webhooks (Bidirecional WhatsApp ↔ GHL)

### webhook-inbound (WhatsApp → GHL)

Recebe eventos da UAZAPI e sincroniza com o GHL:

**Filtros de segurança (anti-loop):**
1. Ignora `receipts`, `status_update`, eventos de presença
2. Se `fromMe: true` ou `wasSentByApi: true` → só processa se tiver `track_id` válido no payload
3. Deduplicação por `messageId` + SHA-256 (conteúdo + contato + location em janela de 1 min)

**Fluxo principal:**
1. Identifica instância pelo `token` no payload
2. Busca subconta GHL vinculada
3. Obtém/cria contato no GHL (`findOrCreateContact`)
4. Envia mensagem para GHL via API de Conversations
5. Mapeia IDs na tabela `message_map`
6. Atualiza `contact_instance_preferences`

**Track ID (anti-loop para mensagens próprias):**
```
Bridge envia msg com track_id no payload UAZAPI
  → UAZAPI ecoa via webhook
    → webhook-inbound verifica track_id
      → Válido: sincroniza ao GHL ✅
      → Ausente: ignora (previne loop) ❌
```

### webhook-outbound (GHL → WhatsApp)

Recebe mensagens do Conversation Provider GHL e envia via UAZAPI:

**Filtros:**
1. Bloqueia `direction: "inbound"` (previne loop)
2. Ignora `InternalComment`
3. Deduplicação por `messageId` + SHA-256

**Fluxo:**
1. Identifica subconta pela `locationId`
2. Resolve instância (preferência do contato → primeira conectada)
3. Formata telefone (remove @s.whatsapp.net, @lid, etc.)
4. Envia texto/mídia via UAZAPI
5. Registra `uazapiMessageId` no `message_map` para dedup do eco

### Refresh de Token GHL (OAuth)

```typescript
async function getValidToken(supabase, subaccount, settings) {
  // 1. Verifica cache in-memory
  const cached = getCachedToken(subaccount.id);
  if (cached) return cached;
  
  // 2. Verifica se token DB ainda é válido
  const expiresAt = new Date(subaccount.ghl_token_expires_at);
  if (Date.now() < expiresAt.getTime() - 5 * 60 * 1000) {
    setCachedToken(subaccount.id, subaccount.ghl_access_token, expiresAt);
    return subaccount.ghl_access_token;
  }
  
  // 3. Refresh via OAuth
  const res = await fetch("https://services.leadconnectorhq.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.ghl_client_id,
      client_secret: settings.ghl_client_secret,
      grant_type: "refresh_token",
      refresh_token: subaccount.ghl_refresh_token,
      user_type: "Location"
    })
  });
  const data = await res.json();
  
  // 4. Salva no DB + cache
  await supabase.from("ghl_subaccounts").update({
    ghl_access_token: data.access_token,
    ghl_refresh_token: data.refresh_token,
    ghl_token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
  }).eq("id", subaccount.id);
  
  return data.access_token;
}
```

---

## 👥 Gerenciamento de Grupos WhatsApp

### Comandos de Grupo (via texto "#comando")

| Comando | Params | Ação |
|---------|--------|------|
| `#criargrupo` | nome\|descrição\|fotoUrl\|participantes | Cria grupo |
| `#removerdogrupo` | groupJid\|telefone | Remove membro |
| `#addnogrupo` | groupJid\|telefone | Adiciona membro |
| `#promoveradmin` | groupJid\|telefone | Promove a admin |
| `#revogaradmin` | groupJid\|telefone | Revoga admin |
| `#attfotogrupo` | groupJid\|url | Atualiza foto |
| `#attnomegrupo` | nomeAtual\|novoNome | Renomeia |
| `#attdescricao` | groupJid\|descrição | Atualiza descrição |
| `#somenteadminmsg` / `#msgliberada` | groupJid | Toggle msgs admin-only |
| `#linkgrupo` | groupJid\|telefone | Envia link convite |
| `#sairgrupo` | groupJid | Sai do grupo |
| `#enviargrupo` | groupJid\|mensagem | Envia msg ao grupo |

### Listagem de Grupos
- Endpoint: `GET /group/list?force=true&refresh=true` (cache-busting)
- Info: `GET /group/info?groupjid=XXX` ou `/group/info?id=XXX`
- Membros: campo `participants` ou `Participants` no response

---

## 📨 Disparo em Massa

### Modo Simples
```json
POST /sender/simple
{
  "phone": ["5511999...", "5511888..."],
  "message": "Olá {nome}!",
  "delay_min": 5,
  "delay_max": 15,
  "trackId": "uuid-do-usuario"  // Para sincronizar eco com GHL
}
```

### Modo Avançado (CSV)
```json
POST /sender/advanced
{
  "messages": [
    { "phone": "5511999...", "message": "Olá João!", "delay": 10 },
    { "phone": "5511888...", "message": "Olá Maria!", "delay": 12 }
  ],
  "trackId": "uuid-do-usuario"
}
```

### Anti-Ban
- Intervalos variáveis entre mensagens
- Caracteres invisíveis opcionais
- Emojis aleatórios opcionais
- Round-robin entre múltiplas instâncias

---

## 🔐 Segurança

### RLS Patterns
- Usuários veem apenas seus próprios dados (`auth.uid() = user_id`)
- Admins veem tudo via `is_admin()` (SECURITY DEFINER)
- Embed access via `embed_token IS NOT NULL`
- Contas compartilhadas via `get_effective_user_id(auth.uid())`

### Roles
- Sempre em tabela separada `user_roles` (NUNCA em `profiles`)
- Função `has_role()` com SECURITY DEFINER para evitar recursão RLS

### Embed (iframe GHL)
- Autenticação por `embed_token` (regenerável)
- Senha opcional por subconta (`embed_password`)
- Proxy via Edge Function `uazapi-proxy-embed` (valida token antes de chamar UAZAPI)
- Visibilidade granular de features via `embed_visible_options` (JSONB)

---

## 📊 Mapeamento de Mensagens

A tabela `message_map` vincula IDs do GHL aos IDs da UAZAPI, permitindo:
- **Reações**: Busca `uazapi_message_id` → POST `/message/react`
- **Edição**: Janela de 15 min → POST `/message/edit`
- **Exclusão**: Mark `is_deleted` → optional DELETE na UAZAPI
- **Resposta encadeada**: Usa `replyid` no envio
- **Limpeza automática**: Cron job remove registros > 7 dias

---

## 🔁 Retry & Resiliência

### Padrão fetchGHL (para APIs GHL)
```typescript
async function fetchGHL(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429) { // Rate limit
      const wait = Math.min(1000 * 2**attempt, 8000);
      await sleep(wait);
      continue;
    }
    if (res.status >= 500 && attempt < maxRetries) {
      await sleep(Math.min(1000 * 2**attempt, 8000));
      continue;
    }
    return res;
  }
}
```

### Padrão postJson (para UAZAPI - tenta POST e PUT)
```typescript
async function postJson(url, token, body) {
  for (const method of ["POST", "PUT"]) {
    const res = await fetch(url, { method, headers: { token }, body: JSON.stringify(body) });
    if (res.ok) return res;
  }
}
```

---

## 📁 Estrutura de Edge Functions

| Função | Responsabilidade |
|--------|-----------------|
| `webhook-inbound` | WhatsApp → GHL (recebe eventos UAZAPI) |
| `webhook-outbound` | GHL → WhatsApp (Conversation Provider) |
| `map-messages` | CRUD do message_map + reações/edições/exclusões |
| `configure-webhook` | Configura webhook na UAZAPI (multi-endpoint) |
| `list-groups` | Lista grupos + membros de uma instância |
| `group-commands` | Processa comandos "#" de gestão de grupo |
| `uazapi-proxy-embed` | Proxy autenticado por embed_token para iframe |
| `refresh-token` | Refresh individual de token GHL |
| `refresh-all-tokens` | Refresh em batch de todos os tokens |
| `list-ghl-contacts` | Lista contatos de uma location GHL |
| `health-check` | Verifica saúde dos servidores UAZAPI |
| `scheduled-messages-proxy` | CRUD de mensagens agendadas para grupos |
| `process-scheduled-messages` | Cron: envia mensagens agendadas pendentes |

---

## ⏰ Cron Jobs

```sql
SELECT cron.schedule('cleanup-processed-messages', '*/30 * * * *', 'SELECT cleanup_old_processed_messages()');
SELECT cron.schedule('cleanup-phone-mappings', '0 3 * * *', 'SELECT cleanup_old_phone_mappings()');
SELECT cron.schedule('cleanup-webhook-metrics', '0 4 * * *', 'SELECT cleanup_old_webhook_metrics()');
SELECT cron.schedule('cleanup-message-mappings', '*/30 * * * *', 'SELECT cleanup_old_message_mappings()');
```

---

## 📬 Caixa de Entrada (Inbox) — Estilo Chatwoot

O CRM precisa de uma **caixa de entrada por número/instância WhatsApp**, similar ao Chatwoot:

- Cada instância WhatsApp conectada tem sua própria inbox
- Lista de conversas à esquerda, chat aberto à direita (layout split-panel)
- Indicadores de mensagens não lidas, último horário, preview da última mensagem
- Busca de conversas por nome/telefone
- Filtros: todas, não lidas, atribuídas a mim, não atribuídas
- Atribuição de conversa a agentes/usuários
- Suporte a texto, imagens, áudio, vídeo, documentos (envio e recebimento)
- Mensagens em tempo real via Supabase Realtime (subscribe na tabela `message_map` ou canal dedicado)
- Status de entrega/leitura quando disponível
- Respostas rápidas / templates salvos

---

## 📋 Kanban — Estilo GHL (Pipeline de Vendas)

O CRM precisa de um **quadro Kanban** para gerenciar leads/oportunidades:

- Colunas configuráveis por pipeline (ex: Novo Lead → Qualificado → Proposta → Fechado)
- Drag-and-drop de cards entre colunas
- Cada card mostra: nome do contato, telefone, valor, tags, último contato
- Múltiplos pipelines (ex: Vendas, Suporte, Onboarding)
- Filtros por responsável, tags, data
- Ações rápidas no card: enviar mensagem, agendar tarefa, mover etapa
- Persistência no Supabase com tabelas `pipelines`, `pipeline_stages`, `opportunities`
- RLS por `user_id` (cada usuário vê seus próprios pipelines, admin vê todos)

---

## 📅 Calendário — Estilo GHL

O CRM precisa de um **calendário** para agendamentos:

- Visualização mensal, semanal e diária
- Criar, editar e excluir eventos/tarefas
- Vincular eventos a contatos/oportunidades
- Lembretes/notificações (pode usar scheduled messages ou cron)
- Tipos de evento: reunião, ligação, tarefa, follow-up
- Cores por tipo ou pipeline
- Integração com a caixa de entrada (agendar mensagem a partir do calendário)
- Persistência no Supabase com tabelas `calendar_events`
- RLS por `user_id`

---

## 🔑 Sistema de Login e Senha

O CRM precisa de autenticação completa:

### Registro
- Formulário com email, nome, telefone, senha
- Verificação por código enviado via email (Edge Function `send-registration-code`)
- Fluxo: email → código → validação → criação da conta (`create-user` com `email_confirm: true`)
- O código deve ser marcado como `used` antes de criar o usuário

### Login
- Email + senha via `supabase.auth.signInWithPassword`
- Verificação de conta pausada (`profiles.is_paused`)
- Redirecionamento ao dashboard após login

### Recuperação de Senha
- Envio de link de reset via Edge Function (`send-reset-password`)
- Página `/reset-password` que recebe `token_hash` e chama `supabase.auth.updateUser({ password })`

### Alteração de Senha (logado)
- Re-autenticação com senha atual
- Atualização via `supabase.auth.updateUser`

### Roles e Permissões
- Tabela `user_roles` separada (NUNCA na tabela profiles)
- Função `has_role()` com SECURITY DEFINER
- Roles: `admin`, `moderator`, `user`

---

## 🌐 API Pública do CRM

O CRM precisa expor uma **API REST** via Supabase Edge Functions:

- Autenticação via API Key ou Bearer Token (gerado por usuário)
- Endpoints principais:
  - `POST /api/send-message` — Enviar mensagem WhatsApp
  - `GET /api/contacts` — Listar contatos
  - `POST /api/contacts` — Criar contato
  - `GET /api/conversations` — Listar conversas
  - `GET /api/instances` — Listar instâncias e status
  - `POST /api/opportunities` — Criar oportunidade no Kanban
  - `GET /api/pipelines` — Listar pipelines e estágios
  - `POST /api/calendar-events` — Criar evento no calendário
- Rate limiting básico (por API key)
- Logs de uso por endpoint
- Documentação Swagger/OpenAPI

---

## 🎯 Pontos-Chave para o CRM

1. **URL base é por-instância ou global** — prioridade: `instance.uazapi_base_url` > `user_settings.uazapi_base_url`
2. **Track ID é obrigatório** — sem ele, mensagens enviadas pelo sistema serão ignoradas pelo webhook-inbound
3. **Tokens GHL expiram** — sempre implementar auto-refresh com cache in-memory + DB
4. **UAZAPI varia endpoints** — sempre usar fallback multi-path
5. **Deduplicação é crítica** — sem ela, loops infinitos entre GHL e WhatsApp
6. **Round-robin para bulk** — distribui envios entre instâncias para anti-ban
7. **Preferência de instância** — responde pelo mesmo número que recebeu a msg do lead
