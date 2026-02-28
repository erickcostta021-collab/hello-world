import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(
  url: string,
  instanceToken: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; text: string }> {
  const methods: Array<"POST" | "PUT"> = ["POST", "PUT"];
  let last = { ok: false, status: 0, text: "" };

  for (const method of methods) {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        token: instanceToken,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    last = { ok: res.ok, status: res.status, text };
    if (res.ok) return last;
  }

  return last;
}

async function updateGroupSubjectBestEffort(
  baseUrl: string,
  instanceToken: string,
  groupIdOrJid: string,
  subject: string,
  instanceName?: string,
) {
  // UAZAPI uses PUT /group/{jid} with { subject } body similar to Baileys/Zappaz
  const urls = (
    [
      // PUT /group/{jid} - likely main one
      `${baseUrl}/group/${groupIdOrJid}`,
      // Instance-in-path variants
      instanceName ? `${baseUrl}/group/updateGroupSubject/${instanceName}` : null,
      instanceName ? `${baseUrl}/group/updateSubject/${instanceName}` : null,
      // Non-instance variants
      `${baseUrl}/group/updateGroupSubject`,
      `${baseUrl}/group/updateSubject`,
    ].filter(Boolean) as string[]
  );
  const attempts: Array<Record<string, unknown>> = [
    { subject },
    { groupJid: groupIdOrJid, subject },
    { groupId: groupIdOrJid, subject },
    { jid: groupIdOrJid, subject },
    { id: groupIdOrJid, subject },
  ];

  for (const url of urls) {
    for (const payload of attempts) {
      const r = await postJson(url, instanceToken, payload);
      console.log("Subject update attempt:", {
        endpoint: url.replace(baseUrl, ""),
        payloadKeys: Object.keys(payload),
        status: r.status,
        body: r.text.substring(0, 200),
      });
      if (r.ok) return;
    }
  }
}

async function updateGroupPictureBestEffort(
  baseUrl: string,
  instanceToken: string,
  groupIdOrJid: string,
  imageUrl: string,
  instanceName?: string,
) {
  // UAZAPI may use PUT /group/{jid} with { picture } or /group/profilePicture
  const urls = (
    [
      // PUT /group/{jid} - likely main one
      `${baseUrl}/group/${groupIdOrJid}`,
      // Instance-in-path variants
      instanceName ? `${baseUrl}/group/updateGroupPicture/${instanceName}` : null,
      instanceName ? `${baseUrl}/group/updatePicture/${instanceName}` : null,
      instanceName ? `${baseUrl}/group/profilePicture/${instanceName}` : null,
      // Non-instance variants
      `${baseUrl}/group/updateGroupPicture`,
      `${baseUrl}/group/updatePicture`,
      `${baseUrl}/group/profilePicture`,
    ].filter(Boolean) as string[]
  );
  const payloads: Array<Record<string, unknown>> = [
    { picture: imageUrl },
    { image: imageUrl },
    { groupJid: groupIdOrJid, image: imageUrl },
    { groupId: groupIdOrJid, image: imageUrl },
    { groupJid: groupIdOrJid, picture: imageUrl },
    { groupId: groupIdOrJid, picture: imageUrl },
  ];

  for (const url of urls) {
    for (const payload of payloads) {
      const r = await postJson(url, instanceToken, payload);
      console.log("Picture update attempt:", { endpoint: url.replace(baseUrl, ""), payloadKeys: Object.keys(payload), status: r.status, body: r.text.substring(0, 200) });
      if (r.ok) return;
    }
  }
}

interface CommandResult {
  success: boolean;
  command: string;
  message: string;
  data?: unknown;
}

// Parse command from message text
// Format: #command param1|param2|param3
function parseCommand(text: string): { command: string; params: string[] } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("#")) return null;
  
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) {
    // Command without params (e.g., #somenteadminmsg grupox)
    const parts = trimmed.split(" ");
    return { command: parts[0].toLowerCase(), params: parts.slice(1) };
  }
  
  const command = trimmed.substring(0, firstSpace).toLowerCase();
  const paramsStr = trimmed.substring(firstSpace + 1);
  const params = paramsStr.split("|").map(p => p.trim());
  
  return { command, params };
}

