# 🏗️ Bridge — Arquitetura de Gerenciamento de Grupos, Webhooks e Disparo em Massa

> Documentação técnica com prompt e códigos reais de produção para replicar o sistema.

---

## 📋 Stack & Contexto

- **Frontend**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (Auth, Postgres, Edge Functions, Realtime)
- **WhatsApp API**: UAZAPI (multi-versão, endpoints variáveis)
- **Autenticação UAZAPI**: Header `token: <instance_token>` (per-instance) ou `admintoken: <admin_token>` (admin)

---

## 1️⃣ Gerenciamento de Grupos WhatsApp

### 1.1 Listagem de Grupos — Edge Function `list-groups`

**Entrada**: `{ instanceId, locationId?, groupjid? }`

**Resolução de Base URL** (hierarquia):
1. `instance.uazapi_base_url`
2. `user_settings.uazapi_base_url`
3. `shared_from_user_id` → settings do dono
4. `get_effective_user_id` RPC
5. Instâncias irmãs (mesmo subaccount)
6. Admin fallback

```typescript
// Resolução de base URL por usuário
async function resolveBaseUrlForUser(supabase: any, userId: string): Promise<string | null> {
  const { data: settings } = await supabase
    .from("user_settings")
    .select("uazapi_base_url, shared_from_user_id")
    .eq("user_id", userId)
    .limit(1);

  const url = settings?.[0]?.uazapi_base_url?.replace(/\/+$/, "");
  if (url) return url;

  // Shared from
  if (settings?.[0]?.shared_from_user_id) {
    const { data: sharedSettings } = await supabase
      .from("user_settings")
      .select("uazapi_base_url")
      .eq("user_id", settings[0].shared_from_user_id)
      .limit(1);
    const sharedUrl = sharedSettings?.[0]?.uazapi_base_url?.replace(/\/+$/, "");
    if (sharedUrl) return sharedUrl;
  }

  // Effective user
  const { data: effectiveId } = await supabase.rpc("get_effective_user_id", { p_user_id: userId });
  if (effectiveId && effectiveId !== userId) {
    const { data: effectiveSettings } = await supabase
      .from("user_settings")
      .select("uazapi_base_url")
      .eq("user_id", effectiveId)
      .limit(1);
    return effectiveSettings?.[0]?.uazapi_base_url?.replace(/\/+$/, "") || null;
  }
  return null;
}
```

**Listagem com Retry + Timeout (15s por tentativa, max 3)**:

```typescript
const MAX_RETRIES = 2;
const TIMEOUT_MS = 15000;
let response: Response | null = null;

for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
  const groupsUrl = attempt === 0
    ? `${baseUrl}/group/list?force=true&refresh=true`  // 1ª tentativa: cache-bust
    : `${baseUrl}/group/list`;                          // Retries: sem force (mais rápido)

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(groupsUrl, {
      method: "GET",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "token": instanceToken },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) { response = res; break; }

    if ([502, 503, 504].includes(res.status) && attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
  } catch (e: any) {
    if (e.name === "AbortError" && attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 1500));
      continue;
    }
  }
}

if (!response) {
  return { error: "Servidor UAZAPI não respondeu", timeout: true };
}
```

**Normalização de Resposta** (variações entre versões UAZAPI):

```typescript
// Handles: direct array, { data: [...] }, { groups: [...] }, etc.
let groupsList: any[] = [];
if (Array.isArray(groupsData)) {
  groupsList = groupsData;
} else if (groupsData && typeof groupsData === "object") {
  groupsList = groupsData.data || groupsData.groups || groupsData.Groups ||
               groupsData.result || groupsData.Results || groupsData.items || [];
}

const groups: GroupInfo[] = groupsList.map(group => ({
  id: group.id || group.jid || group.JID || group.groupId || "",
  name: group.subject || group.Subject || group.name || group.Name || group.Topic || `Grupo ${id.split("@")[0].slice(-6)}`,
  memberCount: group.size || group.Size || group.ParticipantCount || group.participants?.length,
  isAdmin: group.isAdmin || group.IsAdmin,
  profilePicUrl: group.profilePicUrl || group.ProfilePicUrl || group.picture || "",
}));
```

