# BRIDGE — Estrutura Visual e Modelo de Dados (UAZAPI + Grupos)

> Documento de referência para replicar a interface visual e lógica de campos do sistema Bridge.
> Inclui: modelo de instância, criação/listagem de grupos, detalhes de grupo, mensagens programadas, e card de instância.

---

## 1. Modelo de Instância (Tabela `instances`)

### Campos do banco de dados

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | uuid (PK) | auto | ID único da instância |
| `user_id` | uuid (FK → auth.users) | sim | Dono da instância |
| `subaccount_id` | uuid (FK → ghl_subaccounts) | não | Subconta GHL vinculada |
| `instance_name` | text | sim | Nome de exibição (ex: "Equipe de Vendas") |
| `uazapi_instance_token` | text | sim | Token de autenticação na UAZAPI |
| `uazapi_base_url` | text | não | URL base override (se diferente do global) |
| `instance_status` | enum (`connected`, `connecting`, `disconnected`) | sim (default: `disconnected`) | Status da conexão WhatsApp |
| `is_official_api` | boolean | sim (default: false) | Se usa API oficial do WhatsApp |
| `phone` | text | não | Número conectado (ex: `5511999999999`) |
| `profile_pic_url` | text | não | URL da foto de perfil do WhatsApp |
| `ghl_user_id` | text | não | ID do usuário GHL atribuído |
| `webhook_url` | text | não | URL do webhook configurado |
| `ignore_groups` | boolean | não (default: false) | Ignorar mensagens de grupos no webhook |
| `embed_visible_options` | jsonb | não | Opções de visibilidade no iframe embed |
| `created_at` | timestamptz | auto | Data de criação |
| `updated_at` | timestamptz | auto | Data de atualização |

### Interface TypeScript

```typescript
export interface Instance {
  id: string;
  user_id: string;
  subaccount_id: string | null;
  instance_name: string;
  uazapi_instance_token: string;
  uazapi_base_url: string | null;
  instance_status: "connected" | "connecting" | "disconnected";
  is_official_api: boolean;
  phone: string | null;
  profile_pic_url: string | null;
  ghl_user_id: string | null;
  webhook_url: string | null;
  ignore_groups: boolean | null;
  embed_visible_options: EmbedVisibleOptions | null;
  created_at: string;
  updated_at: string;
}

export interface EmbedVisibleOptions {
  assign_user?: boolean;
  webhook?: boolean;
  track_id?: boolean;
  base_url?: boolean;
  token?: boolean;
  connect?: boolean;
  disconnect?: boolean;
  status?: boolean;
  messages?: boolean;
  api_oficial?: boolean;
  group_manager?: boolean;
}
```

---

## 2. Card de Instância (`InstanceCard`)

### Layout visual

```
┌─────────────────────────────────────────────┐
│  [Avatar/Ícone]  Nome da Instância    [⚙️][⋮]│
│                  🟢 (server health dot)      │
│                  📞 +55 11 99999-9999        │
│                  👤 Nome Usuário GHL         │
│                  🏷️ API Oficial (badge)       │
│                                              │
│  📋 https://servidor.com/instance/abc...     │
│  📋 d03562b7-f6d9-...4114  👁️               │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  ✅ WhatsApp Conectado               │    │
│  └──────────────────────────────────────┘    │
│          [🔴 Desconectar]                    │
│  — OU —                                      │
│  ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐    │
│  ╎     📱 QR Code                       ╎    │
│  ╎     Clique para conectar             ╎    │
│  └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘    │
│          [Conectar]                          │
└─────────────────────────────────────────────┘
```

### Status visuais

| Status | Badge | Cor | Borda do card |
|---|---|---|---|
| `connected` | "Conectado" | `emerald-500/20 text-emerald-400` | Animação snake-border |
| `connecting` | "Conectando" | `amber-500/20 text-amber-400 animate-pulse` | Normal |
| `disconnected` | "Desconectado" | `muted/50 text-muted-foreground` | Normal |

### Ações do menu dropdown (⋮)