// Helper to find group by name via UAZAPI
async function findGroupByName(
  baseUrl: string,
  instanceToken: string,
  groupName: string
): Promise<{ id: string; name: string } | null> {
  // If groupName is already a JID (contains @g.us), return it directly
  if (groupName.includes("@g.us") || groupName.includes("@g.")) {
    const jid = groupName.includes("@g.us") ? groupName : `${groupName}.us`;
    console.log("Group name is already a JID, using directly:", jid);
    return { id: jid, name: groupName };
  }

  const url = `${baseUrl}/group/all`;
  console.log("Searching for group:", { groupName, url });
  
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "token": instanceToken,
      },
    });
    
    if (!response.ok) {
      console.error("Failed to list groups:", await response.text());
      return null;
    }
    
    const groups = await response.json();
    if (!Array.isArray(groups)) {
      // Some APIs return { groups: [...] }
      const groupsList = groups?.groups;
      if (!Array.isArray(groupsList)) {
        console.error("Unexpected groups response:", JSON.stringify(groups).substring(0, 500));
        return null;
      }
      return findInGroupsList(groupsList, groupName);
    }
    
    return findInGroupsList(groups, groupName);
  } catch (e) {
    console.error("Error finding group:", e);
    return null;
  }
}

function findInGroupsList(groups: any[], groupName: string): { id: string; name: string } | null {
  const targetName = groupName.toLowerCase();
  const found = groups.find((g: any) => {
    const name = (g.subject || g.Subject || g.name || g.Name || g.groupName || g.GroupName || "").toLowerCase();
    return name === targetName;
  });
  
  if (found) {
    return {
      id: found.id || found.jid || found.JID || found.groupId || found.GroupId,
      name: found.subject || found.Subject || found.name || found.Name || found.groupName || found.GroupName,
    };
  }
  
  console.log("Group not found by name:", groupName);
  return null;
}