### 1.2 Info do Grupo (Participantes) — Multi-endpoint

```typescript
async function tryGroupInfoOnServer(serverUrl: string, token: string, gid: string) {
  const endpoints = [
    { url: `${serverUrl}/group/info`, method: "POST", body: { groupjid: gid, getInviteLink: false, getRequestsParticipants: true, force: true } },
    { url: `${serverUrl}/group/info`, method: "POST", body: { jid: gid, getInviteLink: false, force: true } },
    { url: `${serverUrl}/group/${encodeURIComponent(gid)}`, method: "GET", body: null },
    { url: `${serverUrl}/group/metadata/${encodeURIComponent(gid)}`, method: "GET", body: null },
  ];
  // Itera até encontrar resposta com participants/Participants/members
}
```

**Normalização de Participantes**:

```typescript
const participants = rawParticipants.map((p: any) => {
  const jid = p.id || p.JID || p.jid || p.participant || "";
  const phoneNumberField = p.PhoneNumber || p.phoneNumber || p.phone || p.Phone || "";
  const phone = phoneNumberField ? phoneNumberField.split("@")[0] : (jid.includes("@lid") ? "" : jid.split("@")[0]);
  const lid = (p.LID || p.lid || (jid.includes("@lid") ? jid : "")).split("@")[0];
  const name = p.DisplayName || p.displayName || p.notify || p.PushName || p.name || "";
  return {
    id: jid,
    phone: phone || lid,
    lid,
    name,
    isAdmin: p.IsAdmin === true || p.isAdmin === true || p.admin === "admin",
    isSuperAdmin: p.IsSuperAdmin === true || p.isSuperAdmin === true || p.admin === "superadmin",
  };
});
```

**Auto-discovery de Nomes** (3 estratégias):
1. **Batch**: `GET /chat/getcontacts` — busca todos os contatos de uma vez
2. **Individual**: `GET /user/info/{jid}` ou `POST /contact/info` — para os que não vieram no batch
3. **Campos priorizados**: `contact_name > PushName > pushName > notify > DisplayName > name`

### 1.3 Comandos de Grupo — Edge Function `group-commands`

**Parsing de Comando**:

```typescript
// Formato: #comando param1|param2|param3
function parseCommand(text: string): { command: string; params: string[] } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("#")) return null;
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) {
    const parts = trimmed.split(" ");
    return { command: parts[0].toLowerCase(), params: parts.slice(1) };
  }
  const command = trimmed.substring(0, firstSpace).toLowerCase();
  const paramsStr = trimmed.substring(firstSpace + 1);
  return { command, params: paramsStr.split("|").map(p => p.trim()) };
}
```

**Helper resiliente (POST → PUT fallback)**:

```typescript
async function postJson(url: string, instanceToken: string, body: Record<string, unknown>) {
  for (const method of ["POST", "PUT"] as const) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) return { ok: true, status: res.status, text };
  }
  return { ok: false, status: 0, text: "" };
}
```

**Tabela de Comandos Disponíveis**:

| Comando | Parâmetros | Endpoint UAZAPI |
|---------|-----------|-----------------|
| `#criargrupo` | `nome\|descrição\|fotoUrl\|telefones` | `POST /group/create` + `updateSubject` + `updateDescription` + `updatePicture` |
| `#removerdogrupo` | `grupo\|telefone` | `POST /group/updateParticipants` `{action:"remove"}` |
| `#addnogrupo` | `grupo\|telefone` | `POST /group/updateParticipants` `{action:"add"}` |
| `#promoveradmin` | `grupo\|telefone` | `POST /group/updateParticipants` `{action:"promote"}` |
| `#revogaradmin` | `grupo\|telefone` | `POST /group/updateParticipants` `{action:"demote"}` |
| `#attfotogrupo` | `grupo\|url` | Multi-endpoint: `/group/updateImage`, `/group/updatePicture` |
| `#attnomegrupo` | `nomeAtual\|novoNome` | Multi-endpoint: `/group/updateName`, `/group/updateSubject` |
| `#attdescricao` | `grupo\|descrição` | Multi-endpoint POST/PUT: `/group/updateDescription` |
| `#somenteadminmsg` | `grupo` | `POST /group/updateAnnounce` `{announce:true}` |
| `#msgliberada` | `grupo` | `POST /group/updateAnnounce` `{announce:false}` |
| `#somenteadminedit` | `grupo` | `POST /group/updateLocked` `{locked:true}` |
| `#editliberado` | `grupo` | `POST /group/updateLocked` `{locked:false}` |
| `#linkgrupo` | `grupo\|telefone` | `POST /group/info` `{getInviteLink:true}` → `POST /group/invitelink` |
| `#sairgrupo` | `groupJid` | `POST /group/leave` |
| `#enviargrupo` | `groupJid\|mensagem` | `POST /send/text` `{number:groupJid}` |

**Criação de Grupo (fluxo completo)**:

```typescript
async function createGroup(baseUrl, token, name, description, photoUrl, participants, instanceName?) {
  // 1. Cria grupo com participantes
  const createRes = await fetch(`${baseUrl}/group/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({
      subject: name,
      participants: participants.map(p => p.replace(/\D/g, "")),  // Só dígitos, SEM @s.whatsapp.net
    }),
  });
  const data = await createRes.json();
  const groupJid = data.group?.JID || data.id || data.jid || data.groupId;

  await sleep(650);

  // 2. Atualiza nome (best-effort multi-endpoint)
  await updateGroupSubjectBestEffort(baseUrl, token, groupJid, name, instanceName);
  await sleep(250);

  // 3. Atualiza descrição
  if (description) {
    await fetch(`${baseUrl}/group/updateDescription`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ groupJid, description }),
    });
  }

  // 4. Atualiza foto
  if (photoUrl) {
    await updateGroupPictureBestEffort(baseUrl, token, groupJid, photoUrl, instanceName);
  }
}
```

**Link de Convite (3 estratégias)**:

```typescript
// Prioridade 1: POST /group/info com getInviteLink: true
const infoResp = await fetch(`${baseUrl}/group/info`, {
  method: "POST",
  headers: { "Content-Type": "application/json", token },
  body: JSON.stringify({ groupjid: groupId, getInviteLink: true, force: false }),
});
// Extrai de data.groupInfo.inviteLink || data.inviteLink || data.code

// Prioridade 2: POST /group/invitelink
// Tenta: { groupjid }, { jid }