| Ação | Ícone | Descrição |
|---|---|---|
| Copiar Track ID | `Copy` | Copia o track_id do usuário |
| Configurar Webhook | `Settings2` | Abre `WebhookConfigDialog` |
| Mensagem em massa (beta) | `MessageSquare` | Abre `ManageMessagesDialog` |
| Gerenciador de Grupos | `Users` | Abre `GroupManagerDialog` |
| Atribuir Usuário GHL | `UserPlus` | Abre `AssignGHLUserDialog` |
| Ativar/Desativar API Oficial | `Smartphone` | Toggle `is_official_api` |
| Desvincular | `Unlink` | Remove do sistema (mantém na UAZAPI) |
| Excluir Permanentemente | `Trash2` | Remove do sistema E da UAZAPI |

### Seção de credenciais

- **Base URL**: Clicável para copiar. Mostra `instance.uazapi_base_url` ou fallback para `settings.uazapi_base_url`
- **Token**: Truncado por padrão (`12 chars...últimos 4`), com botão 👁️ para revelar/ocultar. Clicável para copiar.

---

## 3. Adicionar Instância (`AddInstanceDialog`)

### Abas disponíveis

| Aba | Condição | Descrição |
|---|---|---|
| **Criar Nova** | `hasUAZAPIConfig = true` | Cria instância na UAZAPI |
| **Importar** | `hasUAZAPIConfig = true` | Lista instâncias do servidor para importar |
| **Manual** | Sempre | Conecta com URL + Token manuais |

### Campos — Aba "Criar Nova"

| Campo | Tipo | Obrigatório | Placeholder | Descrição |
|---|---|---|---|---|
| Nome da Instância | `Input` | sim | "Ex: [Cliente][01]" | Nome de exibição |
| System Name | `Input` | não | (espelha Nome) | Nome interno, com tooltip explicativo |
| Usuário GHL | `Select` | não | "Nenhum usuário" | Lista usuários do GHL via OAuth |

### Campos — Aba "Manual" (`ManualConnectTab`)

| Campo | Tipo | Obrigatório | Placeholder | Descrição |
|---|---|---|---|---|
| URL do Servidor | `Input` | sim | "https://api.uazapi.com/instance/abc" | URL base da UAZAPI |
| Token da Instância | `Input` | sim | "Token de acesso" | Token de autenticação |
| Nome da Instância | `Input` | não | — | Opcional, detectado automaticamente |

### Lógica de limite

- Mostra `{linkedCount} vinculada(s) de {instanceLimit} do plano`
- Se `!canCreateInstance`: Alert vermelho "Limite de X instâncias atingido"
- Botão desabilitado com texto "Limite Atingido"

---

## 4. Gerenciador de Grupos (`GroupManagerDialog`)

### Layout principal

```
┌────────────────────────────────────────────────────────┐
│  👥 Gerenciador de Grupos                              │
│  Gerencie os grupos do WhatsApp de {instance_name}     │
│                                                         │
│  [+ Criar Grupo] [📅 Mensagens Programadas] [🔄 Buscar]│
│                                    [🔀 Ignorar grupos] │
│                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│  │ [Avatar]     │ │ [Avatar]     │ │ [Avatar]     │      │
│  │ Nome Grupo   │ │ Nome Grupo   │ │ Nome Grupo   │      │
│  │ 👥 42  Admin │ │ 👥 15        │ │ 👥 8   Admin │      │
│  └─────────────┘ └─────────────┘ └─────────────┘      │
└────────────────────────────────────────────────────────┘
```

### Interface `GroupInfo`

```typescript
interface GroupInfo {
  id: string;        // JID do grupo (ex: "120363xxx@g.us")
  name: string;      // Nome do grupo
  memberCount?: number; // Quantidade de participantes
  isAdmin?: boolean;  // Se a instância é admin
  profilePicUrl?: string; // Foto do grupo
}
```

### Card de grupo (grid 1-3 colunas)