// Create group
async function createGroup(
  baseUrl: string,
  instanceToken: string,
  groupName: string,
  description: string,
  photoUrl: string,
  participants: string[],
  instanceName?: string,
): Promise<CommandResult> {
  console.log("Creating group:", { groupName, description, photoUrl, participants });
  
  try {
    // UAZAPI/Evolution expects just clean phone numbers without @s.whatsapp.net
    const formattedParticipants = participants.map(p => p.replace(/\D/g, ""));
    
    console.log("Formatted participants:", formattedParticipants);
    
    // Create group - API creates with participants first, then we update name/description/photo
    const createUrl = `${baseUrl}/group/create`;
    const createResponse = await fetch(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": instanceToken,
      },
      body: JSON.stringify({
        subject: groupName,
        participants: formattedParticipants,
      }),
    });
    
    const createData = await createResponse.json();
    console.log("Create group response:", JSON.stringify(createData));
    
    if (!createResponse.ok) {
      return { success: false, command: "criargrupo", message: `Erro ao criar grupo: ${createData.message || createResponse.status}` };
    }
    
    // Extract group JID from response - API returns it in group.JID
    const groupJid = createData.group?.JID || createData.id || createData.jid || createData.gid || createData.groupId || createData.group?.id;
    console.log("Group created with JID:", groupJid);
    
    if (!groupJid) {
      console.error("Could not extract group JID from response");
      return { 
        success: true, 
        command: "criargrupo", 
        message: `⚠️ Grupo criado mas não foi possível aplicar nome/descrição/foto (JID não encontrado)`,
        data: createData 
      };
    }
    
    await sleep(650);

    // Update group name (subject) - try multiple payload shapes
    console.log("Updating group subject to:", groupName);
    await updateGroupSubjectBestEffort(baseUrl, instanceToken, groupJid, groupName, instanceName);
    await sleep(250);
    
    // Update group description if provided
    if (description) {
      console.log("Updating group description to:", description);
      const descResponse = await fetch(`${baseUrl}/group/updateDescription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "token": instanceToken,
        },
        body: JSON.stringify({
          groupJid: groupJid,
          description: description,
        }),
      });
      const descData = await descResponse.text();
      console.log("Description update response:", descResponse.status, descData);
    }
    
    // Update group photo if provided
    if (photoUrl) {
      console.log("Updating group photo to:", photoUrl);
      await updateGroupPictureBestEffort(baseUrl, instanceToken, groupJid, photoUrl, instanceName);
    }
    
    return { 
      success: true, 
      command: "criargrupo", 
      message: `✅ Grupo "${groupName}" criado com sucesso!`,
      data: createData 
    };
  } catch (e) {
    console.error("Error creating group:", e);
    return { success: false, command: "criargrupo", message: `Erro: ${e instanceof Error ? e.message : "Falha ao criar grupo"}` };
  }
}

// Remove member from group
async function removeMember(
  baseUrl: string,
  instanceToken: string,
  groupName: string,
  phone: string
): Promise<CommandResult> {
  const group = await findGroupByName(baseUrl, instanceToken, groupName);
  if (!group) {
    return { success: false, command: "removerdogrupo", message: `❌ Grupo "${groupName}" não encontrado` };
  }
  
  const cleanPhone = phone.replace(/\D/g, "");
  const participantJid = `${cleanPhone}@s.whatsapp.net`;
  
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    // Use /group/updateParticipants with action:"remove" (matching webhook-outbound)
    const response = await fetch(`${baseUrl}/group/updateParticipants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": instanceToken,
      },
      body: JSON.stringify({
        groupjid: group.id,
        action: "remove",
        participants: [cleanPhone],
      }),
    });
    
    const data = await response.text();
    console.log(`removeParticipant response (${response.status}):`, data);
    
    if (!response.ok) {
      return { success: false, command: "removerdogrupo", message: `❌ Erro ao remover: ${data.substring(0, 100)}` };
    }
    
    return { success: true, command: "removerdogrupo", message: `✅ Membro ${phone} removido do grupo "${groupName}"` };
  } catch (e) {
    console.error("Error removing member:", e);
    return { success: false, command: "removerdogrupo", message: `Erro: ${e instanceof Error ? e.message : "Falha"}` };
  }
}

// Add member to group
async function addMember(
  baseUrl: string,
  instanceToken: string,
  groupName: string,
  phone: string
): Promise<CommandResult> {
  const group = await findGroupByName(baseUrl, instanceToken, groupName);
  if (!group) {
    return { success: false, command: "addnogrupo", message: `❌ Grupo "${groupName}" não encontrado` };
  }
  
  const cleanPhone = phone.replace(/\D/g, "");
  
  try {
    const response = await fetch(`${baseUrl}/group/updateParticipants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": instanceToken,
      },
      body: JSON.stringify({
        groupjid: group.id,
        action: "add",
        participants: [cleanPhone],
      }),
    });
    
    const data = await response.text();
    console.log(`addParticipant response (${response.status}):`, data);
    
    if (!response.ok) {
      return { success: false, command: "addnogrupo", message: `❌ Erro ao adicionar: ${data.substring(0, 100)}` };
    }
    
    return { success: true, command: "addnogrupo", message: `✅ Membro ${phone} adicionado ao grupo "${groupName}"` };
  } catch (e) {
    return { success: false, command: "addnogrupo", message: `Erro: ${e instanceof Error ? e.message : "Falha"}` };
  }
}

// Promote member to admin
async function promoteToAdmin(
  baseUrl: string,
  instanceToken: string,
  groupName: string,
  phone: string
): Promise<CommandResult> {
  const group = await findGroupByName(baseUrl, instanceToken, groupName);
  if (!group) {
    return { success: false, command: "promoveradmin", message: `❌ Grupo "${groupName}" não encontrado` };
  }
  
  const cleanPhone = phone.replace(/\D/g, "");
  
  try {
    // Use same working pattern as add/remove: /group/updateParticipants with action
    const response = await fetch(`${baseUrl}/group/updateParticipants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": instanceToken,
      },
      body: JSON.stringify({
        groupjid: group.id,
        action: "promote",
        participants: [cleanPhone],
      }),
    });
    
    const data = await response.text();
    console.log(`promoteParticipant response (${response.status}):`, data);
    
    if (!response.ok) {
      return { success: false, command: "promoveradmin", message: `❌ Erro ao promover: ${data.substring(0, 100)}` };
    }
    
    return { success: true, command: "promoveradmin", message: `✅ Membro ${phone} promovido a admin no grupo "${groupName}"` };
  } catch (e) {
    return { success: false, command: "promoveradmin", message: `Erro: ${e instanceof Error ? e.message : "Falha"}` };
  }
}