// Prioridade 3: GET /group/invitelink/{jid} (legacy)
```

**Envio ao Grupo com suporte a @todos e agendamento**:

```typescript
case "#enviargrupo": {
  const groupJid = targetGroup.includes("@g.us") ? targetGroup : `${targetGroup}@g.us`;
  const isMentionAll = messageText.startsWith("@todos\n") || messageText.startsWith("@todos ");
  const cleanText = isMentionAll ? messageText.replace(/^@todos[\n ]?/, "").trim() : messageText;

  const sendBody: Record<string, unknown> = { number: groupJid, text: cleanText };
  if (isMentionAll) sendBody.mentions = "all";

  // Suporte a agendamento
  if (scheduledFor) {
    const delaySeconds = Math.max(0, Math.floor((new Date(scheduledFor).getTime() - Date.now()) / 1000));
    sendBody.scheduled_for = scheduledFor;
    sendBody.Delay = delaySeconds;  // Ambos os campos para compatibilidade
    sendBody.delay = delaySeconds;
  }

  await fetch(`${baseUrl}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(sendBody),
  });
}
```

---

## 2️⃣ Configuração de Webhooks

### 2.1 Configurar Webhook — Edge Function `configure-webhook`

**Hierarquia de URL de Webhook**:
1. `webhook_url_override` (parâmetro da requisição)
2. `instance.webhook_url` (salva no banco)
3. `user_settings.global_webhook_url`
4. `https://webhooks.bridgeapi.chat/webhook-inbound` (padrão)

**Resolução de Base URL**:
```typescript
const baseUrl = (instance.uazapi_base_url || settings?.uazapi_base_url || "").replace(/\/$/, "");
const webhookUrl = webhook_url_override || instance.webhook_url || settings?.global_webhook_url || "https://webhooks.bridgeapi.chat/webhook-inbound";
```

**Atualização de Webhook Existente (por ID)**:

```typescript
if (webhook_id && !create_new) {
  const updatePayload = {
    id: webhook_id,
    url: webhookUrl,
    enabled: enabledFlag,
    events,
    action: "update",
    ...(excludeMessagesValue ? { excludeMessages: excludeMessagesValue } : {}),
  };

  // Tenta POST /webhook (principal)
  let res = await fetch(`${baseUrl}/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Token": token, "token": token },
    body: JSON.stringify(updatePayload),
  });
  if (res.ok) return { success: true };

  // Fallback: PUT /webhook
  res = await fetch(`${baseUrl}/webhook`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Token": token, "token": token },
    body: JSON.stringify(updatePayload),
  });
}
```

**Criação de Novo Webhook (multi-endpoint)**:

```typescript
// Para create_new = true, usa endpoints de "add"
const attempts = create_new ? [
  { path: "/webhook/add", method: "POST", payload: { url, enabled, events } },
  { path: "/webhooks", method: "POST", payload: { url, enabled, events } },
  { path: "/webhook", method: "POST", payload: { url, enabled, events, action: "add" } },
  { path: "/instance/webhook", method: "POST", payload: { url, enabled, ignore_groups, events } },
] : [
  // Para update/set, tenta múltiplos endpoints e métodos
  { path: "/webhook", method: "POST", payload: { url, enabled, events } },
  { path: "/webhook", method: "PUT", payload: { url, enabled, events } },
  { path: "/instance/webhook", method: "PUT", payload: { url, enabled, ignore_groups, events } },
  { path: "/instance/webhook", method: "POST", payload: { url, enabled, ignore_groups, events } },
  { path: "/instance/settings", method: "PUT", payload: { webhook_url: url, enabled, ignore_groups, events } },
  { path: "/webhook/set", method: "PUT", payload: { webhook_url: url, enabled, events } },
  // + variações de header (Token vs token) e campo (url vs webhookURL vs webhook)
];
```

**Validação de Sucesso**:

```typescript
function webhookActuallySet(resText: string, targetUrl: string): boolean {
  const parsed = JSON.parse(resText);
  if (Array.isArray(parsed)) {
    return parsed.some((w: any) => w.url === targetUrl || w.webhookURL === targetUrl);
  }
  if (parsed.url === targetUrl || parsed.webhookURL === targetUrl) return true;
  if (parsed.success === true || parsed.status === "ok") return true;
  if (parsed.enabled === false && !parsed.url) return false;
  return true;
}
```

**Post-Config: Persistir `excludeMessages`**:

```typescript
// Após configurar, busca o webhook recém-criado e aplica excludeMessages via PATCH
if (excludeMessagesValue?.length > 0) {
  const listRes = await fetch(`${baseUrl}/webhook`, { method: "GET", headers: { "Token": token } });
  const webhookList = JSON.parse(await listRes.text());
  
  // Usa ÚLTIMO match por URL (mais novo) quando create_new, primeiro caso contrário
  const matchingWebhooks = webhookList.filter((w: any) => w.url === webhookUrl);
  const targetWh = webhook_id
    ? webhookList.find((w: any) => w.id === webhook_id)
    : matchingWebhooks[matchingWebhooks.length - 1];

  if (targetWh?.id) {
    const patchPayload = { id: targetWh.id, url: targetWh.url, enabled: targetWh.enabled, events: targetWh.events, excludeMessages: excludeMessagesValue };
    // Tenta PUT, fallback POST com action:"update"
    await fetch(`${baseUrl}/webhook`, { method: "PUT", headers: { "Token": token }, body: JSON.stringify(patchPayload) });
  }
}
```

### 2.2 Listar Webhooks — Edge Function `list-webhooks`

```typescript
const listAttempts = [
  { path: "/webhook", method: "GET", headers: { "Token": token } },
  { path: "/webhook", method: "GET", headers: { "token": token } },
  { path: "/webhooks", method: "GET", headers: { "Token": token } },
  { path: "/instance/webhook", method: "GET", headers: { "token": token } },
  { path: "/instance/settings", method: "GET", headers: { "token": token } },
];