| Elemento | Componente | Descrição |
|---|---|---|
| Avatar | `Avatar` (10x10, rounded-lg) | Foto do grupo ou iniciais (2 chars) |
| Nome | `h4` truncado | Nome do grupo |
| Membros | `Users` ícone + número | Contagem ou "—" se indisponível |
| Badge Admin | `Badge` outline | Âmbar, com ícone `Shield`, se `isAdmin` |

### Ações

| Botão | Cor (gradiente) | Ação |
|---|---|---|
| Criar Grupo | `blue-500 → blue-600` | Abre `CreateGroupDialog` |
| Mensagens Programadas | `purple-500 → violet-600` | Abre `ScheduledMessagesDialog` |
| Buscar Grupos | `amber-400 → orange-500` | Refetch da Edge Function |
| Switch "Ignorar grupos" | — | Atualiza `instances.ignore_groups` |

---

## 5. Criar Grupo (`CreateGroupDialog`)

### Campos do formulário

| Campo | Componente | Obrigatório | Ícone | Placeholder | Validação |
|---|---|---|---|---|---|
| Nome do Grupo | `Input` | sim (\*) | `Users` | "Ex: Equipe de Vendas" | Não pode ser vazio |
| Descrição | `Textarea` (2 rows) | não | `FileText` | "Descrição do grupo (opcional)" | — |
| Foto do Grupo | `Input` + `Button` upload | não | `ImageIcon` | "https://exemplo.com/foto.jpg (opcional)" | Máx 5MB para upload |
| Participantes | `Textarea` (8 rows) | sim (\*) | `Plus` | "5511999999999\n5521988888888" | Mín 1 número com 10+ dígitos |

### Lógica de upload de foto

1. Botão `Upload` abre file input hidden (`accept="image/*"`)
2. Valida tamanho ≤ 5MB
3. Envia via `supabase.functions.invoke("upload-command-image", { body: FormData })`
4. Retorna `data.url` que preenche o campo
5. Preview 16x16 com `object-cover`
6. Botão `X` para remover foto

### Comando gerado

```
#criargrupo NomeDoGrupo|Descrição|URLFoto|5511999999999|5521988888888
```

- Descrição vazia → `"Sem descrição"`
- Foto vazia → `"sem_foto"`
- Números: limpos com `replace(/\D/g, "")`, filtrados por `length >= 10`

### Chamada à Edge Function

```typescript
supabase.functions.invoke("group-commands", {
  body: { instanceId: instance.id, messageText }
});
```

---

## 6. Detalhes do Grupo (`GroupDetailDialog`)

### Interface de participante

```typescript
interface ParticipantInfo {
  id: string;          // JID do participante
  phone: string;       // Número limpo
  lid?: string;        // ID alternativo (@lid)
  name?: string;       // Nome do contato (push name)
  isAdmin: boolean;    // É admin do grupo
  isSuperAdmin: boolean; // É dono do grupo
}
```

### Dados carregados

| Campo | Origem | Descrição |
|---|---|---|
| `participants` | `data.participants` | Lista de participantes |
| `groupDescription` | `data.groupDescription` | Descrição do grupo |
| `participantCount` | `data.participantCount` | Total de membros |
| `isAnnounce` | `data.isAnnounce` | Somente admins enviam mensagens |
| `isLocked` | `data.isLocked` | Somente admins editam info |
| `groupProfilePic` | `data.profilePicUrl` | Foto do grupo |
| `currentGroupName` | `data.groupName` | Nome atualizado |

### Ações administrativas (apenas se instância é admin/dono)