// Demote admin to member
async function demoteAdmin(
  baseUrl: string,
  instanceToken: string,
  groupName: string,
  phone: string
): Promise<CommandResult> {
  const group = await findGroupByName(baseUrl, instanceToken, groupName);
  if (!group) {
    return { success: false, command: "revogaradmin", message: `❌ Grupo "${groupName}" não encontrado` };
  }
  
  const cleanPhone = phone.replace(/\D/g, "");
  
  try {
    // Use same working pattern as add/remove: /group/updateParticipants with action
    const response = await fetch(`${baseUrl}/group/updateParticipants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": instanceToken,
      },
      body: JSON.stringify({
        groupjid: group.id,
        action: "demote",
        participants: [cleanPhone],
      }),
    });
    
    const data = await response.text();
    console.log(`demoteParticipant response (${response.status}):`, data);
    
    if (!response.ok) {
      return { success: false, command: "revogaradmin", message: `❌ Erro ao revogar: ${data.substring(0, 100)}` };
    }
    
    return { success: true, command: "revogaradmin", message: `✅ Admin ${phone} rebaixado a membro no grupo "${groupName}"` };
  } catch (e) {
    return { success: false, command: "revogaradmin", message: `Erro: ${e instanceof Error ? e.message : "Falha"}` };
  }
}

// Update group photo
async function updateGroupPhoto(
  baseUrl: string,
  instanceToken: string,
  groupName: string,
  photoUrl: string
): Promise<CommandResult> {
  const group = await findGroupByName(baseUrl, instanceToken, groupName);
  if (!group) {
    return { success: false, command: "attfotogrupo", message: `❌ Grupo "${groupName}" não encontrado` };
  }
  
  try {
    const response = await fetch(`${baseUrl}/group/updatePicture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": instanceToken,
      },
      body: JSON.stringify({
        groupId: group.id,
        image: photoUrl,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, command: "attfotogrupo", message: `❌ Erro ao atualizar foto: ${data.message || response.status}` };
    }
    
    return { success: true, command: "attfotogrupo", message: `✅ Foto do grupo "${groupName}" atualizada` };
  } catch (e) {
    return { success: false, command: "attfotogrupo", message: `Erro: ${e instanceof Error ? e.message : "Falha"}` };
  }
}