// Normalização: suporta array direto, { webhooks: [...] }, { url: "..." } (single)
const normalized = webhooks.map((w, idx) => ({
  id: w.id || w._id || `webhook-${idx}`,
  url: w.url || w.webhookURL || w.webhook_url || "",
  enabled: w.enabled !== false,
  events: w.events || w.listen_events || [],
  excludeMessages: w.excludeMessages || w.exclude_messages || "",
})).filter(w => w.url.trim() !== "");  // Filtra webhooks "órfãos"
```

### 2.3 Deletar Webhook — Edge Function `delete-webhook`

```typescript
const deleteAttempts = [
  // 1. POST action "delete"
  { path: "/webhook", method: "POST", payload: { action: "delete", id: webhook_id } },
  // 2. POST action "remove"
  { path: "/webhook", method: "POST", payload: { action: "remove", id: webhook_id } },
  // 3. DELETE HTTP method
  { path: `/webhook/${webhook_id}`, method: "DELETE", payload: null },
  { path: "/webhook", method: "DELETE", payload: { id: webhook_id } },
  // 4. Fallback: limpar URL (desativa sem remover)
  { path: "/webhook", method: "POST", payload: { action: "update", id: webhook_id, url: "", enabled: false } },
];

// Verificação: após cada tentativa, checa se webhook_id ainda aparece na lista
// trueDelete = true quando webhook sumiu da lista
```

### 2.4 Eventos de Webhook Suportados

```
messages, messages_update, chats, connection, qrcode, history,
call, contacts, presence, groups, labels, chat_labels, blocks, leads, sender
```

**Exclude Messages** (filtros de exclusão mútua):
- `wasSentByApi` ↔ `wasNotSentByApi`
- Suporta formato array `["wasSentByApi"]` ou string `"wasSentByApi"`

---

## 3️⃣ Disparo em Massa (Bulk Messaging)

### 3.1 Arquitetura do Frontend — `ManageMessagesDialog`

**Três abas**: Simples, Avançado, Campanhas

**Tipos de Mensagem Suportados**:
```typescript
const MESSAGE_TYPES = [
  "text", "image", "video", "audio", "ptt" (áudio gravado),
  "sticker", "document", "contact", "location",
  "list", "button", "poll", "carousel"
];
```

### 3.2 Modo Simples — `/sender/simple`

```typescript
const body = {
  numbers: ["5511999...@s.whatsapp.net", ...],
  type: "text",
  text: "Mensagem aqui",
  folder: "Nome da Campanha",
  delayMin: 10,   // Segundos mínimo entre msgs
  delayMax: 30,   // Segundos máximo entre msgs
  scheduled_for: timestamp || 0,  // 0 = envio imediato
  // Opcionais:
  file: "https://...",      // URL de mídia
  docName: "arquivo.pdf",   // Nome do documento
  linkPreview: true,        // Preview de link
};
await fetch(`${baseUrl}/sender/simple`, {
  method: "POST",
  headers: { "Content-Type": "application/json", token },
  body: JSON.stringify(body),
});
```

### 3.3 Modo Avançado — `/sender/advanced`

```typescript
const body = {
  delayMin: 3,
  delayMax: 6,
  info: "Nome da campanha",
  scheduled_for: timestamp || 1,  // 1 = início manual
  messages: [
    { number: "5511999...", type: "text", text: "Olá João!" },
    { number: "5511888...", type: "image", file: "https://...", text: "Caption" },
    { number: "5511777...", type: "button", text: "Msg", footerText: "Footer", buttonText: "Title", choices: ["Opção 1", "Opção 2"] },
  ],
};
await fetch(`${baseUrl}/sender/advanced`, { method: "POST", headers, body: JSON.stringify(body) });
```

### 3.4 Importação de Contatos

**CSV Parser** (auto-detecta separador e colunas):

```typescript
function parseCsv(content: string): CsvContact[] {
  const headerLine = lines[0].toLowerCase();
  const sep = headerLine.includes(";") ? ";" : ",";
  const headers = headerLine.split(sep).map(h => h.trim());

  // Auto-detecta colunas por nome
  const phoneIdx = headers.findIndex(h => /^(phone|telefone|numero|whatsapp|cel)$/.test(h));
  const firstNameIdx = headers.findIndex(h => /^(first_?name|primeiro_?nome|nome)$/.test(h));
  const lastNameIdx = headers.findIndex(h => /^(last_?name|sobrenome)$/.test(h));
}
```

**Inline Format** (sem CSV):
```
5511999999999, João Silva
5511888888888, Maria Santos
5511777777777
```

### 3.5 Campos Dinâmicos (Personalização)

```typescript
const DYNAMIC_FIELDS = [
  { tag: "{{primeiro_nome}}", label: "Primeiro Nome" },
  { tag: "{{sobrenome}}", label: "Sobrenome" },
  { tag: "{{nome}}", label: "Nome Completo" },
  { tag: "{{telefone}}", label: "Telefone" },
];