| Ação | Comando UAZAPI | Descrição |
|---|---|---|
| Adicionar membro | `#addnogrupo groupJid\|phone` | Input de telefone |
| Importar CSV | Upload `.csv` com coluna de telefones | Adiciona em lote |
| Remover membro | `#removerdogrupo groupJid\|phone` | Com confirmação AlertDialog |
| Promover a admin | `#promoveradmin groupJid\|phone` | Ícone `ArrowUp` |
| Revogar admin | `#revogaradmin groupJid\|phone` | Ícone `ArrowDown` |
| Somente admin msg | `#somenteadminmsg groupJid` | Switch toggle |
| Liberar mensagens | `#msgliberada groupJid` | Switch toggle |
| Somente admin edit | `#somenteadminedit groupJid` | Switch toggle |
| Liberar edição | `#editliberado groupJid` | Switch toggle |
| Alterar nome | `#attnomegrupo groupJid\|novoNome` | Input editável |
| Alterar descrição | `#attdescricao groupJid\|novaDesc` | Input editável |
| Alterar foto | Upload → `#attfotogrupo groupJid\|url` | File input |
| Copiar link convite | `#linkgrupo groupJid` | Botão no header |
| Resetar link | `#resetarlink groupJid` (POST /group/revokeInviteLink) | Botão no header |
| Sair do grupo | `#sairgrupo groupJid` | Com confirmação, callback `onGroupLeft` |

### Badges de cargo

| Cargo | Cor | Variante |
|---|---|---|
| Dono | `amber-500/10 text-amber-500 border-amber-500/30` | outline |
| Admin | `primary/10 text-primary border-primary/30` | outline |
| Membro | (sem badge) | — |

### Envio de mensagem para grupo

| Campo | Componente | Descrição |
|---|---|---|
| Mensagem | `Textarea` | Texto da mensagem |
| @Todos | `Switch` | Mencionar todos os participantes |
| Agendar | `Switch` | Habilita campos de data/hora |
| Data | `Input type="date"` | Data do agendamento |
| Hora | `Input type="time"` | Hora do agendamento |
| Mídia | File upload ou URL | Tipos: image, video, audio, document |
| Recorrência | Dialog avançado | daily/weekly/monthly com weekdays, end date, max execuções |

### Comando de envio

```
#enviargrupo groupJid|mensagem texto|@todos
```

Se agendado, salva na tabela `scheduled_group_messages` via Supabase.

---

## 7. Mensagens Programadas (`ScheduledMessagesDialog`)

### Interface `ScheduledMessage`

```typescript
interface ScheduledMessage {
  id: string;
  group_name: string;
  group_jid: string;
  message_text: string;
  scheduled_for: string;      // ISO datetime
  is_recurring: boolean;
  recurring_interval?: string; // "daily" | "weekly" | "monthly"
  status: string;             // "pending" | "sent" | "failed" | "cancelled"
  mention_all: boolean;
  created_at: string;
  media_url?: string;
  media_type?: string;
  sent_at?: string;
  execution_count?: number;
}
```

### Tabela `scheduled_group_messages`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | ID único |
| `instance_id` | uuid (FK) | Instância vinculada |
| `user_id` | uuid | Dono |
| `group_jid` | text | JID do grupo |
| `group_name` | text | Nome do grupo |
| `message_text` | text | Texto da mensagem |
| `scheduled_for` | timestamptz | Data/hora do envio |
| `is_recurring` | boolean | Se é recorrente |
| `recurring_interval` | text | `daily`, `weekly`, `monthly` |
| `send_time` | text | Hora do envio recorrente (HH:MM) |
| `weekdays` | int[] | Dias da semana (0=Dom, 1=Seg...) |
| `day_of_month` | int | Dia do mês para mensal |
| `end_date` | timestamptz | Data final da recorrência |
| `max_executions` | int | Máx de execuções |
| `execution_count` | int | Contador de execuções |
| `mention_all` | boolean | Mencionar todos |
| `media_url` | text | URL da mídia |
| `media_type` | text | `image`, `video`, `audio`, `document` |
| `status` | text | `pending`, `sent`, `failed`, `cancelled` |
| `sent_at` | timestamptz | Timestamp do último envio |
| `last_error` | text | Último erro registrado |

---

## 8. Resolução de URL Base (Hierarquia)

A URL base da UAZAPI é resolvida na seguinte ordem de prioridade:

```
1. instance.uazapi_base_url    (override por instância)
2. user_settings.uazapi_base_url (configuração global do usuário)
3. shared_from_user_id → user_settings (herança de usuário compartilhado)
4. rpc("get_effective_user_id") → user_settings (resolução avançada)
5. Admin fallback (para listagem de grupos)
```

---