// Update group name (subject)
async function updateGroupName(
  baseUrl: string,
  instanceToken: string,
  currentName: string,
  newName: string
): Promise<CommandResult> {
  const group = await findGroupByName(baseUrl, instanceToken, currentName);
  if (!group) {
    return { success: false, command: "attnomegrupo", message: `❌ Grupo "${currentName}" não encontrado` };
  }
  
  try {
    const response = await fetch(`${baseUrl}/group/updateSubject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": instanceToken,
      },
      body: JSON.stringify({
        groupId: group.id,
        subject: newName,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, command: "attnomegrupo", message: `❌ Erro ao atualizar nome: ${data.message || response.status}` };
    }
    
    return { success: true, command: "attnomegrupo", message: `✅ Nome do grupo alterado de "${currentName}" para "${newName}"` };
  } catch (e) {
    return { success: false, command: "attnomegrupo", message: `Erro: ${e instanceof Error ? e.message : "Falha"}` };
  }
}

// Update group description
async function updateGroupDescription(
  baseUrl: string,
  instanceToken: string,
  groupName: string,
  description: string
): Promise<CommandResult> {
  const group = await findGroupByName(baseUrl, instanceToken, groupName);
  if (!group) {
    return { success: false, command: "attdescricao", message: `❌ Grupo "${groupName}" não encontrado` };
  }
  
  try {
    // Try multiple endpoint/payload combinations (matching working patterns from updateAnnounce/updateLocked)
    const attempts = [
      { url: `${baseUrl}/group/updateDescription`, body: { groupjid: group.id, description } },
      { url: `${baseUrl}/group/updateDescription`, body: { groupjid: group.id, topic: description } },
      { url: `${baseUrl}/group/updateDescription`, body: { groupJid: group.id, description } },
      { url: `${baseUrl}/group/updateDescription`, body: { jid: group.id, description } },
      { url: `${baseUrl}/group/${group.id}`, body: { description } },
      { url: `${baseUrl}/group/${group.id}`, body: { topic: description } },
    ];

    for (const attempt of attempts) {
      for (const method of ["POST", "PUT"] as const) {
        try {
          const response = await fetch(attempt.url, {
            method,
            headers: { "Content-Type": "application/json", "token": instanceToken },
            body: JSON.stringify(attempt.body),
          });
          const text = await response.text();
          console.log(`Description update attempt: ${method} ${attempt.url.replace(baseUrl, "")}`, JSON.stringify(attempt.body), `→ ${response.status}:`, text.substring(0, 200));
          if (response.ok) {
            return { success: true, command: "attdescricao", message: `✅ Descrição do grupo "${groupName}" atualizada` };
          }
        } catch (e) {
          console.error("Description attempt error:", e);
        }
      }
    }
    
    return { success: false, command: "attdescricao", message: `❌ Erro ao atualizar descrição: nenhum endpoint funcionou` };
  } catch (e) {
    return { success: false, command: "attdescricao", message: `Erro: ${e instanceof Error ? e.message : "Falha"}` };
  }
}

// Set group settings (announcement/restrict mode)
async function updateGroupSettings(
  baseUrl: string,
  instanceToken: string,
  groupName: string,
  setting: "announcement" | "not_announcement" | "locked" | "unlocked"
): Promise<CommandResult> {
  const group = await findGroupByName(baseUrl, instanceToken, groupName);
  if (!group) {
    const cmdName = setting.includes("announcement") ? "somenteadminmsg" : "somenteadminedit";
    return { success: false, command: cmdName, message: `❌ Grupo "${groupName}" não encontrado` };
  }
  
  try {
    // Use specific UAZAPI v2 endpoints matching webhook-outbound
    let url: string;
    let body: Record<string, unknown>;
    
    if (setting === "announcement" || setting === "not_announcement") {
      url = `${baseUrl}/group/updateAnnounce`;
      body = { groupjid: group.id, announce: setting === "announcement" };
    } else {
      url = `${baseUrl}/group/updateLocked`;
      body = { groupjid: group.id, locked: setting === "locked" };
    }
    
    console.log(`updateGroupSettings: ${url}`, JSON.stringify(body));
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": instanceToken,
      },
      body: JSON.stringify(body),
    });
    
    const data = await response.text();
    console.log(`updateGroupSettings response (${response.status}):`, data);
    
    if (!response.ok) {
      return { success: false, command: setting, message: `❌ Erro ao alterar configuração: ${data.substring(0, 100)}` };
    }
    
    const messages: Record<string, string> = {
      announcement: `✅ Agora apenas admins podem enviar mensagens no grupo "${groupName}"`,
      not_announcement: `✅ Agora todos podem enviar mensagens no grupo "${groupName}"`,
      locked: `✅ Agora apenas admins podem editar o grupo "${groupName}"`,
      unlocked: `✅ Agora todos podem editar o grupo "${groupName}"`,
    };
    
    return { success: true, command: setting, message: messages[setting] };
  } catch (e) {
    return { success: false, command: setting, message: `Erro: ${e instanceof Error ? e.message : "Falha"}` };
  }
}

// Get group invite link and send to a phone
async function getGroupLink(
  baseUrl: string,
  instanceToken: string,
  groupName: string,
  targetPhone: string
): Promise<CommandResult> {
  const group = await findGroupByName(baseUrl, instanceToken, groupName);
  if (!group) {
    return { success: false, command: "linkgrupo", message: `❌ Grupo "${groupName}" não encontrado` };
  }
  
  try {
    let inviteCode: string | null = null;

    const extractCode = (text: string): string | null => {
      try {
        const data = JSON.parse(text);
        // Check nested groupInfo.inviteLink from /group/info response
        if (data.groupInfo?.inviteLink) return data.groupInfo.inviteLink;
        if (data.inviteLink) return data.inviteLink;
        const code = data.code || data.inviteCode || data.invite || data.inviteUrl || data.link || data.InviteLink;
        if (code) return code;
        if (typeof data === "string" && data.includes("chat.whatsapp.com")) return data;
      } catch {
        if (text.includes("chat.whatsapp.com")) return text.trim();
        const clean = text.trim().replace(/["\s]/g, "");
        if (clean.length > 10 && clean.length < 50 && /^[A-Za-z0-9_-]+$/.test(clean)) return clean;
      }
      return null;
    };

    // Priority 1: POST /group/info with getInviteLink: true (documented API)
    try {
      const infoResp = await fetch(`${baseUrl}/group/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "token": instanceToken },
        body: JSON.stringify({ groupjid: group.id, getInviteLink: true, force: false }),
      });
      const infoText = await infoResp.text();
      console.log(`inviteCode POST /group/info:`, infoResp.status, infoText.substring(0, 400));
      if (infoResp.ok) {
        inviteCode = extractCode(infoText);
      }
    } catch (e) {
      console.error("inviteCode /group/info error:", e);
    }

    // Priority 2: GET /group/invitelink/{jid}
    if (!inviteCode) {
      const getAttempts = [
        `${baseUrl}/group/invitelink/${group.id}`,
        `${baseUrl}/group/invitelink/${encodeURIComponent(group.id)}`,
        `${baseUrl}/group/inviteCode/${group.id}`,
      ];
      for (const url of getAttempts) {
        try {
          const response = await fetch(url, {
            method: "GET",
            headers: { "token": instanceToken },
          });
          const text = await response.text();
          console.log(`inviteCode GET ${url}:`, response.status, text.substring(0, 300));
          if (response.ok) {
            inviteCode = extractCode(text);
            if (inviteCode) break;
          }
        } catch (e) {
          console.error("inviteCode GET error:", e);
        }
      }
    }

    if (!inviteCode) {
      return { success: false, command: "linkgrupo", message: `❌ Não foi possível obter o link do grupo` };
    }
    
    const inviteLink = inviteCode.startsWith("http") ? inviteCode : `https://chat.whatsapp.com/${inviteCode}`;
    
    // If targetPhone is "clipboard", just return the link (used by the UI)
    if (targetPhone === "clipboard") {
      return { success: true, command: "linkgrupo", message: `✅ Link: ${inviteLink}` };
    }

    // Send link to the target phone
    const cleanPhone = targetPhone.replace(/\D/g, "");
    const sendResponse = await fetch(`${baseUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "token": instanceToken },
      body: JSON.stringify({ number: cleanPhone, text: `📎 Link do grupo "${groupName}":\n${inviteLink}` }),
    });
    
    if (!sendResponse.ok) {
      return { success: true, command: "linkgrupo", message: `✅ Link do grupo: ${inviteLink}\n(Não foi possível enviar para ${targetPhone})` };
    }
    
    return { success: true, command: "linkgrupo", message: `✅ Link do grupo "${groupName}" enviado para ${targetPhone}` };
  } catch (e) {
    return { success: false, command: "linkgrupo", message: `Erro: ${e instanceof Error ? e.message : "Falha"}` };
  }
}

// Main command processor
async function processCommand(
  command: string,
  params: string[],
  baseUrl: string,
  instanceToken: string,
  instanceName?: string,
  scheduledFor?: string,
): Promise<CommandResult | null> {
  console.log("Processing command:", { command, params });
  
  switch (command) {
    case "#criargrupo": {
      // #criargrupo grupox|descrição|urldafoto|+5527999999999
      if (params.length < 4) {
        return { success: false, command: "criargrupo", message: "❌ Formato: #criargrupo nome|descrição|urldafoto|telefone" };
      }
      const [name, description, photoUrl, ...phones] = params;
      return createGroup(baseUrl, instanceToken, name, description, photoUrl, phones, instanceName);
    }
    
    case "#removerdogrupo": {
      // #removerdogrupo grupox|+5527999999999
      if (params.length < 2) {
        return { success: false, command: "removerdogrupo", message: "❌ Formato: #removerdogrupo nome_grupo|telefone" };
      }
      return removeMember(baseUrl, instanceToken, params[0], params[1]);
    }
    
    case "#addnogrupo": {
      // #addnogrupo grupox|+5527999999999
      if (params.length < 2) {
        return { success: false, command: "addnogrupo", message: "❌ Formato: #addnogrupo nome_grupo|telefone" };
      }
      return addMember(baseUrl, instanceToken, params[0], params[1]);
    }
    
    case "#promoveradmin": {
      // #promoveradmin grupox|+5527999999999
      if (params.length < 2) {
        return { success: false, command: "promoveradmin", message: "❌ Formato: #promoveradmin nome_grupo|telefone" };
      }
      return promoteToAdmin(baseUrl, instanceToken, params[0], params[1]);
    }
    
    case "#revogaradmin": {
      // #revogaradmin grupox|+5527999999999
      if (params.length < 2) {
        return { success: false, command: "revogaradmin", message: "❌ Formato: #revogaradmin nome_grupo|telefone" };
      }
      return demoteAdmin(baseUrl, instanceToken, params[0], params[1]);
    }
    
    case "#attfotogrupo": {
      // #attfotogrupo grupox|urldafoto
      if (params.length < 2) {
        return { success: false, command: "attfotogrupo", message: "❌ Formato: #attfotogrupo nome_grupo|url_foto" };
      }
      return updateGroupPhoto(baseUrl, instanceToken, params[0], params[1]);
    }
    
    case "#attnomegrupo": {
      // #attnomegrupo grupox|grupoy
      if (params.length < 2) {
        return { success: false, command: "attnomegrupo", message: "❌ Formato: #attnomegrupo nome_atual|nome_novo" };
      }
      return updateGroupName(baseUrl, instanceToken, params[0], params[1]);
    }
    
    case "#attdescricao": {
      // #attdescricao grupox|nova descrição
      if (params.length < 2) {
        return { success: false, command: "attdescricao", message: "❌ Formato: #attdescricao nome_grupo|nova_descricao" };
      }
      return updateGroupDescription(baseUrl, instanceToken, params[0], params[1]);
    }
    
    case "#somenteadminmsg": {
      // #somenteadminmsg grupox
      if (params.length < 1) {
        return { success: false, command: "somenteadminmsg", message: "❌ Formato: #somenteadminmsg nome_grupo" };
      }
      return updateGroupSettings(baseUrl, instanceToken, params[0], "announcement");
    }
    
    case "#msgliberada": {
      // #msgliberada grupox
      if (params.length < 1) {
        return { success: false, command: "msgliberada", message: "❌ Formato: #msgliberada nome_grupo" };
      }
      return updateGroupSettings(baseUrl, instanceToken, params[0], "not_announcement");
    }
    
    case "#somenteadminedit": {
      // #somenteadminedit grupox
      if (params.length < 1) {
        return { success: false, command: "somenteadminedit", message: "❌ Formato: #somenteadminedit nome_grupo" };
      }
      return updateGroupSettings(baseUrl, instanceToken, params[0], "locked");
    }
    
    case "#editliberado": {
      // #editliberado grupox
      if (params.length < 1) {
        return { success: false, command: "editliberado", message: "❌ Formato: #editliberado nome_grupo" };
      }
      return updateGroupSettings(baseUrl, instanceToken, params[0], "unlocked");
    }
    
    case "#linkgrupo": {
      // #linkgrupo grupox|+5527999999999
      if (params.length < 2) {
        return { success: false, command: "linkgrupo", message: "❌ Formato: #linkgrupo nome_grupo|telefone" };
      }
      return getGroupLink(baseUrl, instanceToken, params[0], params[1]);
    }
    
    case "#enviargrupo": {
      // #enviargrupo groupJid|mensagem
      if (params.length < 2) {
        return { success: false, command: "enviargrupo", message: "❌ Formato: #enviargrupo jid_grupo|mensagem" };
      }
      const [targetGroup, ...msgParts] = params;
      const groupJid = targetGroup.includes("@g.us") ? targetGroup : `${targetGroup}@g.us`;
      try {
        const sendBody: Record<string, unknown> = { number: groupJid, text: msgParts.join("|") };
        // Support scheduling via scheduledFor ISO string
        // UAZAPI may use "scheduled_for" or "Delay" (seconds from now)
        if (scheduledFor) {
          const scheduledDate = new Date(scheduledFor);
          const delaySeconds = Math.max(0, Math.floor((scheduledDate.getTime() - Date.now()) / 1000));
          sendBody.scheduled_for = scheduledFor;
          sendBody.Delay = delaySeconds;
          sendBody.delay = delaySeconds;
          console.log(`[group-commands] Scheduling message for ${scheduledFor}, delay=${delaySeconds}s`);
        }
        const response = await fetch(`${baseUrl}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": instanceToken },
          body: JSON.stringify(sendBody),
        });
        if (!response.ok) {
          const errData = await response.text();
          console.error("Send message error:", errData);
          return { success: false, command: "enviargrupo", message: `❌ Erro ao enviar: ${response.status}` };
        }
        const successMsg = scheduledFor ? `✅ Mensagem agendada para ${new Date(scheduledFor).toLocaleString("pt-BR")}!` : `✅ Mensagem enviada ao grupo!`;
        return { success: true, command: "enviargrupo", message: successMsg };
      } catch (e) {
        return { success: false, command: "enviargrupo", message: `Erro: ${e instanceof Error ? e.message : "Falha"}` };
      }
    }

    default:
      return null; // Not a recognized command
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instanceId, messageText, scheduledFor } = await req.json();

    if (!instanceId || !messageText) {
      return new Response(
        JSON.stringify({ error: "instanceId and messageText are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if this is a command
    const parsed = parseCommand(messageText);
    if (!parsed) {
      return new Response(
        JSON.stringify({ isCommand: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get instance details
    const { data: instance, error: instanceError } = await supabase
      .from("instances")
      .select("uazapi_instance_token, instance_name, user_id, uazapi_base_url")
      .eq("id", instanceId)
      .limit(1);

    if (instanceError || !instance || instance.length === 0) {
      return new Response(
        JSON.stringify({ error: "Instance not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const instanceData = instance[0];

    // Per-instance base URL takes priority over global settings
    let baseUrl = instanceData.uazapi_base_url?.replace(/\/+$/, "");

    if (!baseUrl) {
      // Get user settings for UAZAPI base URL
      const { data: settings, error: settingsError } = await supabase
        .from("user_settings")
        .select("uazapi_base_url")
        .eq("user_id", instanceData.user_id)
        .limit(1);

      if (settingsError || !settings || settings.length === 0) {
        return new Response(
          JSON.stringify({ error: "User settings not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      baseUrl = settings[0].uazapi_base_url?.replace(/\/+$/, "");
    }

    if (!baseUrl) {
      return new Response(
        JSON.stringify({ error: "UAZAPI base URL not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process the command
    const result = await processCommand(
      parsed.command,
      parsed.params,
      baseUrl,
      instanceData.uazapi_instance_token,
      instanceData.instance_name,
      scheduledFor,
    );

    if (!result) {
      return new Response(
        JSON.stringify({ isCommand: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        isCommand: true,
        ...result 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error processing command:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