function replaceDynamicFields(text: string, contact: CsvContact): string {
  let result = text;
  const firstName = contact.firstName || contact.fullName?.split(" ")[0] || "";
  const lastName = contact.lastName || contact.fullName?.split(" ").slice(1).join(" ") || "";
  const fullName = contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  result = result.replace(/\{\{primeiro_nome\}\}/gi, firstName);
  result = result.replace(/\{\{nome\}\}/gi, fullName);
  result = result.replace(/\{\{sobrenome\}\}/gi, lastName);
  result = result.replace(/\{\{telefone\}\}/gi, contact.phone);
  return result;
}
```

### 3.6 Anti-Ban

```typescript
function applyAntiBan(text: string, addInvisibleChars: boolean, addRandomSpacing: boolean): string {
  let result = text;
  if (addInvisibleChars) {
    // Caracteres zero-width em posições aleatórias para tornar cada mensagem única
    const chars = ["\u200B", "\u200C", "\u200D", "\uFEFF"];
    const words = result.split(" ");
    result = words.map(w => {
      if (Math.random() > 0.6) return w + chars[Math.floor(Math.random() * chars.length)];
      return w;
    }).join(" ");
  }
  if (addRandomSpacing) {
    if (Math.random() > 0.5) result = result + " ";
    if (Math.random() > 0.7) result = "\n" + result;
  }
  return result;
}
```

**Botão Anti-Ban**: Mensagem tipo `button` enviada após a mensagem principal, perguntando se quer continuar recebendo.

### 3.7 Divisão de Mensagens (Triple Line Break)

```typescript
function splitMessageByTripleBreak(text: string): string[] {
  const parts = text.split(/\n\s*\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [text];
}
```

**Intercalamento por Contato**: Todas as partes de um contato são enviadas sequencialmente antes do próximo contato:
```
contato1-parte1 → contato1-parte2 → contato1-parte3 → contato2-parte1 → contato2-parte2 → ...
```

### 3.8 Round-Robin Multi-Instância

```typescript
const getRoundRobinInstances = (): Instance[] => {
  if (!useRoundRobin || selectedInstanceIds.length === 0) return [instance];
  const selected = siblingInstances.filter(i => selectedInstanceIds.includes(i.id));
  return [instance, ...selected];
};

// Distribuição: contatos são alternados entre instâncias
const buckets: string[][] = instances.map(() => []);
numberList.forEach((num, idx) => { buckets[idx % instances.length].push(num); });

// Cada instância recebe seu bucket e envia independentemente
await Promise.allSettled(
  instances.map((inst, idx) => {
    if (buckets[idx].length === 0) return Promise.resolve();
    return fetchForInstance(inst, "/sender/simple", "POST", { ...body, numbers: buckets[idx] });
  })
);
```

### 3.9 Round-Robin com Split (Distribuição Interleaved)

Para split + round-robin, contatos com TODAS suas partes são distribuídos juntos:

```typescript
// Cada "contacto" inclui todas as suas partes
const perContactParts = messages.map(msg => {
  const parts = splitMessageByTripleBreak(msg.text);
  return parts.map((part, i) => ({
    ...msg, text: part,
    ...(i > 0 ? { splitPart: true } : {}),
  }));
});

// Round-robin por contato (não por parte)
const buckets = instances.map(() => []);
perContactParts.forEach((contact, idx) => {
  buckets[idx % instances.length].push(...contact);
});
```

### 3.10 Proxy para Embed (iframe GHL)

```typescript
// No contexto embed, chamadas vão via proxy Edge Function
const proxyFetch = async (path: string, method: string, payload?: any) => {
  if (!embedToken) {
    // Chamada direta
    return fetch(`${baseUrl}${path}`, { method, headers: { token }, body: JSON.stringify(payload) });
  }
  // Via proxy
  return fetch(`${supabaseUrl}/functions/v1/uazapi-proxy-embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embedToken, instanceId: instance.id, action: "uazapi-passthrough", path, method, payload }),
  });
};
```

### 3.11 Gerenciamento de Campanhas

```typescript
// Listar campanhas
await proxyFetch("/sender/listfolders", "GET");

// Listar mensagens de uma campanha
await proxyFetch("/sender/listmessages", "POST", { folder_id, page, pageSize });

// Controlar campanha
await proxyFetch("/sender/edit", "POST", { folder_id, action: "stop" | "continue" | "delete" });

// Limpar mensagens enviadas (por idade)
await proxyFetch("/sender/cleardone", "POST", { hours: 168 });

// Limpar toda a fila
await proxyFetch("/sender/clearall", "DELETE");
```

**Campanhas Continuação (waves)**:

Quando split messages é usado, cada parte gera uma campanha separada:
- Parte 1: info = `"Nome da Campanha 🔗abc123"`
- Parte 2: info = `"Nome da Campanha ⏩abc123#2"`
- Parte 3: info = `"Nome da Campanha ⏩abc123#3"`

No histórico, mensagens de continuação são mescladas com a campanha principal por contato.

### 3.12 Track ID (Anti-Loop)

```typescript
// Injeta track_id nos payloads de sender para que o webhook-inbound reconheça
const enrichedPayload = path.startsWith("/sender/")
  ? { ...payload, track_id: effectiveTrackId }
  : payload;
```

---

## 4️⃣ Mensagens Agendadas para Grupos

### 4.1 Tabela `scheduled_group_messages`

```sql
CREATE TABLE scheduled_group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  instance_id uuid NOT NULL REFERENCES instances(id),
  group_jid text NOT NULL,
  group_name text DEFAULT '',
  message_text text NOT NULL,
  media_url text,
  media_type text,
  mention_all boolean DEFAULT false,
  scheduled_for timestamptz NOT NULL,
  is_recurring boolean DEFAULT false,
  recurring_interval text,     -- 'daily', 'weekly', 'monthly'
  weekdays integer[],          -- [0-6] para recorrência semanal
  day_of_month integer,        -- Para recorrência mensal
  send_time text,              -- "HH:mm"
  end_date timestamptz,
  max_executions integer,
  execution_count integer DEFAULT 0,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  last_error text
);
```

### 4.2 Processamento — Edge Function `process-scheduled-messages`

```typescript
// Busca mensagens pendentes com scheduled_for <= now
const { data: messages } = await supabase
  .from("scheduled_group_messages")
  .select("*, instances(uazapi_instance_token, uazapi_base_url, user_id)")
  .eq("status", "pending")
  .lte("scheduled_for", new Date().toISOString())
  .limit(50);

// Processa em batches de 5
for (const batch of chunks(messages, 5)) {
  await Promise.allSettled(batch.map(async (msg) => {
    const baseUrl = msg.instances.uazapi_base_url || userSettings.uazapi_base_url;
    const token = msg.instances.uazapi_instance_token;

    // Envia texto + mídia simultaneamente nos campos caption e text
    const sendBody = {
      number: msg.group_jid,
      text: msg.message_text,
      caption: msg.message_text,  // Redundância para compatibilidade
    };
    if (msg.mention_all) sendBody.mentions = "all";

    await fetch(`${baseUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify(sendBody),
    });

    // Para recorrentes: calcula próximo scheduled_for e mantém status "pending"
    if (msg.is_recurring) {
      const nextDate = calculateNextSchedule(msg);
      await supabase.from("scheduled_group_messages").update({
        scheduled_for: nextDate,
        execution_count: msg.execution_count + 1,
        sent_at: new Date().toISOString(),
      }).eq("id", msg.id);
    } else {
      await supabase.from("scheduled_group_messages").update({
        status: "sent",
        sent_at: new Date().toISOString(),
      }).eq("id", msg.id);
    }
  }));
}
```

---

## 5️⃣ Padrões de Resiliência

### 5.1 Fetch Resiliente (Frontend)

```typescript
async function resilientFetch(url: string, init: RequestInit, opts = { timeoutMs: 15000, maxRetries: 2 }) {
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);
      if ([502, 503, 504].includes(res.status) && attempt < opts.maxRetries) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return res;
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError" && attempt < opts.maxRetries) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      throw e;
    }
  }
}
```

### 5.2 Multi-Endpoint com Fallback

Padrão usado em TODAS as integrações UAZAPI:
1. Tenta endpoint principal
2. Em caso de 404/405, tenta próximo endpoint
3. Varia métodos (POST → PUT)
4. Varia headers (`Token` vs `token`)
5. Varia campos do payload (`url` vs `webhookURL` vs `webhook_url`)

---

## 6️⃣ Schema do Banco de Dados (Tabelas Relevantes)

```sql
-- Instâncias WhatsApp
CREATE TABLE instances (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  subaccount_id uuid REFERENCES ghl_subaccounts(id),
  instance_name text NOT NULL,
  uazapi_instance_token text NOT NULL,
  uazapi_base_url text,              -- Override per-instance
  instance_status instance_status DEFAULT 'disconnected',
  webhook_url text,
  phone text,
  ignore_groups boolean DEFAULT false,
  embed_visible_options jsonb
);