## 9. Edge Functions Relacionadas

| Função | Método | Corpo (body) | Retorno |
|---|---|---|---|
| `list-groups` | POST | `{ instanceId, groupjid? }` | `{ groups: GroupInfo[] }` ou `{ participants, groupDescription, isAnnounce, isLocked, profilePicUrl }` |
| `group-commands` | POST | `{ instanceId, messageText, scheduledFor? }` | `{ isCommand, success, message, data? }` |
| `configure-webhook` | POST | `{ instance_id, webhook_events, create_new, webhook_url_override?, enabled, webhook_id?, exclude_messages? }` | `{ success, webhook_url }` |
| `list-webhooks` | POST | `{ instance_id }` | `{ webhooks: UazapiWebhook[] }` |
| `delete-webhook` | POST | `{ instance_id, webhook_id }` | `{ success }` |
| `upload-command-image` | POST | `FormData (file)` | `{ url }` |
| `get-instances` | POST | `{ locationId, contactId?, phone? }` | `{ instances, activeInstanceId }` |
| `uazapi-proxy-embed` | POST | `{ embedToken, instanceId, action, ...extras }` | Varia por action |

### Actions do `uazapi-proxy-embed`

| Action | Campos extras | Retorno |
|---|---|---|
| `status` | — | `{ ok, status, data }` |
| `connect` | — | `{ ok, data }` |
| `qrcode` | — | `{ ok, data }` (base64 QR) |
| `disconnect` | — | `{ ok }` |
| `ghl-users` | `locationId` | `{ users: SafeUser[] }` |
| `get-info` | — | `{ token, baseUrl }` |
| `get-track-id` | — | `{ trackId }` |
| `uazapi-passthrough` | `path, method?, payload?` | `{ ok, status, data }` |

---

## 10. Padrões de Resiliência

### Fetch com timeout e retry

```typescript
// Timeout: 15s por tentativa
// Retries: até 3 tentativas
// Retry em: 502, 503, 504, AbortError (timeout)
// Intervalo entre retries: 1.5s-2s

async function resilientFetch(url, init, { timeoutMs = 15000, maxRetries = 2 }) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if ([502, 503, 504].includes(res.status)) { /* retry */ continue; }
      return res;
    } catch (e) {
      if (e.name === "AbortError") { /* retry */ continue; }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
```

### Multi-endpoint fallback

Para cada ação na UAZAPI, o sistema tenta múltiplos caminhos:

```typescript
// Exemplo: status
const paths = [
  "/instance/status",
  "/api/instance/status",
  "/v2/instance/status",
  "/api/v2/instance/status"
];

// Exemplo: QR code
const paths = [
  "/instance/qrcode",
  "/instance/qr",
  "/qrcode",
  "/api/instance/qrcode",
  "/api/instance/qr",
  "/v2/instance/qrcode",
  "/api/v2/instance/qrcode"
];
```

---

## 11. Componentes UI Utilizados (shadcn/ui)

| Componente | Uso principal |
|---|---|
| `Dialog` / `Drawer` | Modais (Dialog desktop, Drawer mobile via `useIsMobile()`) |
| `Card` / `CardContent` | Cards de instância e grupo |
| `Avatar` / `AvatarImage` / `AvatarFallback` | Fotos de perfil e grupo |
| `Badge` | Status, cargos, API oficial |
| `Button` | Ações com variantes (outline, ghost, destructive, gradientes) |
| `Input` / `Textarea` | Campos de formulário |
| `Switch` / `Label` | Toggles (ignorar grupos, agendamento, @todos) |
| `DropdownMenu` | Menu de ações do card |
| `AlertDialog` | Confirmações destrutivas |
| `Select` | Seleção de usuário GHL |
| `Tabs` | Abas de navegação |
| `ScrollArea` | Listas com scroll |
| `Tooltip` | Dicas de campos |

### Responsividade

- `useIsMobile()` detecta tela mobile
- Mobile: usa `Drawer` (bottom sheet) em vez de `Dialog`
- Grid de grupos: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Card de instância: `max-w-[350px] min-h-[340px]`