-- Configurações por usuário
CREATE TABLE user_settings (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  uazapi_base_url text,
  uazapi_admin_token text,
  global_webhook_url text,
  track_id text DEFAULT gen_random_uuid()::text,
  queue_enabled boolean DEFAULT true,
  queue_batch_ms integer DEFAULT 1000,
  shared_from_user_id uuid
);

-- Subcontas GHL
CREATE TABLE ghl_subaccounts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  location_id text NOT NULL,
  account_name text NOT NULL,
  embed_token text,
  skip_outbound boolean DEFAULT false
);
```

---

## 🔑 Pontos-Chave

1. **UAZAPI varia endpoints** — SEMPRE use fallback multi-path e multi-method
2. **Headers duplicados** — Envie `Token` E `token` para máxima compatibilidade
3. **Timeout de 15s** — Servidor UAZAPI pode demorar; use retry com backoff
4. **Track ID obrigatório** — Sem ele, mensagens enviadas pelo sistema geram loop infinito no webhook-inbound
5. **Round-robin por contato** — No split, todas as partes de um contato ficam na mesma instância
6. **Anti-ban** — Caracteres invisíveis + intervalos variáveis + botão de confirmação
7. **Participantes sem @** — Na criação de grupo, envie apenas dígitos (sem `@s.whatsapp.net`)
8. **excludeMessages** — Aplique em etapa separada (post-config) pois nem todos os endpoints persistem
9. **Caption + text** — Para mídia com texto, envie nos dois campos para compatibilidade total
