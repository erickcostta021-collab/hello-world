import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Metrics logger (fire-and-forget)
let _metricsSupabase: any = null;
function logMetric(functionName: string, statusCode: number, errorType: string | null, processingTimeMs?: number) {
  try {
    if (!_metricsSupabase) {
      _metricsSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    }
    _metricsSupabase.from("webhook_metrics").insert({
      function_name: functionName,
      status_code: statusCode,
      error_type: errorType,
      processing_time_ms: processingTimeMs || null,
    }).then(() => {}).catch(() => {});
  } catch { /* ignore */ }
}

// Retry wrapper for GHL API calls with exponential backoff
async function fetchGHL(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error | null = null;
  const start = Date.now();
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        logMetric("webhook-outbound", 429, "429", Date.now() - start);
        const retryAfter = response.headers.get("retry-after");
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[GHL] Rate limited (429), retry ${attempt + 1}/${maxRetries} in ${waitMs}ms: ${url}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }
      if (response.status >= 500 && attempt < maxRetries) {
        logMetric("webhook-outbound", response.status, "5xx", Date.now() - start);
        const waitMs = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[GHL] Server error (${response.status}), retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (response.ok) logMetric("webhook-outbound", response.status, "success", Date.now() - start);
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logMetric("webhook-outbound", 0, "network", Date.now() - start);
      if (attempt < maxRetries) {
        const waitMs = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[GHL] Network error, retry ${attempt + 1}/${maxRetries} in ${waitMs}ms:`, lastError.message);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastError || new Error("fetchGHL: all retries exhausted");
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
  _instanceName?: string,
) {
  // UAZAPI uses: POST /group/updateName with { groupjid, name }
  const url = `${baseUrl}/group/updateName`;
  const payload = { groupjid: groupIdOrJid, name: subject };
  
  console.log("Updating group name (UAZAPI):", { url, groupjid: groupIdOrJid, name: subject });
  
  const r = await postJson(url, instanceToken, payload);
  console.log("Group name update response:", { status: r.status, body: r.text.substring(0, 300) });
  
  if (!r.ok) {
    console.error("Failed to update group name:", r.status, r.text);
  }
}

async function updateGroupPictureBestEffort(
  baseUrl: string,
  instanceToken: string,
  groupIdOrJid: string,
  imageUrl: string,
  _instanceName?: string,
) {
  // Per n8n test: POST /group/updateImage with { groupjid (lowercase), image }
  const url = `${baseUrl}/group/updateImage`;
  const payload = { groupjid: groupIdOrJid, image: imageUrl };
  
  console.log("Updating group image:", { url, groupjid: groupIdOrJid, image: imageUrl });
  
  const r = await postJson(url, instanceToken, payload);
  console.log("Picture update response:", { status: r.status, body: r.text.substring(0, 300) });
  
  if (!r.ok) {
    console.error("Failed to update group image:", r.status, r.text);
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizePhoneForSig(phone: string): string {
  const p = String(phone ?? "").trim();
  if (!p) return "";
  // Preserve group ids / JIDs
  if (p.includes("@g.us") || p.includes("@s.whatsapp.net") || p.includes("-")) return p;
  return p.replace(/\D/g, "");
}

function normalizeTextForSig(text: string): string {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

// In-memory token cache (survives across warm invocations)
const _tokenCache = new Map<string, { token: string; expiresAt: number }>();

// Helper to get valid access token (refresh if needed) — with in-memory cache
async function getValidToken(supabase: any, subaccount: any, settings: any): Promise<string> {
  const cacheKey = subaccount.id;
  const cached = _tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }
  const accessToken: string | null = subaccount.ghl_access_token ?? null;
  const refreshToken: string | null = subaccount.ghl_refresh_token ?? null;
  const expiresAtIso: string | null = subaccount.ghl_token_expires_at ?? null;

  if (!accessToken || !refreshToken || !expiresAtIso) return accessToken || "";

  const now = new Date();
  const expiresAt = new Date(expiresAtIso);
  const expiresIn1Hour = expiresAt.getTime() - now.getTime() < 60 * 60 * 1000;

  if (now >= expiresAt || expiresIn1Hour) {
    const tokenParams = new URLSearchParams({
      client_id: settings.ghl_client_id,
      client_secret: settings.ghl_client_secret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      user_type: "Location",
    });

    const tokenResponse = await fetchGHL("https://services.leadconnectorhq.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      console.error("Failed to refresh GHL token:", err);
      throw new Error("Failed to refresh GHL token");
    }

    const tokenData = await tokenResponse.json();
    const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    await supabase
      .from("ghl_subaccounts")
      .update({
        ghl_access_token: tokenData.access_token,
        ghl_refresh_token: tokenData.refresh_token,
        ghl_token_expires_at: newExpiresAt.toISOString(),
        ghl_subaccount_token: tokenData.access_token,
        oauth_last_refresh: new Date().toISOString(),
      })
      .eq("id", subaccount.id);

    _tokenCache.set(cacheKey, { token: tokenData.access_token, expiresAt: newExpiresAt.getTime() });
    return tokenData.access_token;
  }

  // Cache even non-refreshed tokens
  _tokenCache.set(cacheKey, { token: accessToken, expiresAt: expiresAt.getTime() });
  return accessToken;
}

// Returns { phone, email } from GHL contact
async function fetchGhlContact(token: string, contactId: string): Promise<{ phone: string; email: string }> {
  const contactRes = await fetchGHL(`https://services.leadconnectorhq.com/contacts/${contactId}`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Version": "2021-07-28",
        "Accept": "application/json",
      },
    }
  );

  const bodyText = await contactRes.text();
  if (!contactRes.ok) {
    console.error("GHL contact lookup failed:", { status: contactRes.status, body: bodyText.substring(0, 300) });
    return { phone: "", email: "" };
  }

  try {
    const parsed = JSON.parse(bodyText);
    const phone = String(
      parsed?.contact?.phone ||
        parsed?.contact?.phoneNumber ||
        parsed?.contact?.primaryPhone ||
        ""
    );
    const email = String(parsed?.contact?.email || "");
    return { phone, email };
  } catch {
    return { phone: "", email: "" };
  }
}

// Fetch a GHL user's name (firstName + lastName, or name, or email fallback). Returns "" on failure.
async function fetchGhlUserName(token: string, userId: string): Promise<string> {
  if (!userId) return "";
  try {
    const res = await fetchGHL(`https://services.leadconnectorhq.com/users/${userId}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Version": "2021-07-28",
        "Accept": "application/json",
      },
    });
    if (!res.ok) {
      console.warn("[sign] GHL user lookup failed:", { userId, status: res.status });
      return "";
    }
    const parsed = await res.json().catch(() => ({} as any));
    const u = parsed?.user || parsed || {};
    const first = String(u.firstName || "").trim();
    const last = String(u.lastName || "").trim();
    const name = [first, last].filter(Boolean).join(" ").trim() || String(u.name || "").trim() || String(u.email || "").trim();
    return name;
  } catch (e) {
    console.warn("[sign] fetchGhlUserName error:", e);
    return "";
  }
}

// Parse sign config out of an instance auto_tag field.
function parseSignConfig(autoTag: string | null | undefined): { enabled: boolean; source: "assigned" | "sender" } {
  const out = { enabled: false, source: "assigned" as "assigned" | "sender" };
  if (!autoTag) return out;
  const parts = autoTag.split(",").map((t) => t.trim()).filter(Boolean);
  for (const p of parts) {
    if (p === "__sign:1") out.enabled = true;
    else if (p.startsWith("__sign_source:")) {
      const v = p.slice("__sign_source:".length);
      if (v === "sender" || v === "assigned") out.source = v;
    }
  }
  return out;
}

// Helper to detect if phone is a group ID
function isGroupId(phone: string): boolean {
  // Clean the phone first to avoid issues with + prefix
  const cleaned = phone.replace(/\D/g, "");
  
  // Group IDs from GHL come as long numbers (typically 18+ digits starting with 120363...)
  // or already have @g.us suffix
  if (phone.includes("@g.us")) return true;
  // GHL stores group IDs as the numeric part - typically 18+ digits starting with 120363
  if (cleaned.length >= 18 && cleaned.startsWith("120363")) return true;
  return false;
}

// Format phone for UAZAPI - preserve group IDs with special chars
function formatPhoneForUazapi(phone: string): string {
  // If it's a group ID (has @g.us or hyphens), preserve it as-is
  if (phone.includes("@g.us") || phone.includes("-")) {
    return phone;
  }
  // For regular phone numbers, clean to digits only
  return phone.replace(/\D/g, "");
}

// Helper to detect media type from URL
function detectMediaType(url: string): string {
  const lower = url.toLowerCase();
  if (/\.(mp3|wav|ogg|m4a|aac)/.test(lower)) return "myaudio";
  if (/\.(mp4|mov|avi|mkv|webm)/.test(lower)) return "video";
  if (/\.(jpg|jpeg|png|gif|webp)/.test(lower)) return "image";
  if (/\.(pdf|doc|docx|xls|xlsx|txt)/.test(lower)) return "document";
  return "file";
}

// Check if a URL has OG tags for link preview support
async function urlHasOgTags(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "WhatsApp/2" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return false;
    // Read only first 16KB to find OG tags
    const reader = res.body?.getReader();
    if (!reader) return false;
    let html = "";
    while (html.length < 16384) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
    }
    reader.cancel().catch(() => {});
    // Check for og:title or og:image
    return /property\s*=\s*["']og:(title|image)["']/i.test(html);
  } catch {
    return false;
  }
}

// Send text message via UAZAPI
// Returns { sent, status, body, uazapiMessageId }
async function sendTextMessage(base: string, instanceToken: string, phone: string, text: string, trackId?: string): Promise<{ sent: boolean; status: number; body: string; uazapiMessageId: string | null }> {
  const trackFields = trackId ? { track_id: trackId } : {};
  // Detect URL and verify OG tags before enabling link preview
  const urlMatch = text.match(/https?:\/\/\S+/i);
  let linkPreviewField: Record<string, boolean> = {};
  if (urlMatch) {
    const hasOg = await urlHasOgTags(urlMatch[0]);
    linkPreviewField = hasOg ? { linkPreview: true } : {};
    console.log(`Link preview check: ${urlMatch[0]} → OG tags: ${hasOg}`);
  }
  const attempts: Array<{ path: string; headers: Record<string, string>; body: Record<string, any> }> = [
    // n8n style - primary
    {
      path: "/send/text",
      headers: { token: instanceToken },
      body: { number: phone, text, readchat: "true", ...linkPreviewField, ...trackFields },
    },
    {
      path: "/send/text",
      headers: { token: instanceToken },
      body: { number: phone, text, readchat: "1", ...linkPreviewField, ...trackFields },
    },
    {
      path: "/chat/send/text",
      headers: { Token: instanceToken },
      body: { Phone: phone, Body: text, ...linkPreviewField, ...trackFields },
    },
    {
      path: "/chat/send/text",
      headers: { Token: instanceToken },
      body: { Phone: `${phone}@s.whatsapp.net`, Body: text, ...linkPreviewField, ...trackFields },
    },
    {
      path: "/chat/send/text",
      headers: { Authorization: `Bearer ${instanceToken}` },
      body: { Phone: phone, Body: text, ...linkPreviewField, ...trackFields },
    },
    {
      path: "/message/text",
      headers: { Token: instanceToken },
      body: { id: phone, message: text, ...linkPreviewField, ...trackFields },
    },
    {
      path: "/api/sendText",
      headers: { Authorization: `Bearer ${instanceToken}` },
      body: { chatId: `${phone}@c.us`, text, ...linkPreviewField, ...trackFields },
    },
  ];

  let lastStatus = 0;
  let lastBody = "";
  
  for (const attempt of attempts) {
    const url = `${base}${attempt.path}`;
    console.log("Trying UAZAPI text send:", { url, phone, headers: Object.keys(attempt.headers) });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...attempt.headers },
      body: JSON.stringify(attempt.body),
    });

    lastStatus = res.status;
    lastBody = await res.text();
    console.log("UAZAPI text response:", { url, status: lastStatus, body: lastBody.substring(0, 200) });

    if (res.ok) {
      // Extract messageId from response
      let uazapiMessageId: string | null = null;
      try {
        const parsed = JSON.parse(lastBody);
        uazapiMessageId = parsed?.messageid || parsed?.messageId || parsed?.id || parsed?.key?.id || null;
      } catch {
        // Ignore parse errors
      }
      return { sent: true, status: lastStatus, body: lastBody, uazapiMessageId };
    }
  }

  return { sent: false, status: lastStatus, body: lastBody, uazapiMessageId: null };
}

// Send media message via UAZAPI (based on n8n flow)
// Returns { sent, status, body, uazapiMessageId }
async function sendMediaMessage(base: string, instanceToken: string, phone: string, fileUrl: string, mediaType: string, caption?: string, trackId?: string): Promise<{ sent: boolean; status: number; body: string; uazapiMessageId: string | null }> {
  const trackFields = trackId ? { track_id: trackId } : {};
  // Based on n8n: POST {base}/send/media with header token and body { number, type, file, readchat, text (optional caption) }
  const attempts: Array<{ path: string; headers: Record<string, string>; body: Record<string, any> }> = [
    // n8n style - primary
    {
      path: "/send/media",
      headers: { token: instanceToken },
      body: { number: phone, type: mediaType, file: fileUrl, readchat: "true", ...(caption ? { text: caption } : {}), ...trackFields },
    },
    {
      path: "/send/media",
      headers: { token: instanceToken },
      body: { number: phone, type: mediaType, file: fileUrl, readchat: "1", ...(caption ? { text: caption } : {}), ...trackFields },
    },
    // Alternative without type
    {
      path: "/send/media",
      headers: { token: instanceToken },
      body: { number: phone, file: fileUrl, readchat: "true", ...(caption ? { text: caption } : {}), ...trackFields },
    },
    // Wuzapi style
    {
      path: "/chat/send/media",
      headers: { Token: instanceToken },
      body: { Phone: phone, Url: fileUrl, Caption: caption || "", ...trackFields },
    },
    {
      path: "/chat/send/document",
      headers: { Token: instanceToken },
      body: { Phone: phone, Url: fileUrl, ...trackFields },
    },
    // For audio specifically
    {
      path: "/send/audio",
      headers: { token: instanceToken },
      body: { number: phone, file: fileUrl, readchat: "true", ...trackFields },
    },
  ];

  let lastStatus = 0;
  let lastBody = "";
  
  for (const attempt of attempts) {
    const url = `${base}${attempt.path}`;
    console.log("Trying UAZAPI media send:", { url, phone, mediaType, headers: Object.keys(attempt.headers) });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...attempt.headers },
      body: JSON.stringify(attempt.body),
    });

    lastStatus = res.status;
    lastBody = await res.text();
    console.log("UAZAPI media response:", { url, status: lastStatus, body: lastBody.substring(0, 200) });

    if (res.ok) {
      // Extract messageId from response
      let uazapiMessageId: string | null = null;
      try {
        const parsed = JSON.parse(lastBody);
        uazapiMessageId = parsed?.messageid || parsed?.messageId || parsed?.id || parsed?.key?.id || null;
      } catch {
        // Ignore parse errors
      }
      return { sent: true, status: lastStatus, body: lastBody, uazapiMessageId };
    }
  }

  return { sent: false, status: lastStatus, body: lastBody, uazapiMessageId: null };
}

// Database-based deduplication using ghl_processed_messages table
async function isDuplicate(supabase: any, messageId: string): Promise<boolean> {
  if (!messageId) return false;
  
  try {
    // Try to insert the messageId - if it already exists, it's a duplicate
    const { error } = await supabase
      .from("ghl_processed_messages")
      .insert({ message_id: messageId });
    
    if (error) {
      // If unique constraint violation, it's a duplicate
      if (error.code === "23505") {
        console.log("Duplicate detected via DB:", { messageId });
        return true;
      }
      console.error("Error checking duplicate:", error);
      // On other errors, allow processing to avoid blocking messages
      return false;
    }
    
    return false;
  } catch (e) {
    console.error("Dedup check failed:", e);
    return false;
  }
}

// =====================================================================
// GROUP MANAGEMENT COMMANDS PROCESSOR
// Commands: #criargrupo, #removerdogrupo, #addnogrupo, #promoveradmin, 
//           #revogaradmin, #attfotogrupo, #attnomegrupo, #attdescricao,
//           #somenteadminmsg, #msgliberada, #somenteadminedit, #editliberado, #linkgrupo
// =====================================================================

interface GroupCommandResult {
  isCommand: boolean;
  success?: boolean;
  command?: string;
  message?: string;
}

function parseGroupCommand(text: string): { command: string; params: string[] } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("#")) return null;
  
  // Support both space and tab as separator between command and params
  const firstWS = trimmed.search(/[\s\t]/);
  if (firstWS === -1) {
    return { command: trimmed.toLowerCase(), params: [] };
  }
  
  const command = trimmed.substring(0, firstWS).toLowerCase();
  const paramsStr = trimmed.substring(firstWS).trim();
  const params = paramsStr.split("|").map(p => p.trim()).filter(p => p.length > 0);
  
  return { command, params };
}

async function findGroupByName(
  baseUrl: string,
  instanceToken: string,
  groupName: string,
  instanceName?: string,
): Promise<{ id: string; name: string } | null> {
  const endpoints = (
    [
      // Most common
      `${baseUrl}/group/all`,
      // Some deployments require instance in path
      instanceName ? `${baseUrl}/group/all/${instanceName}` : null,
      instanceName ? `${baseUrl}/${instanceName}/group/all` : null,

      // Alternative group listing endpoints seen in different UAZAPI/Evolution builds
      `${baseUrl}/group/list`,
      instanceName ? `${baseUrl}/group/list/${instanceName}` : null,
      instanceName ? `${baseUrl}/${instanceName}/group/list` : null,

      `${baseUrl}/group/findAll`,
      instanceName ? `${baseUrl}/group/findAll/${instanceName}` : null,
      instanceName ? `${baseUrl}/${instanceName}/group/findAll` : null,
    ].filter(Boolean) as string[]
  );

  // Try multiple header combinations - UAZAPI may accept 'token' or 'apikey'
  const headerVariants: Record<string, string>[] = [
    { "Content-Type": "application/json", token: instanceToken },
    { "Content-Type": "application/json", apikey: instanceToken },
  ];

  let groups: any[] | null = null;

  for (const url of endpoints) {
    for (const headers of headerVariants) {
      try {
        console.log(
          "Attempting to list groups:",
          { endpoint: url.replace(baseUrl, ""), headers: Object.keys(headers).filter((k) => k !== "Content-Type") },
        );

        const response = await fetch(url, { method: "GET", headers });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            groups = data;
            console.log(`Successfully listed ${groups.length} groups`, { endpoint: url.replace(baseUrl, "") });
            break;
          }

          // Some APIs wrap arrays inside objects
          if (data && Array.isArray((data as any).groups)) {
            const wrapped = (data as any).groups as any[];
            groups = wrapped;
            console.log(`Successfully listed ${wrapped.length} groups (wrapped)`, { endpoint: url.replace(baseUrl, "") });
            break;
          }
        } else {
          console.log(`List groups failed (${response.status})`, {
            endpoint: url.replace(baseUrl, ""),
            body: (await response.text()).substring(0, 300),
          });
        }
      } catch (err) {
        console.log("Error listing groups attempt:", { endpoint: url.replace(baseUrl, "") }, err);
      }
    }
    if (groups) break;
  }

  if (!groups) {
    console.error("Failed to list groups using all endpoint/header variants", { instanceName });
    return null;
  }
  
  // Normalize for flexible matching: lowercase, remove accents
  const normalize = (s: string) =>
    String(s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const extractGroupName = (g: any): string => {
    return (
      g?.subject ||
      g?.name ||
      g?.groupName ||
      g?.group_name ||
      g?.groupSubject ||
      g?.group?.subject ||
      g?.group?.name ||
      g?.groupMetadata?.subject ||
      g?.groupMetadata?.name ||
      g?.metadata?.subject ||
      g?.metadata?.name ||
      ""
    );
  };

  const extractGroupId = (g: any): string => {
    // Cover common shapes across UAZAPI/Evolution builds
    return (
      g?.id ||
      g?.jid ||
      g?.groupId ||
      g?.groupJid ||
      g?.groupjid ||
      g?.group_jid ||
      g?.group?.id ||
      g?.group?.jid ||
      g?.groupMetadata?.id ||
      g?.groupMetadata?.jid ||
      g?.metadata?.id ||
      g?.metadata?.jid ||
      ""
    );
  };

  const targetName = normalize(groupName);

  // Debug: show sample shape (truncated) so we can adapt extractors when API changes
  console.log("Group list sample (first item):", JSON.stringify(groups[0] ?? null).substring(0, 800));
  console.log(
    "Available groups:",
    groups.map((g: any) => extractGroupName(g) || "(no name)").slice(0, 10),
  );

  // Try exact match first
  let found = groups.find((g: any) => normalize(extractGroupName(g)) === targetName);

  // If no exact match, try partial match (contains)
  if (!found) {
    found = groups.find((g: any) => {
      const n = normalize(extractGroupName(g));
      return n.includes(targetName) || targetName.includes(n);
    });
  }

  if (found) {
    const id = extractGroupId(found);
    const name = extractGroupName(found);

    // Prevent false positives (we can't update without an id/jid)
    if (!id) {
      console.error("Group matched by name but missing id/jid:", JSON.stringify(found).substring(0, 800));
      return null;
    }

    return { id, name };
  }
  
  return null;
}

// Context for GHL operations inside group commands
interface GhlContext {
  supabase: any;
  subaccount: any;
  settings: any;
  contactId?: string;
}

// Update GHL contact photo - tries multiple approaches
async function updateGhlContactPhoto(
  ctx: GhlContext,
  photoUrl: string,
): Promise<void> {
  if (!ctx.contactId || !ctx.settings?.ghl_client_id || !ctx.settings?.ghl_client_secret) {
    console.log("[GHL] Skipping contact photo update - missing context:", {
      hasContactId: !!ctx.contactId,
      hasClientId: !!ctx.settings?.ghl_client_id,
    });
    return;
  }

  try {
    const token = await getValidToken(ctx.supabase, ctx.subaccount, ctx.settings);
    if (!token) {
      console.error("[GHL] No valid token for photo update");
      return;
    }

    console.log("[GHL] Updating contact photo:", { contactId: ctx.contactId, photoUrl });

    // Approach 1: Try multipart upload by downloading image and uploading
    // First, download the image
    let imageBlob: Blob | null = null;
    try {
      const imgResponse = await fetch(photoUrl);
      if (imgResponse.ok) {
        imageBlob = await imgResponse.blob();
        console.log("[GHL] Downloaded image:", { size: imageBlob.size, type: imageBlob.type });
      }
    } catch (e) {
      console.log("[GHL] Failed to download image, will try direct URL approach:", e);
    }

    // If we got the image, try multipart upload to photo endpoint
    if (imageBlob && imageBlob.size > 0) {
      try {
        const formData = new FormData();
        formData.append("file", imageBlob, "group-photo.jpg");
        
        const uploadResponse = await fetchGHL(
          `https://services.leadconnectorhq.com/contacts/${ctx.contactId}/photo`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              Version: "2021-07-28",
            },
            body: formData,
          }
        );
        
        const uploadText = await uploadResponse.text();
        if (uploadResponse.ok) {
          console.log("[GHL] ✅ Contact photo uploaded successfully via multipart");
          return;
        } else {
          console.log("[GHL] Photo upload endpoint failed:", uploadResponse.status, uploadText.substring(0, 200));
        }
      } catch (e) {
        console.log("[GHL] Multipart upload failed:", e);
      }
    }

    // Approach 2: Try different field names in PUT /contacts
    const fieldAttempts = [
      { avatar: photoUrl },
      { profilePhoto: photoUrl },
      { photo: photoUrl },
      { profilePicture: photoUrl },
      { image: photoUrl },
    ];

    for (const fields of fieldAttempts) {
      try {
        const response = await fetchGHL(
          `https://services.leadconnectorhq.com/contacts/${ctx.contactId}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              Version: "2021-07-28",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(fields),
          }
        );

        const responseText = await response.text();
        const fieldName = Object.keys(fields)[0];
        
        if (response.ok) {
          // Check if the response contains the photo URL to confirm it worked
          if (responseText.includes(photoUrl.substring(0, 50)) || responseText.includes("avatar") || responseText.includes("photo")) {
            console.log(`[GHL] ✅ Contact photo updated successfully using field: ${fieldName}`);
            return;
          }
          console.log(`[GHL] Request succeeded but photo may not have updated (field: ${fieldName})`);
        } else {
          console.log(`[GHL] Field ${fieldName} failed:`, response.status);
        }
      } catch (e) {
        console.log(`[GHL] Error trying field:`, e);
      }
    }

    console.log("[GHL] ⚠️ Could not update contact photo - GHL may not support direct URL photo updates");

  } catch (e) {
    console.error("[GHL] Error updating contact photo:", e);
  }
}

// Update GHL contact name (firstName/lastName or name) for group sync
async function updateGhlContactName(
  ctx: GhlContext,
  newName: string,
): Promise<void> {
  if (!ctx.contactId || !ctx.settings?.ghl_client_id || !ctx.settings?.ghl_client_secret) {
    console.log("[GHL] Skipping contact name update - missing context:", {
      hasContactId: !!ctx.contactId,
      hasClientId: !!ctx.settings?.ghl_client_id,
    });
    return;
  }

  try {
    const token = await getValidToken(ctx.supabase, ctx.subaccount, ctx.settings);
    if (!token) {
      console.error("[GHL] No valid token for name update");
      return;
    }

    console.log("[GHL] Updating contact name:", { contactId: ctx.contactId, newName });

    // GHL contacts use firstName/lastName fields
    // For groups, we'll put the full group name in firstName and clear lastName
    // This matches how groups are typically displayed in GHL
    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/${ctx.contactId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Version: "2021-07-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: newName,
          lastName: "", // Clear lastName to show just the group name
        }),
      }
    );

    const responseText = await response.text();
    
    if (response.ok) {
      console.log("[GHL] ✅ Contact name updated successfully:", { newName });
    } else {
      console.log("[GHL] Failed to update contact name:", { 
        status: response.status, 
        body: responseText.substring(0, 300) 
      });
    }

  } catch (e) {
    console.error("[GHL] Error updating contact name:", e);
  }
}

// Send an outbound message to GHL (appears as "sent" in the conversation)
async function sendGhlOutboundMessage(
  ctx: GhlContext,
  message: string,
): Promise<void> {
  if (!ctx.contactId || !ctx.settings?.ghl_client_id || !ctx.settings?.ghl_client_secret) {
    console.log("[GHL] Skipping outbound message - missing context:", {
      hasContactId: !!ctx.contactId,
      hasClientId: !!ctx.settings?.ghl_client_id,
    });
    return;
  }

  try {
    const token = await getValidToken(ctx.supabase, ctx.subaccount, ctx.settings);
    if (!token) {
      console.error("[GHL] No valid token for outbound message");
      return;
    }

    console.log("[GHL] Sending outbound message:", { contactId: ctx.contactId, messagePreview: message.substring(0, 50) });

    const payload = {
      type: "SMS",
      contactId: ctx.contactId,
      message,
      status: "delivered",
    };

    const response = await fetchGHL(`https://services.leadconnectorhq.com/conversations/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-04-15",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    
    if (response.ok) {
      console.log("[GHL] ✅ Outbound message sent successfully:", responseText.substring(0, 200));
    } else {
      console.log("[GHL] Failed to send outbound message:", { 
        status: response.status, 
        body: responseText.substring(0, 300) 
      });
    }

  } catch (e) {
    console.error("[GHL] Error sending outbound message:", e);
  }
}

async function processGroupCommand(
  baseUrl: string,
  instanceToken: string,
  messageText: string,
  instanceName?: string,
  currentGroupJid?: string, // JID do grupo se a mensagem veio de dentro de um grupo
  ghlContext?: GhlContext, // Context for GHL operations
  targetPhone?: string, // Phone number of the contact (for non-group commands like #pix)
): Promise<GroupCommandResult> {
  const parsed = parseGroupCommand(messageText);
  if (!parsed) return { isCommand: false };
  
  const { command, params } = parsed;
  console.log("Processing group command:", { command, params });
  
  const validCommands = [
    "#criargrupo", "#removerdogrupo", "#addnogrupo", "#promoveradmin",
    "#revogaradmin", "#attfotogrupo", "#attnomegrupo", "#attdescricao",
    "#somenteadminmsg", "#msgliberada", "#somenteadminedit", "#editliberado", "#linkgrupo", "#sairgrupo",
    "#pix", "#botoes", "#lista", "#enquete",
    "#lista_menu", "#enquete_menu", "#carrossel",
    "#nome_perfil", "#foto_perfil"
  ];
  
  if (!validCommands.includes(command)) {
    return { isCommand: false };
  }

  // Commands that REQUIRE being sent from inside a group (except #criargrupo and #linkgrupo)
  const requiresGroupContext = [
    "#removerdogrupo", "#addnogrupo", "#promoveradmin", "#revogaradmin",
    "#attfotogrupo", "#attnomegrupo", "#attdescricao",
    "#somenteadminmsg", "#msgliberada", "#somenteadminedit", "#editliberado", "#sairgrupo"
  ];

  if (requiresGroupContext.includes(command) && !currentGroupJid) {
    return {
      isCommand: true,
      success: false,
      command,
      message: `⚠️ O comando ${command} deve ser enviado de DENTRO do grupo que você quer gerenciar.`
    };
  }
  
  try {
    switch (command) {
      case "#criargrupo": {
        // Novo formato: #criargrupo nome|telefone(s)|descrição(opcional)|urldafoto(opcional)
        // Mínimo: nome e pelo menos 1 telefone
        if (params.length < 2) {
          return { isCommand: true, success: false, command, message: "Formato: #criargrupo nome|+55...|descrição(opcional)|urldafoto(opcional)" };
        }
        
        const name = params[0];
        
        // Encontrar onde terminam os telefones e começam descrição/foto
        // Telefones começam com + ou são numéricos
        const phonePattern = /^[\+\d]/;
        let phoneEndIndex = 1;
        for (let i = 1; i < params.length; i++) {
          if (phonePattern.test(params[i].trim())) {
            phoneEndIndex = i + 1;
          } else {
            break;
          }
        }
        
        const phones = params.slice(1, phoneEndIndex);
        const description = params[phoneEndIndex] || null;
        const photoUrl = params[phoneEndIndex + 1] || null;
        
        const formattedParticipants = phones.map(p => p.replace(/\D/g, ""));
        
        console.log("Creating group with:", { name, phones, description, photoUrl, formattedParticipants });
        
        if (formattedParticipants.length === 0 || formattedParticipants.some(p => p.length < 10)) {
          return { isCommand: true, success: false, command, message: "Formato: #criargrupo nome|+55...|descrição(opcional)|urldafoto(opcional)" };
        }
        
        const createResponse = await fetch(`${baseUrl}/group/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": instanceToken },
          body: JSON.stringify({ name, participants: formattedParticipants }),
        });
        
        const createData = await createResponse.json();
        console.log("Group create response:", JSON.stringify(createData));
        
        if (!createResponse.ok) {
          return { isCommand: true, success: false, command, message: `Erro ao criar grupo: ${createData.message || createResponse.status}` };
        }
        
        const groupJid = createData.group?.JID || createData.id || createData.jid || createData.gid || createData.groupId || createData.group?.id;
        console.log("Group created with JID:", groupJid);
        
        if (!groupJid) {
          return { isCommand: true, success: true, command, message: `⚠️ Grupo criado mas JID não encontrado para aplicar configurações` };
        }
        
        await sleep(500);
        
        if (description) {
          console.log("Updating group description to:", description);
          const descResponse = await fetch(`${baseUrl}/group/updateDescription`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "token": instanceToken },
            body: JSON.stringify({ groupJid, description }),
          });
          console.log("Description update response:", descResponse.status, await descResponse.text());
        }
        
        if (photoUrl) {
          console.log("Updating group photo to:", photoUrl);
          await updateGroupPictureBestEffort(baseUrl, instanceToken, groupJid, photoUrl, instanceName);
        }
        
        await sleep(500);
        console.log("Sending confirmation message to group:", groupJid);
        await sendTextMessage(baseUrl, instanceToken, groupJid, "✅");
        
        // === CREATE GROUP CONTACT + CONVERSATION IN GHL ===
        // The ✅ sent via API has wasSentByApi=true and no track_id,
        // so webhook-inbound will discard it. We must create the GHL
        // contact and conversation directly here.
        if (ghlContext?.settings?.ghl_client_id && ghlContext?.subaccount?.ghl_access_token) {
          try {
            const ghlToken = await getValidToken(ghlContext.supabase, ghlContext.subaccount, ghlContext.settings);
            if (ghlToken) {
              // Extract group phone (first 11 digits of JID) - same logic as webhook-inbound
              const rawJid = groupJid.split("@")[0];
              const rawDigits = rawJid.replace(/\D/g, "");
              const groupPhone = rawDigits.slice(0, 11);
              const groupEmail = groupJid.includes("@g.us") ? groupJid : `${groupJid}@g.us`;
              const contactName = `👥 ${name}`;
              const ghlLocationId = ghlContext.subaccount.location_id;
              
              console.log("[GHL] Creating group contact:", { contactName, groupPhone, groupEmail, locationId: ghlLocationId });
              
              // Search for existing contact
              const searchRes = await fetchGHL(
                `https://services.leadconnectorhq.com/contacts/?locationId=${ghlLocationId}&query=${groupPhone}`,
                {
                  headers: {
                    "Authorization": `Bearer ${ghlToken}`,
                    "Version": "2021-07-28",
                    "Accept": "application/json",
                  },
                }
              );
              
              let ghlContactId = "";
              if (searchRes.ok) {
                const searchData = await searchRes.json();
                if (searchData.contacts?.length > 0) {
                  ghlContactId = searchData.contacts[0].id;
                  console.log("[GHL] Found existing group contact:", ghlContactId);
                  // Update email if needed
                  if (!searchData.contacts[0].email) {
                    await fetchGHL(`https://services.leadconnectorhq.com/contacts/${ghlContactId}`, {
                      method: "PUT",
                      headers: {
                        "Authorization": `Bearer ${ghlToken}`,
                        "Version": "2021-07-28",
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({ email: groupEmail }),
                    });
                  }
                }
              }
              
              // Create contact if not found
              if (!ghlContactId) {
                const createRes = await fetchGHL("https://services.leadconnectorhq.com/contacts/", {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${ghlToken}`,
                    "Version": "2021-07-28",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                  },
                  body: JSON.stringify({
                    firstName: contactName,
                    phone: `+${groupPhone}`,
                    email: groupEmail,
                    locationId: ghlLocationId,
                    source: "WhatsApp Integration",
                  }),
                });
                
                if (createRes.ok) {
                  const createData = await createRes.json();
                  ghlContactId = createData.contact?.id || "";
                  console.log("[GHL] Created group contact:", ghlContactId);
                } else {
                  const errText = await createRes.text();
                  console.error("[GHL] Failed to create group contact:", errText.substring(0, 300));
                  // Try to extract contactId from duplicate error
                  try {
                    const parsed = JSON.parse(errText);
                    if (parsed?.meta?.contactId) {
                      ghlContactId = parsed.meta.contactId;
                      console.log("[GHL] Reusing duplicate contact:", ghlContactId);
                    }
                  } catch { /* ignore */ }
                }
              }
              
              // Send ✅ as inbound message to create the conversation
              if (ghlContactId) {
                const msgRes = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages/inbound", {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${ghlToken}`,
                    "Version": "2021-04-15",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                  },
                  body: JSON.stringify({
                    type: "SMS",
                    contactId: ghlContactId,
                    message: "✅",
                  }),
                });
                
                const msgText = await msgRes.text();
                if (msgRes.ok) {
                  console.log("[GHL] ✅ Group conversation created with ✅ message:", msgText.substring(0, 200));
                } else {
                  console.error("[GHL] Failed to send ✅ to GHL:", msgText.substring(0, 300));
                }
                
                // Save phone mapping for future routing
                await ghlContext.supabase
                  .from("ghl_contact_phone_mapping")
                  .upsert({
                    contact_id: ghlContactId,
                    location_id: ghlLocationId,
                    original_phone: groupEmail, // Store full JID for group routing
                  }, { onConflict: "contact_id,location_id" })
                  .then(({ error }: any) => {
                    if (error) console.error("[GHL] Failed to save phone mapping:", error);
                    else console.log("[GHL] Phone mapping saved for group contact");
                  });
              }
            }
          } catch (e) {
            console.error("[GHL] Error creating group conversation in GHL:", e);
            // Non-critical - group was still created on WhatsApp
          }
        }
        
        return { isCommand: true, success: true, command, message: `Grupo "${name}" criado com sucesso!` };
      }
      
      case "#removerdogrupo": {
        // Formato: #removerdogrupo telefone (enviado dentro do grupo)
        if (params.length < 1) {
          return { isCommand: true, success: false, command, message: "Formato: #removerdogrupo telefone (envie dentro do grupo)" };
        }
        const cleanPhoneRemove = params[0].replace(/\D/g, "");
        const groupForRemove = currentGroupJid?.includes("@g.us")
          ? currentGroupJid
          : `${currentGroupJid}@g.us`;
        
        console.log("Removing participant from group:", {
          url: `${baseUrl}/group/updateParticipants`,
          groupjid: groupForRemove,
          action: "remove",
          participants: [cleanPhoneRemove],
        });
        
        const removeRes = await fetch(`${baseUrl}/group/updateParticipants`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": instanceToken },
          body: JSON.stringify({ 
            groupjid: groupForRemove, 
            action: "remove",
            participants: [cleanPhoneRemove] 
          }),
        });
        const removeText = await removeRes.text();
        console.log("Remove participant response:", { status: removeRes.status, body: removeText.substring(0, 500) });
        
        if (!removeRes.ok) {
          return { isCommand: true, success: false, command, message: `Erro ao remover membro: ${removeText.substring(0, 100)}` };
        }
        
        return { isCommand: true, success: true, command, message: `Membro ${params[0]} removido do grupo` };
      }
      
      case "#addnogrupo": {
        // Formato: #addnogrupo telefone (enviado dentro do grupo)
        if (params.length < 1) {
          return { isCommand: true, success: false, command, message: "Formato: #addnogrupo telefone (envie dentro do grupo)" };
        }
        const cleanPhoneAdd = params[0].replace(/\D/g, "");
        const groupForAdd = currentGroupJid?.includes("@g.us")
          ? currentGroupJid
          : `${currentGroupJid}@g.us`;
        
        console.log("Adding participant to group:", {
          url: `${baseUrl}/group/updateParticipants`,
          groupjid: groupForAdd,
          action: "add",
          participants: [cleanPhoneAdd],
        });
        
        const addRes = await fetch(`${baseUrl}/group/updateParticipants`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": instanceToken },
          body: JSON.stringify({ 
            groupjid: groupForAdd, 
            action: "add",
            participants: [cleanPhoneAdd] 
          }),
        });
        const addText = await addRes.text();
        console.log("Add participant response:", { status: addRes.status, body: addText.substring(0, 500) });
        
        if (!addRes.ok) {
          return { isCommand: true, success: false, command, message: `Erro ao adicionar membro: ${addText.substring(0, 100)}` };
        }
        
        return { isCommand: true, success: true, command, message: `Membro ${params[0]} adicionado ao grupo` };
      }
      
      case "#promoveradmin": {
        // Formato: #promoveradmin telefone (enviado dentro do grupo)
        if (params.length < 1) {
          return { isCommand: true, success: false, command, message: "Formato: #promoveradmin telefone (envie dentro do grupo)" };
        }
        const cleanPhone = params[0].replace(/\D/g, "");
        const currentGroup = currentGroupJid?.includes("@g.us")
          ? currentGroupJid
          : `${currentGroupJid}@g.us`;
        
        // PRIMARY: n8n confirmed working endpoint - POST /group/updateParticipants with groupjid (lowercase)
        // This is the UAZAPI v2 style that works
        let promoteSuccess = false;
        
        try {
          console.log("Trying primary promote endpoint (updateParticipants):", {
            url: `${baseUrl}/group/updateParticipants`,
            groupjid: currentGroup,
            action: "promote",
            participants: [cleanPhone],
          });
          
          const res = await fetch(`${baseUrl}/group/updateParticipants`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instanceToken },
            body: JSON.stringify({
              groupjid: currentGroup,
              action: "promote",
              participants: [cleanPhone],
            }),
          });
          const text = await res.text();
          console.log("Primary promote response:", { status: res.status, body: text.substring(0, 500) });
          
          if (res.ok) {
            promoteSuccess = true;
          }
        } catch (e) {
          console.log("Primary promote error:", e);
        }
        
        // FALLBACK: Try legacy endpoints if primary fails
        if (!promoteSuccess) {
          const participantJid = `${cleanPhone}@s.whatsapp.net`;
          
          const fallbackEndpoints = [
            `${baseUrl}/group/promoteParticipant`,
            `${baseUrl}/group/promote`,
            instanceName ? `${baseUrl}/group/promoteParticipant/${instanceName}` : null,
          ].filter(Boolean) as string[];
          
          const fallbackPayloads = [
            { groupjid: currentGroup, participants: [cleanPhone] },
            { groupId: currentGroup, participants: [participantJid] },
            { groupJid: currentGroup, participants: [participantJid] },
          ];
          
          for (const url of fallbackEndpoints) {
            for (const payload of fallbackPayloads) {
              try {
                const res = await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", token: instanceToken },
                  body: JSON.stringify(payload),
                });
                const text = await res.text();
                console.log("Fallback promote attempt:", {
                  endpoint: url.replace(baseUrl, ""),
                  payloadKeys: Object.keys(payload),
                  status: res.status,
                  body: text.substring(0, 200),
                });
                
                if (res.ok) {
                  promoteSuccess = true;
                  break;
                }
              } catch (e) {
                console.log("Fallback promote error:", e);
              }
            }
            if (promoteSuccess) break;
          }
        }
        
        if (!promoteSuccess) {
          return { isCommand: true, success: false, command, message: `❌ Erro ao promover ${params[0]} a admin` };
        }
        
        return { isCommand: true, success: true, command, message: `Membro ${params[0]} promovido a admin` };
      }
      
      case "#revogaradmin": {
        // Formato: #revogaradmin telefone (enviado dentro do grupo)
        if (params.length < 1) {
          return { isCommand: true, success: false, command, message: "Formato: #revogaradmin telefone (envie dentro do grupo)" };
        }
        const cleanPhoneDemote = params[0].replace(/\D/g, "");
        const currentGroupDemote = currentGroupJid?.includes("@g.us")
          ? currentGroupJid
          : `${currentGroupJid}@g.us`;
        
        // PRIMARY: n8n confirmed working endpoint - POST /group/updateParticipants with groupjid (lowercase)
        let demoteSuccess = false;
        
        try {
          console.log("Trying primary demote endpoint (updateParticipants):", {
            url: `${baseUrl}/group/updateParticipants`,
            groupjid: currentGroupDemote,
            action: "demote",
            participants: [cleanPhoneDemote],
          });
          
          const res = await fetch(`${baseUrl}/group/updateParticipants`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instanceToken },
            body: JSON.stringify({
              groupjid: currentGroupDemote,
              action: "demote",
              participants: [cleanPhoneDemote],
            }),
          });
          const text = await res.text();
          console.log("Primary demote response:", { status: res.status, body: text.substring(0, 500) });
          
          if (res.ok) {
            demoteSuccess = true;
          }
        } catch (e) {
          console.log("Primary demote error:", e);
        }
        
        // FALLBACK: Try legacy endpoints if primary fails
        if (!demoteSuccess) {
          const demoteJid = `${cleanPhoneDemote}@s.whatsapp.net`;
          
          const fallbackEndpoints = [
            `${baseUrl}/group/demoteParticipant`,
            `${baseUrl}/group/demote`,
            instanceName ? `${baseUrl}/group/demoteParticipant/${instanceName}` : null,
          ].filter(Boolean) as string[];
          
          const fallbackPayloads = [
            { groupjid: currentGroupDemote, participants: [cleanPhoneDemote] },
            { groupId: currentGroupDemote, participants: [demoteJid] },
            { groupJid: currentGroupDemote, participants: [demoteJid] },
          ];
          
          for (const url of fallbackEndpoints) {
            for (const payload of fallbackPayloads) {
              try {
                const res = await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", token: instanceToken },
                  body: JSON.stringify(payload),
                });
                const text = await res.text();
                console.log("Fallback demote attempt:", {
                  endpoint: url.replace(baseUrl, ""),
                  payloadKeys: Object.keys(payload),
                  status: res.status,
                  body: text.substring(0, 200),
                });
                
                if (res.ok) {
                  demoteSuccess = true;
                  break;
                }
              } catch (e) {
                console.log("Fallback demote error:", e);
              }
            }
            if (demoteSuccess) break;
          }
        }
        
        if (!demoteSuccess) {
          return { isCommand: true, success: false, command, message: `❌ Erro ao revogar admin de ${params[0]}` };
        }
        
        return { isCommand: true, success: true, command, message: `Admin ${params[0]} rebaixado a membro` };
      }
      
      case "#attfotogrupo": {
        // Formato: #attfotogrupo url (enviado dentro do grupo)
        if (params.length < 1) {
          return { isCommand: true, success: false, command, message: "Formato: #attfotogrupo url_da_foto (envie dentro do grupo)" };
        }
        const imageUrl = params[0];
        console.log("Updating group photo (contextual):", { groupJid: currentGroupJid, imageUrl });
        
        // 1. Update WhatsApp group photo
        await updateGroupPictureBestEffort(baseUrl, instanceToken, currentGroupJid!, imageUrl, instanceName);
        
        // 2. Also update GHL contact photo (syncs immediately)
        if (ghlContext) {
          await updateGhlContactPhoto(ghlContext, imageUrl);
        }
        
        return { isCommand: true, success: true, command, message: `Foto do grupo atualizada!` };
      }
      
      case "#attnomegrupo": {
        // Formato: #attnomegrupo novo_nome (enviado dentro do grupo)
        if (params.length < 1) {
          return { isCommand: true, success: false, command, message: "Formato: #attnomegrupo novo_nome (envie dentro do grupo)" };
        }
        const newSubject = params.join("|"); // Allow | in name
        
        // 1. Update WhatsApp group name
        await updateGroupSubjectBestEffort(baseUrl, instanceToken, currentGroupJid!, newSubject, instanceName);
        
        // 2. Sync with GHL contact name
        if (ghlContext) {
          await updateGhlContactName(ghlContext, newSubject);
        }
        
        return { isCommand: true, success: true, command, message: `Nome do grupo alterado para "${newSubject}"` };
      }
      
      case "#attdescricao": {
        // Formato: #attdescricao nova_descricao (enviado dentro do grupo)
        if (params.length < 1) {
          return { isCommand: true, success: false, command, message: "Formato: #attdescricao nova_descricao (envie dentro do grupo)" };
        }
        const newDescription = params.join("|"); // Allow | in description
        
        // Try multiple endpoint/payload combinations (UAZAPI v2 style)
        let descUpdateSuccess = false;
        const descEndpoints = [
          { url: `${baseUrl}/group/updateDescription`, body: { groupjid: currentGroupJid, description: newDescription } },
          { url: `${baseUrl}/group/updateDescription`, body: { groupId: currentGroupJid, description: newDescription } },
          { url: `${baseUrl}/group/updateGroupDescription`, body: { groupjid: currentGroupJid, description: newDescription } },
          { url: `${baseUrl}/group/updateGroupDescription`, body: { groupId: currentGroupJid, description: newDescription } },
        ];
        
        for (const attempt of descEndpoints) {
          if (descUpdateSuccess) break;
          for (const method of ["POST", "PUT"] as const) {
            try {
              console.log("Trying description update:", { url: attempt.url, method, body: attempt.body });
              const res = await fetch(attempt.url, {
                method,
                headers: { "Content-Type": "application/json", token: instanceToken },
                body: JSON.stringify(attempt.body),
              });
              const resText = await res.text();
              console.log("Description update response:", { status: res.status, body: resText.substring(0, 200) });
              if (res.ok) {
                descUpdateSuccess = true;
                break;
              }
            } catch (e) {
              console.log("Description update error:", e);
            }
          }
        }
        
        if (descUpdateSuccess) {
          return { isCommand: true, success: true, command, message: `Descrição do grupo atualizada` };
        } else {
          return { isCommand: true, success: false, command, message: `Falha ao atualizar descrição do grupo` };
        }
      }
      
      case "#somenteadminmsg": {
        // Formato: #somenteadminmsg (enviado dentro do grupo)
        // UAZAPI v2: POST /group/updateAnnounce with { groupjid, announce: true }
        console.log("Executing #somenteadminmsg with updateAnnounce endpoint");
        const announceRes = await fetch(`${baseUrl}/group/updateAnnounce`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": instanceToken },
          body: JSON.stringify({ groupjid: currentGroupJid, announce: true }),
        });
        const announceText = await announceRes.text();
        console.log("updateAnnounce response:", { status: announceRes.status, body: announceText.substring(0, 200) });
        if (announceRes.ok) {
          return { isCommand: true, success: true, command, message: `Apenas admins podem enviar mensagens neste grupo` };
        } else {
          return { isCommand: true, success: false, command, message: `Falha ao restringir mensagens (${announceRes.status})` };
        }
      }
      
      case "#msgliberada": {
        // Formato: #msgliberada (enviado dentro do grupo)
        // UAZAPI v2: POST /group/updateAnnounce with { groupjid, announce: false }
        console.log("Executing #msgliberada with updateAnnounce endpoint");
        const unannounceRes = await fetch(`${baseUrl}/group/updateAnnounce`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": instanceToken },
          body: JSON.stringify({ groupjid: currentGroupJid, announce: false }),
        });
        const unannounceText = await unannounceRes.text();
        console.log("updateAnnounce (false) response:", { status: unannounceRes.status, body: unannounceText.substring(0, 200) });
        if (unannounceRes.ok) {
          return { isCommand: true, success: true, command, message: `Todos podem enviar mensagens neste grupo` };
        } else {
          return { isCommand: true, success: false, command, message: `Falha ao liberar mensagens (${unannounceRes.status})` };
        }
      }
      
      case "#somenteadminedit": {
        // Formato: #somenteadminedit (enviado dentro do grupo)
        // UAZAPI v2: POST /group/updateLocked with { groupjid, locked: true }
        console.log("Executing #somenteadminedit with updateLocked endpoint");
        const lockRes = await fetch(`${baseUrl}/group/updateLocked`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": instanceToken },
          body: JSON.stringify({ groupjid: currentGroupJid, locked: true }),
        });
        const lockText = await lockRes.text();
        console.log("updateLocked response:", { status: lockRes.status, body: lockText.substring(0, 200) });
        if (lockRes.ok) {
          return { isCommand: true, success: true, command, message: `Apenas admins podem editar este grupo` };
        } else {
          return { isCommand: true, success: false, command, message: `Falha ao restringir edição (${lockRes.status})` };
        }
      }
      
      case "#editliberado": {
        // Formato: #editliberado (enviado dentro do grupo)
        // UAZAPI v2: POST /group/updateLocked with { groupjid, locked: false }
        console.log("Executing #editliberado with updateLocked endpoint");
        const unlockRes = await fetch(`${baseUrl}/group/updateLocked`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": instanceToken },
          body: JSON.stringify({ groupjid: currentGroupJid, locked: false }),
        });
        const unlockText = await unlockRes.text();
        console.log("updateLocked response:", { status: unlockRes.status, body: unlockText.substring(0, 200) });
        if (unlockRes.ok) {
          return { isCommand: true, success: true, command, message: `Todos podem editar este grupo` };
        } else {
          return { isCommand: true, success: false, command, message: `Falha ao liberar edição (${unlockRes.status})` };
        }
      }
      
      case "#linkgrupo": {
        // Formato: #linkgrupo telefone (enviado dentro do grupo - usa currentGroupJid)
        // Se fora do grupo: #linkgrupo nome_grupo|telefone
        let groupIdForLink = currentGroupJid;
        let phoneParam = params[0];

        if (!currentGroupJid) {
          // Fora do grupo - precisa nome|telefone
          if (params.length < 2) {
            return { isCommand: true, success: false, command, message: "Formato fora do grupo: #linkgrupo nome_grupo|telefone" };
          }
          const group = await findGroupByName(baseUrl, instanceToken, params[0], instanceName);
          if (!group) return { isCommand: true, success: false, command, message: `Grupo "${params[0]}" não encontrado` };
          groupIdForLink = group.id;
          phoneParam = params[1];
        } else {
          // Dentro do grupo - só telefone
          if (params.length < 1) {
            return { isCommand: true, success: false, command, message: "Formato: #linkgrupo telefone (envie dentro do grupo)" };
          }
        }
        
        // Ensure groupJid has @g.us suffix
        const normalizedGroupId = groupIdForLink?.includes("@g.us") 
          ? groupIdForLink 
          : `${groupIdForLink}@g.us`;
        
        console.log("Getting invite link for group:", normalizedGroupId);
        
        let inviteLink: string | null = null;

        // PRIMARY: Use /group/info with getInviteLink (n8n confirmed working - returns invite_link field)
        try {
          console.log("Trying PRIMARY /group/info with getInviteLink:", {
            url: `${baseUrl}/group/info`,
            groupjid: normalizedGroupId,
          });
          
          const infoResponse = await fetch(`${baseUrl}/group/info`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "token": instanceToken },
            body: JSON.stringify({ 
              groupjid: normalizedGroupId, 
              getInviteLink: true,
              getRequestsParticipants: false,
              force: false 
            }),
          });
          
          const infoText = await infoResponse.text();
          console.log("group/info response:", { status: infoResponse.status, body: infoText.substring(0, 800) });
          
          if (infoResponse.ok) {
            try {
              const infoData = JSON.parse(infoText);
              // Handle array response (n8n shows it returns an array)
              const groupData = Array.isArray(infoData) ? infoData[0] : infoData;
              
              // Extract invite_link directly from the response
              if (groupData?.invite_link) {
                inviteLink = groupData.invite_link;
                console.log("Found invite_link in response:", inviteLink);
              } else if (groupData?.inviteLink) {
                inviteLink = groupData.inviteLink;
                console.log("Found inviteLink in response:", inviteLink);
              } else if (groupData?.inviteCode) {
                inviteLink = `https://chat.whatsapp.com/${groupData.inviteCode}`;
                console.log("Built link from inviteCode:", inviteLink);
              }
            } catch (e) {
              console.log("Failed to parse group/info response:", e);
            }
          }
        } catch (e) {
          console.log("group/info error:", e);
        }
        
        // FALLBACK: Try inviteCode endpoint with multiple method/path variants
        if (!inviteLink) {
          console.log("Primary failed, trying fallback inviteCode endpoints");
          
          const extractInviteCodeBestEffort = (raw: string): string | null => {
            // 1) Direct URL in any response
            const urlMatch = raw.match(/https?:\/\/chat\.whatsapp\.com\/([A-Za-z0-9]{10,})/);
            if (urlMatch?.[0]) return urlMatch[0]; // Return full URL

            // 2) Common JSON fields
            try {
              const data = JSON.parse(raw);
              const candidates: unknown[] = [
                data?.code,
                data?.inviteCode,
                data?.invite_link,
                data?.inviteLink,
                data?.inviteUrl,
                data?.invite,
                data?.data?.code,
                data?.data?.inviteCode,
                data?.data?.inviteLink,
                data?.data?.inviteUrl,
                data?.data?.invite,
              ];

              for (const c of candidates) {
                if (typeof c !== "string") continue;
                if (c.startsWith("https://chat.whatsapp.com/")) return c;
                if (c.length >= 10) return `https://chat.whatsapp.com/${c}`;
              }
            } catch {
              // ignore
            }

            return null;
          };

          const inviteAttempts: Array<{
            label: string;
            url: string;
            method: "GET" | "POST" | "PUT";
            body?: unknown;
          }> = [
            { label: "inviteCode:POST", url: `${baseUrl}/group/inviteCode`, method: "POST", body: { groupjid: normalizedGroupId } },
            { label: "inviteCode:PUT", url: `${baseUrl}/group/inviteCode`, method: "PUT", body: { groupjid: normalizedGroupId } },
            { label: "inviteCode:GET?groupjid", url: `${baseUrl}/group/inviteCode?groupjid=${encodeURIComponent(normalizedGroupId)}`, method: "GET" },
          ];

          for (const attempt of inviteAttempts) {
            if (inviteLink) break;
            try {
              const res = await fetch(attempt.url, {
                method: attempt.method,
                headers: {
                  ...(attempt.method !== "GET" ? { "Content-Type": "application/json" } : {}),
                  token: instanceToken,
                },
                ...(attempt.method !== "GET" ? { body: JSON.stringify(attempt.body ?? {}) } : {}),
              });
              const text = await res.text();
              console.log("Invite attempt response:", {
                label: attempt.label,
                status: res.status,
                body: text.substring(0, 500),
              });
              if (res.ok) {
                inviteLink = extractInviteCodeBestEffort(text);
              }
            } catch (e) {
              console.log("Invite attempt error:", { label: attempt.label, error: String(e) });
            }
          }
        }
        
        if (!inviteLink) {
          return { isCommand: true, success: false, command, message: `Não foi possível obter o link do grupo` };
        }
        
        const cleanPhone = phoneParam.replace(/\D/g, "");
        
        console.log("Sending invite link to:", cleanPhone, "link:", inviteLink);
        await fetch(`${baseUrl}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": instanceToken },
          body: JSON.stringify({ number: cleanPhone, text: `📎 Link do grupo:\n${inviteLink}` }),
        });
        
        return { isCommand: true, success: true, command, message: `Link do grupo enviado para ${phoneParam}` };
      }
      
      case "#pix": {
        // Formato: #pix pixType|pixKey|pixName
        // Enviado no chat de um contato - envia botão PIX via UAZAPI
        if (params.length < 3) {
          return { isCommand: true, success: false, command, message: "Formato: #pix tipo|chave|nome\nTipos: EVP, CPF, CNPJ, PHONE, EMAIL" };
        }
        
        const pixType = params[0].toUpperCase().trim();
        const pixKey = params[1].trim();
        const pixName = params[2].trim();
        
        const validPixTypes = ["EVP", "CPF", "CNPJ", "PHONE", "EMAIL"];
        if (!validPixTypes.includes(pixType)) {
          return { isCommand: true, success: false, command, message: `Tipo PIX inválido: "${pixType}". Use: ${validPixTypes.join(", ")}` };
        }
        
        if (!targetPhone) {
          return { isCommand: true, success: false, command, message: "Erro: número do contato não encontrado" };
        }
        
        const pixPhone = targetPhone.replace(/\D/g, "");
        console.log("Sending PIX button:", { pixType, pixKey, pixName, phone: pixPhone });
        
        try {
          const pixRes = await fetch(`${baseUrl}/send/pix-button`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "token": instanceToken,
            },
            body: JSON.stringify({
              number: pixPhone,
              pixType,
              pixKey,
              pixName,
            }),
          });
          
          const pixText = await pixRes.text();
          console.log("PIX button response:", { status: pixRes.status, body: pixText.substring(0, 300) });
          
          if (pixRes.ok) {
            return { isCommand: true, success: true, command, message: `Botão PIX enviado para ${pixPhone} (${pixName})` };
          } else {
            return { isCommand: true, success: false, command, message: `Falha ao enviar botão PIX (${pixRes.status}): ${pixText.substring(0, 100)}` };
          }
        } catch (e) {
          return { isCommand: true, success: false, command, message: `Erro ao enviar PIX: ${e instanceof Error ? e.message : "Falha"}` };
        }
      }

      case "#botoes": {
        // UAZAPI /send/menu with type: "button"
        // Formato: #botoes texto|rodapé|Btn1,Btn2|url,Btn3|call:num
        // Buttons can contain | for types: label|url, label|copy:val, label|call:num
        if (params.length < 2) {
          return { isCommand: true, success: false, command, message: "Formato: #botoes texto|botão1,botão2,botão3" };
        }
        
        if (!targetPhone) {
          return { isCommand: true, success: false, command, message: "Erro: número do contato não encontrado" };
        }
        
        const btnPhone = targetPhone.replace(/\D/g, "");
        
        // Rejoin all params since buttons may contain | for types (url, copy, call)
        const btnFullStr = params.join("|");
        
        // Split by comma to find button boundaries
        const btnFirstComma = btnFullStr.indexOf(",");
        let btnHeaderAndFirst: string;
        let btnRemaining: string[];
        
        if (btnFirstComma === -1) {
          btnHeaderAndFirst = btnFullStr;
          btnRemaining = [];
        } else {
          btnHeaderAndFirst = btnFullStr.substring(0, btnFirstComma);
          btnRemaining = btnFullStr.substring(btnFirstComma + 1).split(",").map(s => s.trim()).filter(s => s.length > 0);
        }
        
        // Parse header: texto | [rodapé] | firstButton [|typeValue]
        const btnHeaderTokens = btnHeaderAndFirst.split("|");
        let btnText: string;
        let btnFooter = "";
        let firstButton: string;
        
        const btnLastTok = btnHeaderTokens[btnHeaderTokens.length - 1].trim();
        const btnIsType = btnLastTok.startsWith("http://") || btnLastTok.startsWith("https://") || btnLastTok.startsWith("copy:") || btnLastTok.startsWith("call:");
        
        if (btnIsType && btnHeaderTokens.length >= 3) {
          // Last token is a type value, second-to-last is button label
          firstButton = btnHeaderTokens[btnHeaderTokens.length - 2].trim() + "|" + btnLastTok;
          const btnRest = btnHeaderTokens.slice(0, -2);
          btnText = btnRest[0] || "";
          btnFooter = btnRest.length >= 2 ? btnRest[1] : "";
        } else {
          firstButton = btnLastTok;
          const btnRest = btnHeaderTokens.slice(0, -1);
          btnText = btnRest[0] || "";
          btnFooter = btnRest.length >= 2 ? btnRest[1] : "";
        }
        
        const btnChoices = [firstButton, ...btnRemaining].slice(0, 3);
        
        const btnPayload: Record<string, unknown> = {
          number: btnPhone,
          type: "button",
          text: btnText,
          choices: btnChoices,
          readchat: true,
        };
        if (btnFooter) btnPayload.footerText = btnFooter;
        
        console.log("Sending buttons (UAZAPI):", JSON.stringify(btnPayload));
        
        try {
          const btnRes = await fetch(`${baseUrl}/send/menu`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instanceToken },
            body: JSON.stringify(btnPayload),
          });
          const btnBody = await btnRes.text();
          console.log("Buttons response:", { status: btnRes.status, body: btnBody.substring(0, 300) });
          
          if (btnRes.ok) {
            return { isCommand: true, success: true, command, message: `Botões enviados para ${btnPhone}` };
          }
          return { isCommand: true, success: false, command, message: `Falha ao enviar botões (${btnRes.status}): ${btnBody.substring(0, 100)}` };
        } catch (e) {
          return { isCommand: true, success: false, command, message: `Erro ao enviar botões: ${e instanceof Error ? e.message : "Falha"}` };
        }
      }

      case "#lista": {
        // UAZAPI /send/menu with type: "list"
        // Formato: #lista texto|textoBotão|[Seção1],item1,item2|[Seção2],itemA,itemB
        // choices: ["[Seção]", "texto|id|descrição"]
        if (params.length < 3) {
          return { isCommand: true, success: false, command, message: "Formato: #lista texto|textoBotão|[Seção],item1,item2" };
        }
        
        if (!targetPhone) {
          return { isCommand: true, success: false, command, message: "Erro: número do contato não encontrado" };
        }
        
        const listPhone = targetPhone.replace(/\D/g, "");
        const listText = params[0].trim();
        const listButton = params[1].trim();
        // Remaining params form the choices array
        // Each param can be a section header "[Title]" or items separated by commas
        const listChoices: string[] = [];
        for (let li = 2; li < params.length; li++) {
          const part = params[li].trim();
          // If contains commas, split into individual items
          const subItems = part.split(",").map(s => s.trim()).filter(s => s.length > 0);
          for (const si of subItems) {
            listChoices.push(si);
          }
        }
        
        const listPayload: Record<string, unknown> = {
          number: listPhone,
          type: "list",
          text: listText,
          listButton,
          choices: listChoices,
          readchat: true,
        };
        
        console.log("Sending list (UAZAPI):", JSON.stringify(listPayload));
        
        try {
          const listRes = await fetch(`${baseUrl}/send/menu`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instanceToken },
            body: JSON.stringify(listPayload),
          });
          const listBody = await listRes.text();
          console.log("List response:", { status: listRes.status, body: listBody.substring(0, 300) });
          
          if (listRes.ok) {
            return { isCommand: true, success: true, command, message: `Lista enviada para ${listPhone}` };
          }
          return { isCommand: true, success: false, command, message: `Falha ao enviar lista (${listRes.status}): ${listBody.substring(0, 100)}` };
        } catch (e) {
          return { isCommand: true, success: false, command, message: `Erro ao enviar lista: ${e instanceof Error ? e.message : "Falha"}` };
        }
      }

      case "#enquete": {
        // UAZAPI /send/menu with type: "poll"
        // Formato: #enquete pergunta|opção1|opção2|opção3...
        // choices: ["opção1", "opção2", ...]
        if (params.length < 3) {
          return { isCommand: true, success: false, command, message: "Formato: #enquete pergunta|opção1|opção2|opção3... (mín. 2 opções)" };
        }
        
        if (!targetPhone) {
          return { isCommand: true, success: false, command, message: "Erro: número do contato não encontrado" };
        }
        
        const pollPhone = targetPhone.replace(/\D/g, "");
        const pollText = params[0].trim();
        const pollChoices = params.slice(1).map(o => o.trim());
        
        const pollPayload = {
          number: pollPhone,
          type: "poll",
          text: pollText,
          choices: pollChoices,
          selectableCount: 1,
          readchat: true,
        };
        
        console.log("Sending poll (UAZAPI):", JSON.stringify(pollPayload));
        
        try {
          const pollRes = await fetch(`${baseUrl}/send/menu`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instanceToken },
            body: JSON.stringify(pollPayload),
          });
          const pollBody = await pollRes.text();
          console.log("Poll response:", { status: pollRes.status, body: pollBody.substring(0, 300) });
          
          if (pollRes.ok) {
            return { isCommand: true, success: true, command, message: `Enquete enviada para ${pollPhone}` };
          }
          return { isCommand: true, success: false, command, message: `Falha ao enviar enquete (${pollRes.status}): ${pollBody.substring(0, 100)}` };
        } catch (e) {
          return { isCommand: true, success: false, command, message: `Erro ao enviar enquete: ${e instanceof Error ? e.message : "Falha"}` };
        }
      }
      
      case "#lista_menu": {
        // UAZAPI /send/menu with type: "list"
        // Formato: #lista_menu texto|rodapé|textoBotão|[Seção],item|id|desc,...
        if (params.length < 4) {
          return { isCommand: true, success: false, command, message: "Formato: #lista_menu texto|rodapé|textoBotão|[Seção],item|id|desc,..." };
        }

        if (!targetPhone) {
          return { isCommand: true, success: false, command, message: "Erro: número do contato não encontrado" };
        }

        const lmPhone = targetPhone.replace(/\D/g, "");
        const lmText = params[0].trim();
        const lmFooter = params[1].trim();
        const lmButton = params[2].trim();
        const lmChoices: string[] = [];
        for (let i = 3; i < params.length; i++) {
          const part = params[i].trim();
          const subItems = part.split(",").map(s => s.trim()).filter(s => s.length > 0);
          for (const si of subItems) {
            lmChoices.push(si);
          }
        }

        const lmPayload: Record<string, unknown> = {
          number: lmPhone,
          type: "list",
          text: lmText,
          footerText: lmFooter,
          listButton: lmButton,
          selectableCount: 1,
          choices: lmChoices,
          readchat: true,
        };

        console.log("Sending list_menu (UAZAPI):", JSON.stringify(lmPayload));

        try {
          const lmRes = await fetch(`${baseUrl}/send/menu`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instanceToken },
            body: JSON.stringify(lmPayload),
          });
          const lmBody = await lmRes.text();
          console.log("list_menu response:", { status: lmRes.status, body: lmBody.substring(0, 300) });

          if (lmRes.ok) {
            return { isCommand: true, success: true, command, message: `Menu lista enviado para ${lmPhone}` };
          }
          return { isCommand: true, success: false, command, message: `Falha ao enviar menu lista (${lmRes.status}): ${lmBody.substring(0, 100)}` };
        } catch (e) {
          return { isCommand: true, success: false, command, message: `Erro ao enviar menu lista: ${e instanceof Error ? e.message : "Falha"}` };
        }
      }

      case "#enquete_menu": {
        // UAZAPI /send/menu with type: "poll"
        // Formato: #enquete_menu pergunta|opção1|opção2|opção3
        if (params.length < 3) {
          return { isCommand: true, success: false, command, message: "Formato: #enquete_menu pergunta|opção1|opção2|opção3... (mín. 2 opções)" };
        }

        if (!targetPhone) {
          return { isCommand: true, success: false, command, message: "Erro: número do contato não encontrado" };
        }

        const emPhone = targetPhone.replace(/\D/g, "");
        const emText = params[0].trim();
        const emChoices = params.slice(1).map(o => o.trim());

        const emPayload = {
          number: emPhone,
          type: "poll",
          text: emText,
          choices: emChoices,
          selectableCount: 1,
          readchat: true,
        };

        console.log("Sending enquete_menu (UAZAPI):", JSON.stringify(emPayload));

        try {
          const emRes = await fetch(`${baseUrl}/send/menu`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instanceToken },
            body: JSON.stringify(emPayload),
          });
          const emBody = await emRes.text();
          console.log("enquete_menu response:", { status: emRes.status, body: emBody.substring(0, 300) });

          if (emRes.ok) {
            return { isCommand: true, success: true, command, message: `Enquete enviada para ${emPhone}` };
          }
          return { isCommand: true, success: false, command, message: `Falha ao enviar enquete (${emRes.status}): ${emBody.substring(0, 100)}` };
        } catch (e) {
          return { isCommand: true, success: false, command, message: `Erro ao enviar enquete: ${e instanceof Error ? e.message : "Falha"}` };
        }
      }

      case "#carrossel": {
        // UAZAPI /send/menu with type: "carousel"
        // Formato: #carrossel texto|[Card],img,corpo,botão1,botão2,...
        // Buttons can contain | for types: label|url, label|copy:val, label|call:num
        // So we split cards by |[ instead of just |
        if (params.length < 2) {
          return { isCommand: true, success: false, command, message: "Formato: #carrossel texto|[Card],img,corpo,botão1,botão2,..." };
        }

        if (!targetPhone) {
          return { isCommand: true, success: false, command, message: "Erro: número do contato não encontrado" };
        }

        const crPhone = targetPhone.replace(/\D/g, "");
        // Rejoin all params since buttons may contain | that was split by parseGroupCommand
        const crFullParams = params.join("|");
        const crFirstPipe = crFullParams.indexOf("|");
        if (crFirstPipe === -1) {
          return { isCommand: true, success: false, command, message: "Formato: #carrossel texto|[Card],img,corpo,botão1,botão2,..." };
        }
        const crText = crFullParams.substring(0, crFirstPipe).trim();
        const crCardsRaw = crFullParams.substring(crFirstPipe + 1);

        // Split cards by |[ pattern (pipe followed by opening bracket = new card)
        const crCardStrings: string[] = [];
        let crCurrent = "";
        const crTokens = crCardsRaw.split("|");
        for (let t = 0; t < crTokens.length; t++) {
          const token = crTokens[t];
          if (token.trimStart().startsWith("[") && crCurrent.length > 0) {
            // New card starts
            crCardStrings.push(crCurrent);
            crCurrent = token;
          } else if (crCurrent.length === 0) {
            crCurrent = token;
          } else {
            // This is part of a button value (e.g. label|call:xxx), rejoin
            crCurrent += "|" + token;
          }
        }
        if (crCurrent.length > 0) crCardStrings.push(crCurrent);

        const crChoices: string[] = [];
        for (let i = 0; i < crCardStrings.length; i++) {
          const cardParts = crCardStrings[i].split(",").map(s => s.trim()).filter(s => s.length > 0);
          if (cardParts.length === 0) continue;

          // First part: [Title] or [Title\nBody] — already formatted by CDN
          let titleEntry = cardParts[0];
          if (titleEntry.startsWith("[") && titleEntry.endsWith("]")) {
            // Already bracketed, use as-is for choices
          } else if (titleEntry.startsWith("[")) {
            titleEntry = titleEntry + "]";
          } else {
            titleEntry = "[" + titleEntry + "]";
          }
          crChoices.push(titleEntry);

          // Remaining parts: image URL first, then all buttons
          let imageUrl = "";
          for (let j = 1; j < cardParts.length; j++) {
            const part = cardParts[j];
            if (!imageUrl && (part.startsWith("http://") || part.startsWith("https://"))) {
              imageUrl = part;
              crChoices.push(`{${imageUrl}}`);
            } else {
              // Everything else is a button
              crChoices.push(part);
            }
          }
        }

        const crPayload: Record<string, unknown> = {
          number: crPhone,
          type: "carousel",
          text: crText,
          choices: crChoices,
          readchat: true,
        };

        console.log("Sending carousel (UAZAPI):", JSON.stringify(crPayload));

        try {
          const crRes = await fetch(`${baseUrl}/send/menu`, {
            method: "POST",
            headers: { "Content-Type": "application/json", token: instanceToken },
            body: JSON.stringify(crPayload),
          });
          const crBody = await crRes.text();
          console.log("carousel response:", { status: crRes.status, body: crBody.substring(0, 300) });

          if (crRes.ok) {
            return { isCommand: true, success: true, command, message: `Carrossel enviado para ${crPhone}` };
          }
          return { isCommand: true, success: false, command, message: `Falha ao enviar carrossel (${crRes.status}): ${crBody.substring(0, 100)}` };
        } catch (e) {
          return { isCommand: true, success: false, command, message: `Erro ao enviar carrossel: ${e instanceof Error ? e.message : "Falha"}` };
        }
      }

      case "#nome_perfil": {
        // Formato: #nome_perfil Novo Nome do Perfil
        if (params.length === 0) {
          return { isCommand: true, success: false, command, message: "Use: #nome_perfil Nome do Perfil" };
        }
        const profileName = params.join("|").trim();
        console.log("Updating profile name:", { profileName });
        
        try {
          // Try multiple endpoint patterns
          const nameEndpoints = [
            { url: `${baseUrl}/user/profile`, method: "PUT", body: { name: profileName } },
            { url: `${baseUrl}/user/profile`, method: "POST", body: { name: profileName } },
            { url: `${baseUrl}/instance/updateProfileName`, method: "PUT", body: { profileName } },
            { url: `${baseUrl}/instance/setprofile`, method: "POST", body: { name: profileName } },
            { url: `${baseUrl}/profile/name`, method: "PUT", body: { name: profileName } },
            { url: `${baseUrl}/profile/name`, method: "POST", body: { name: profileName } },
            { url: `${baseUrl}/chat/updateProfileName`, method: "POST", body: { name: profileName } },
          ];

          for (const ep of nameEndpoints) {
            console.log(`Trying profile name: ${ep.method} ${ep.url}`);
            const nameRes = await fetch(ep.url, {
              method: ep.method,
              headers: { "Content-Type": "application/json", Accept: "application/json", token: instanceToken },
              body: JSON.stringify(ep.body),
            });
            const nameBody = await nameRes.text();
            console.log(`Profile name response ${ep.method} ${ep.url}: ${nameRes.status} - ${nameBody.substring(0, 300)}`);
            
            if (nameRes.ok) {
              return { isCommand: true, success: true, command, message: `Nome do perfil atualizado para: ${profileName}` };
            }
            // If 404/405, try next endpoint
            if (nameRes.status === 404 || nameRes.status === 405) continue;
            // Other error, stop
            return { isCommand: true, success: false, command, message: `Falha ao atualizar nome (${nameRes.status}): ${nameBody.substring(0, 100)}` };
          }
          return { isCommand: true, success: false, command, message: "Nenhum endpoint de atualização de nome funcionou. Verifique a versão da UAZAPI." };
        } catch (e) {
          return { isCommand: true, success: false, command, message: `Erro ao atualizar nome: ${e instanceof Error ? e.message : "Falha"}` };
        }
      }

      case "#foto_perfil": {
        // Formato: #foto_perfil https://url-da-imagem.jpg
        if (params.length === 0) {
          return { isCommand: true, success: false, command, message: "Use: #foto_perfil URL_da_imagem" };
        }
        const profileImage = params.join("|").trim();
        console.log("Updating profile image:", { profileImage });
        
        try {
          const imgRes = await fetch(`${baseUrl}/profile/image`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json", token: instanceToken },
            body: JSON.stringify({ image: profileImage }),
          });
          const imgBody = await imgRes.text();
          console.log("Profile image response:", { status: imgRes.status, body: imgBody.substring(0, 300) });
          
          if (imgRes.ok) {
            return { isCommand: true, success: true, command, message: `Foto do perfil atualizada!` };
          }
          return { isCommand: true, success: false, command, message: `Falha ao atualizar foto (${imgRes.status}): ${imgBody.substring(0, 100)}` };
        } catch (e) {
          return { isCommand: true, success: false, command, message: `Erro ao atualizar foto: ${e instanceof Error ? e.message : "Falha"}` };
        }
      }

      case "#sairgrupo": {
        // Formato: #sairgrupo (enviado dentro do grupo)
        // UAZAPI: POST /group/leave with { groupjid }
        const groupToLeave = currentGroupJid?.includes("@g.us")
          ? currentGroupJid
          : `${currentGroupJid}@g.us`;
        
        console.log("Leaving group:", { groupjid: groupToLeave });
        
        const leaveRes = await fetch(`${baseUrl}/group/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": instanceToken },
          body: JSON.stringify({ groupjid: groupToLeave }),
        });
        const leaveText = await leaveRes.text();
        console.log("Leave group response:", { status: leaveRes.status, body: leaveText.substring(0, 300) });
        
        if (leaveRes.ok) {
          // Send InternalComment to GHL confirming the exit (not outbound)
          if (ghlContext?.contactId && ghlContext?.settings?.ghl_client_id) {
            try {
              const token = await getValidToken(ghlContext.supabase, ghlContext.subaccount, ghlContext.settings);
              if (token) {
                const icRes = await fetchGHL("https://services.leadconnectorhq.com/conversations/messages", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    Version: "2021-04-15",
                    "Content-Type": "application/json",
                    Accept: "application/json",
                  },
                  body: JSON.stringify({
                    type: "InternalComment",
                    contactId: ghlContext.contactId,
                    message: "⚠️ Você não faz mais parte deste grupo ⚠️",
                  }),
                });
                if (icRes.ok) {
                  console.log("[GHL] ✅ Leave group InternalComment sent");
                } else {
                  const icErr = await icRes.text();
                  console.error("[GHL] ❌ Failed to send leave InternalComment:", icErr.substring(0, 200));
                }
              }
            } catch (e) {
              console.error("[GHL] Error sending leave InternalComment:", e);
            }
          }
          return { isCommand: true, success: true, command, message: `Saí do grupo com sucesso` };
        } else {
          return { isCommand: true, success: false, command, message: `Falha ao sair do grupo (${leaveRes.status})` };
        }
      }
      
      default:
        return { isCommand: false };
    }
  } catch (e) {
    console.error("Error processing group command:", e);
    return { isCommand: true, success: false, command, message: `Erro: ${e instanceof Error ? e.message : "Falha"}` };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("✅ webhook-outbound HIT", {
    method: req.method,
    url: req.url,
    contentType: req.headers.get("content-type"),
    userAgent: req.headers.get("user-agent"),
  });

  // Parse body once
  let body: any;
  try {
    body = await req.json();
  } catch (error) {
    console.error("Failed to parse body:", error);
    return new Response(JSON.stringify({ success: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Process inline to avoid message loss when the runtime shuts down (background tasks are not guaranteed).
  await (async () => {
    try {
    const messageId: string = String(body.messageId ?? "");
    // IMPORTANT: Keep dedupe key format consistent across inbound/outbound.
    // webhook-inbound stores returned GHL message IDs as `ghl:<messageId>`.
    // If we dedupe using the raw ID here, we won't match and the loop continues.
    const dedupeKey = messageId ? `ghl:${messageId}` : "";
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log("GHL Outbound payload:", JSON.stringify(body, null, 2));

    // Extract message data first to check if it's a valid outbound message
    const eventType = String(body.type ?? "");
    const direction = String(body.direction ?? "");
    const source = String(body.source ?? "");
    let messageText: string = String(body.message ?? body.body ?? "");
    const phoneRaw: string = String(body.phone ?? body.to ?? "");
    const attachments: string[] = Array.isArray(body.attachments) ? body.attachments : [];
    
    // EARLY SOURCE CHECK - Before any other processing
    // This is the FIRST line of defense against loops
    const isHashCommand = messageText.trim().startsWith("#");
    const messageType = String(body.messageType ?? "");
    console.log("[SOURCE CHECK] Analyzing message source:", { source, isHashCommand, messageId, messageType });
    
    // Block InternalComment messages - these are internal notes, not for WhatsApp
    if (messageType === "InternalComment" || String(body.messageTypeString ?? "") === "TYPE_INTERNAL_COMMENT") {
      console.log("🛑 [BLOCKED] Ignoring InternalComment (internal note, not for WhatsApp):", { 
        messageId,
        messagePreview: messageText.substring(0, 80) 
      });
      return;
    }

    // Block Email messages - emails are handled by GHL natively, not via WhatsApp
    const contentType = String(body.contentType ?? "");
    if (
      messageType === "Email" ||
      eventType === "Email" ||
      contentType === "text/html" ||
      String(body.messageTypeString ?? "") === "TYPE_EMAIL" ||
      String(body.channel ?? "").toLowerCase() === "email"
    ) {
      console.log("🛑 [BLOCKED] Ignoring Email message (not for WhatsApp):", { 
        messageId,
        messageType,
        eventType,
        contentType,
        channel: body.channel,
        messagePreview: messageText.substring(0, 80) 
      });
      return;
    }

    // Block WhatsApp Official API messages - these are already handled natively by GHL
    // BridgeAPI only handles SMS channel messages
    const channelRaw = String(body.channel ?? "").toLowerCase();
    const messageTypeString = String(body.messageTypeString ?? "");
    if (
      messageType === "WhatsApp" ||
      messageTypeString === "TYPE_WHATSAPP" ||
      channelRaw === "whatsapp" ||
      messageType === "Live_Chat" ||
      messageTypeString === "TYPE_LIVE_CHAT" ||
      channelRaw === "live_chat" ||
      // Instagram, Facebook Messenger, GMB, Custom and other non-SMS channels
      // must NEVER be relayed through BridgeAPI (WhatsApp).
      messageType === "IG" ||
      messageType === "Instagram" ||
      messageTypeString === "TYPE_INSTAGRAM" ||
      channelRaw === "instagram" ||
      channelRaw === "ig" ||
      messageType === "FB" ||
      messageType === "Facebook" ||
      messageTypeString === "TYPE_FACEBOOK" ||
      channelRaw === "facebook" ||
      channelRaw === "fb" ||
      messageType === "GMB" ||
      messageTypeString === "TYPE_GMB" ||
      channelRaw === "gmb" ||
      messageType === "Custom" ||
      messageTypeString === "TYPE_CUSTOM_PROVIDER_SMS" ||
      messageTypeString === "TYPE_CUSTOM_PROVIDER_EMAIL" ||
      messageType === "Call" ||
      messageType === "Voicemail" ||
      messageTypeString === "TYPE_CALL" ||
      messageTypeString === "TYPE_VOICEMAIL"
    ) {
      console.log("🛑 [BLOCKED] Ignoring non-SMS channel message:", { 
        messageId,
        messageType,
        messageTypeString: body.messageTypeString,
        channel: body.channel,
        messagePreview: messageText.substring(0, 80) 
      });
      return;
    }

    // NOTE: We no longer block source==="api" here because ALL messages sent via
    // GHL Conversation Provider arrive with source="api", including user-typed messages.
    // Loop prevention is handled by the dedup check below (ghl_processed_messages table):
    // webhook-inbound stores `ghl:<messageId>` when forwarding WhatsApp→GHL,
    // so when GHL echoes it back here, the dedup catches it.

    // Check for duplicate webhook calls (GHL sometimes sends the same intent twice)
    // Primary key: messageId
    if (dedupeKey && await isDuplicate(supabase, dedupeKey)) {
      console.log("Duplicate webhook ignored (messageId):", { messageId, dedupeKey });
      return; // Already responded
    }

    // Secondary key: signature by content + minute bucket.
    // This prevents double-send when GHL fires two webhooks with different messageIds
    // for effectively the same outbound action.
    // IMPORTANT: bucketed by minute to avoid blocking legitimate repeated messages later.
    try {
      const dateAdded = String(body.dateAdded ?? body.timestamp ?? "");
      const minuteBucket = dateAdded ? Math.floor(new Date(dateAdded).getTime() / 60000) : Math.floor(Date.now() / 60000);
      // Normalize payload shape differences (SMS vs OutboundMessage) so we dedupe across both.
      // We intentionally IGNORE `type/direction/source` here because GHL may emit the same message
      // with different wrappers/fields.
      const normalizedPhone = normalizePhoneForSig(phoneRaw);
      const normalizedText = normalizeTextForSig(messageText);
      const normalizedAttachments = (attachments || []).map(String).filter(Boolean).sort();

      // Include messageId in signature when available to allow legitimate repeated messages.
      // The primary dedup by messageId (line 2361) already prevents true duplicates.
      // This secondary signature catches cases where GHL fires different event types
      // for the same action (e.g., SMS + OutboundMessage) but with different messageIds.
      // By including messageId, two intentional identical messages get unique signatures.
      const signaturePayload = {
        locationId: String(body.locationId ?? ""),
        contactId: String(body.contactId ?? ""),
        conversationId: String(body.conversationId ?? ""),
        phone: normalizedPhone,
        text: normalizedText,
        attachments: normalizedAttachments,
        minuteBucket,
        messageId: String(messageId ?? ""),
      };
      const sig = await sha256Hex(JSON.stringify(signaturePayload));
      const sigKey = `ghl_sig:${sig.slice(0, 32)}`;

      if (await isDuplicate(supabase, sigKey)) {
        console.log("Duplicate webhook ignored (signature):", { sigKey, minuteBucket });
        return;
      }
    } catch (e) {
      console.error("Failed to compute signature dedupe:", e);
      // fail-open: don't block message sending
    }
    
    // CRITICAL: If direction is explicitly "inbound", ALWAYS ignore — no exceptions.
    // This prevents loops where webhook-inbound forwards a WhatsApp message to GHL,
    // and GHL fires the Conversation Provider webhook back with the same content.
    if (direction === "inbound") {
      console.log("🛑 [BLOCKED] Ignoring inbound-direction message:", { eventType, direction, messageId });
      return;
    }

    // Accept messages if:
    // 1. type is OutboundMessage OR direction is outbound
    // 2. OR type is SMS with phone and content AND direction is NOT inbound (GHL sends SMS type for user-sent messages)
    const isOutbound = eventType === "OutboundMessage" || direction === "outbound";
    const isSmsWithContent = eventType === "SMS" && phoneRaw && (messageText || attachments.length > 0);
    
    if (!isOutbound && !isSmsWithContent) {
      console.log("Ignoring non-outbound event:", { eventType, direction });
      return; // Already responded
    }

    // NOTE: Source filtering ("api" vs "app"/"workflow"/"direct") is now done EARLY
    // at the top of this function to prevent loops immediately.
    // isHashCommand was already computed there.
    const status = String(body.status ?? "");

    const locationId: string | undefined = body.locationId;
    const contactId: string | undefined = body.contactId;
    const conversationId: string | undefined = body.conversationId;

    // Validation ping check
    if (!messageText && !phoneRaw && !contactId && attachments.length === 0) {
      console.log("Validation ping received, responding 200 OK");
      return; // Already responded
    }

    if (!locationId) {
      console.error("Missing locationId in payload");
      return; // Already responded
    }

    // Find subaccount - prefer the one with valid OAuth token and most recent install
    // Fetch ALL subaccounts with tokens (not just 1) so we can fallback if the first has no instances
    const { data: allSubaccounts, error: subError } = await supabase
      .from("ghl_subaccounts")
      .select("id, user_id, location_id, ghl_access_token, ghl_refresh_token, ghl_token_expires_at")
      .eq("location_id", locationId)
      .not("ghl_access_token", "is", null)
      .order("oauth_installed_at", { ascending: false, nullsFirst: false });

    if (subError || !allSubaccounts?.length) {
      console.error("Subaccount lookup failed:", { locationId, subError });
      return; // Already responded
    }

    // Try each subaccount until we find one with connected instances
    let subaccount: any = null;
    let instances: any[] | null = null;
    let settings: any = null;
    let settingsErr: any = null;

    for (const candidate of allSubaccounts) {
      const { data: candidateInstances } = await supabase
        .from("instances")
        .select("id, instance_name, uazapi_instance_token, uazapi_base_url, phone, auto_tag, ghl_user_id")
        .eq("subaccount_id", candidate.id)
        .eq("instance_status", "connected")
        .order("created_at", { ascending: true });

      if (candidateInstances?.length) {
        subaccount = candidate;
        instances = candidateInstances;
        console.log("Found subaccount with instances:", { subaccountId: candidate.id, instanceCount: candidateInstances.length });
        break;
      }
      console.log("Skipping subaccount without instances:", candidate.id);
    }

    if (!subaccount || !instances?.length) {
      console.error("No subaccount with connected instances found for location:", locationId);
      return;
    }

    // Now fetch settings for the chosen subaccount's user (include track_id for anti-loop)
    const settingsResult = await supabase
      .from("user_settings")
      .select("uazapi_base_url, uazapi_admin_token, ghl_client_id, ghl_client_secret, track_id")
      .eq("user_id", subaccount.user_id)
      .single();

    settings = settingsResult.data;
    settingsErr = settingsResult.error;

    // Fallback to admin OAuth credentials if user doesn't have their own
    if (settings && (!settings.ghl_client_id || !settings.ghl_client_secret)) {
      console.log("User OAuth credentials not found, trying admin credentials...");
      const { data: adminCreds } = await supabase.rpc("get_admin_oauth_credentials");
      if (adminCreds?.[0]?.ghl_client_id && adminCreds?.[0]?.ghl_client_secret) {
        settings.ghl_client_id = adminCreds[0].ghl_client_id;
        settings.ghl_client_secret = adminCreds[0].ghl_client_secret;
        console.log("Using admin OAuth credentials as fallback");
      }
    }

    // Per-instance base URL takes priority over global settings
    let instance = instances[0];
    const resolvedBaseUrl = instance.uazapi_base_url || settings?.uazapi_base_url;

    if (settingsErr || !resolvedBaseUrl || !instance.uazapi_instance_token) {
      console.error("UAZAPI not configured:", { settingsErr });
      return; // Already responded
    }

    // Get phone from contact - FIRST try our mapping table for the original WhatsApp ID
    let targetPhone = phoneRaw || "";
    let usedMappingTable = false;
    
    if (contactId) {
      // Try to get the original WhatsApp JID from our mapping table
      const { data: mapping } = await supabase
        .from("ghl_contact_phone_mapping")
        .select("original_phone")
        .eq("contact_id", contactId)
        .eq("location_id", locationId)
        .maybeSingle();
      
      if (mapping?.original_phone) {
        targetPhone = mapping.original_phone;
        usedMappingTable = true;
        console.log("Found original phone in mapping table:", { contactId, originalPhone: targetPhone });
      } else {
        // Fallback to GHL contact lookup
        try {
          if (settings?.ghl_client_id && settings?.ghl_client_secret) {
            const token = await getValidToken(supabase, subaccount, settings);
            if (token) {
              const contactData = await fetchGhlContact(token, contactId);
              
              // If email contains @g.us, it's a group JID - use it directly!
              if (contactData.email && contactData.email.includes("@g.us")) {
                targetPhone = contactData.email;
                console.log("Using group JID from contact email field:", { contactId, groupJid: targetPhone });
              } else if (contactData.phone) {
                targetPhone = contactData.phone;
              }
            }
          }
        } catch (e) {
          console.error("Failed to resolve contact phone:", e);
        }
      }
    }

    // Check if this is a group message using the helper
    const isGroup = isGroupId(targetPhone);
    
    // Format phone for UAZAPI
    // If we got the phone from mapping table, it's already in correct format
    // For groups: add @g.us suffix if not present
    // For regular numbers: clean to digits only
    if (!usedMappingTable) {
      targetPhone = formatPhoneForUazapi(targetPhone);
      
      // If it's a group and doesn't have @g.us, add it
      if (isGroup && !targetPhone.includes("@g.us")) {
        targetPhone = `${targetPhone}@g.us`;
      }
    }

    if (!targetPhone) {
      console.error("No phone number available");
      return; // Already responded
    }

    console.log("Phone formatting:", { original: phoneRaw, formatted: targetPhone, isGroup, usedMappingTable });

    // =======================================================================
    // CRITICAL: Resolver instância preferida do lead por telefone (última escolha vence)
    // Motivo: um mesmo lead pode ter múltiplos contactIds no GHL; se buscarmos só por contactId,
    // caímos no fallback (instances[0]) e a mensagem sai pela instância errada (parece "espelhado").
    // =======================================================================
    // Track auto-switch: when the lead's preferred instance is disconnected/unlinked and we fall back
    let preferredInstanceId: string | null = null;
    let disconnectedPreferredName: string | null = null;
    let disconnectedPreferredReason: "disconnected" | "unlinked" | "deleted" = "disconnected";

    if (!isGroup) {
      try {
        const normalizedPhone = targetPhone.replace(/\D/g, "");
        const last10Digits = normalizedPhone.slice(-10);

        if (normalizedPhone.length >= 10) {
          const { data: prefsByPhone, error: prefPhoneErr } = await supabase
            .from("contact_instance_preferences")
            .select("instance_id, lead_phone, updated_at")
            .eq("location_id", locationId)
            .or(
              `lead_phone.eq.${normalizedPhone},lead_phone.like.%${normalizedPhone},lead_phone.like.%${last10Digits}%`
            )
            .order("updated_at", { ascending: false })
            .limit(1);

          if (prefPhoneErr) {
            console.error("[Outbound] Error fetching preference by phone:", prefPhoneErr);
          }

          const pref = prefsByPhone?.[0];
          if (pref?.instance_id) {
            preferredInstanceId = pref.instance_id;
            const preferredInstance = instances.find((i) => i.id === pref.instance_id);
            if (preferredInstance) {
              instance = preferredInstance;
              console.log("[Outbound] ✅ Using preferred instance by phone (latest):", {
                instanceId: instance.id,
                leadPhone: pref.lead_phone?.slice(0, 15),
                updatedAt: pref.updated_at,
              });
            } else {
              // Preferred instance exists but is NOT connected → auto-switch will happen
              const { data: prefInst } = await supabase
                .from("instances")
                .select("instance_name")
                .eq("id", pref.instance_id)
                .maybeSingle();
              disconnectedPreferredName = prefInst?.instance_name || null;
              console.log("[Outbound] ⚠️ Preferred instance is disconnected, will auto-switch:", {
                preferredId: pref.instance_id,
                preferredName: disconnectedPreferredName,
              });
            }
          }
        }
      } catch (e) {
        console.error("[Outbound] Failed to resolve preference by phone:", e);
      }
    }

    // Fallback por contactId (compat)
    if (contactId && instance === instances[0]) {
      try {
        const { data: preference, error: prefErr } = await supabase
          .from("contact_instance_preferences")
          .select("instance_id")
          .eq("contact_id", contactId)
          .eq("location_id", locationId)
          .maybeSingle();

        if (prefErr) {
          console.error("[Outbound] Error fetching preference by contactId:", prefErr);
        }

        if (preference?.instance_id) {
          if (!preferredInstanceId) preferredInstanceId = preference.instance_id;
          const preferredInstance = instances.find((i) => i.id === preference.instance_id);
          if (preferredInstance) {
            instance = preferredInstance;
            console.log("[Outbound] Using preferred instance by contactId:", { instanceId: instance.id, contactId });
          } else if (!disconnectedPreferredName) {
            const { data: prefInst } = await supabase
              .from("instances")
              .select("instance_name")
              .eq("id", preference.instance_id)
              .maybeSingle();
            disconnectedPreferredName = prefInst?.instance_name || null;
          }
        }
      } catch (e) {
        console.error("[Outbound] Failed to resolve preference by contactId:", e);
      }
    }

    // === AUTO-SWITCH NOTIFICATION ===
    // If the preferred instance was disconnected, notify the user that we switched automatically
    if (
      disconnectedPreferredName &&
      preferredInstanceId &&
      instance.id !== preferredInstanceId &&
      (instance as any).instance_name
    ) {
      const newInstanceName = (instance as any).instance_name;
      console.log("[Outbound] 🔄 Auto-switch triggered:", {
        from: disconnectedPreferredName,
        to: newInstanceName,
        reason: "preferred_disconnected",
      });

      // Update preference to the new (connected) instance
      try {
        const normalizedPhone = targetPhone.replace(/\D/g, "");
        if (contactId) {
          await supabase
            .from("contact_instance_preferences")
            .upsert({
              contact_id: contactId,
              location_id: locationId,
              instance_id: instance.id,
              lead_phone: normalizedPhone || null,
              updated_at: new Date().toISOString(),
            }, { onConflict: "contact_id,location_id" });
        }
      } catch (e) {
        console.error("[Outbound] Failed to update preference after auto-switch:", e);
      }

      // Broadcast so the bridge-switcher dropdown updates in real time
      try {
        await supabase.channel("ghl_updates").send({
          type: "broadcast",
          event: "instance_switch",
          payload: {
            location_id: locationId,
            lead_phone: targetPhone,
            new_instance_id: instance.id,
            new_instance_name: newInstanceName,
            previous_instance_name: disconnectedPreferredName,
            reason: "auto_disconnect",
          },
        });
      } catch (e) {
        console.error("[Outbound] Auto-switch broadcast error:", e);
      }

      // Send InternalComment so the user sees the switch in the GHL conversation
      if (contactId && settings?.ghl_client_id && settings?.ghl_client_secret) {
        try {
          const switchToken = await getValidToken(supabase, subaccount, settings);
          if (switchToken) {
            await fetchGHL("https://services.leadconnectorhq.com/conversations/messages", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${switchToken}`,
                Version: "2021-04-15",
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                type: "InternalComment",
                contactId,
                message: `🔄 Instância "${disconnectedPreferredName}" desconectada. Trocada automaticamente para: ${newInstanceName}`,
              }),
            });
            console.log("[Outbound] ✅ Auto-switch InternalComment sent");
          }
        } catch (e) {
          console.error("[Outbound] Auto-switch InternalComment error:", e);
        }
      }
    }

    // =======================================================================
    // INSTANCE OVERRIDE: #PHONE: or #NAME: prefix switches the sending instance
    // Format phone: #5521980014713: mensagem aqui
    // Format name:  #Nome da Instância: mensagem aqui
    // =======================================================================
    let overrideInstanceUsed = false;
    let matchedInstance: any = null;
    let overrideIdentifier = "";

    // Skip override detection if the message starts with a known group/interactive command
    const knownCommandPrefixes = [
      "#criargrupo", "#removerdogrupo", "#addnogrupo", "#promoveradmin",
      "#revogaradmin", "#attfotogrupo", "#attnomegrupo", "#attdescricao",
      "#somenteadminmsg", "#msgliberada", "#somenteadminedit", "#editliberado",
      "#linkgrupo", "#sairgrupo", "#pix", "#botoes", "#lista", "#enquete",
      "#lista_menu", "#enquete_menu", "#carrossel", "#nome_perfil", "#foto_perfil"
    ];
    const msgLower = messageText.trim().toLowerCase();
    const isKnownCommand = knownCommandPrefixes.some(cmd => msgLower.startsWith(cmd + " ") || msgLower === cmd);

    // Priority 1: Phone override (#DIGITS:)
    const phoneOverrideMatch = !isKnownCommand ? messageText.match(/^#(\d{10,15}):\s*/) : null;
    // Priority 2: Name override (#NAME:) - matches any non-digit text before ':'
    const nameOverrideMatch = !isKnownCommand && !phoneOverrideMatch ? messageText.match(/^#([^:\d][^:]{0,49}):\s*/) : null;

    if (phoneOverrideMatch) {
      const overridePhone = phoneOverrideMatch[1];
      overrideIdentifier = overridePhone;
      console.log("[Outbound] 🔀 Instance override by phone:", { overridePhone });

      const overrideLast10 = overridePhone.slice(-10);
      matchedInstance = instances.find((inst: any) => {
        const instPhone = (inst.phone || "").replace(/\D/g, "");
        return instPhone.length >= 10 && instPhone.slice(-10) === overrideLast10;
      });
    } else if (nameOverrideMatch) {
      const overrideName = nameOverrideMatch[1].trim();
      overrideIdentifier = overrideName;
      console.log("[Outbound] 🔀 Instance override by name:", { overrideName });

      // Case-insensitive match on instance_name
      const lowerName = overrideName.toLowerCase();
      matchedInstance = instances.find((inst: any) =>
        (inst.instance_name || "").toLowerCase() === lowerName
      );
    }

    const instanceOverrideMatch = phoneOverrideMatch || nameOverrideMatch;
    if (instanceOverrideMatch && matchedInstance) {
        const previousInstanceName = (instance as any).instance_name || "desconhecida";
        instance = matchedInstance;
        overrideInstanceUsed = true;
        // Strip the override prefix from the message
        messageText = messageText.replace(instanceOverrideMatch[0], "").trim();
        console.log("[Outbound] ✅ Instance overridden to:", {
          instanceId: instance.id,
          instanceName: (instance as any).instance_name,
          strippedMessage: messageText.substring(0, 50),
        });

        // Update contact_instance_preferences so the switcher reflects the new instance
        if (contactId && locationId) {
          try {
            const { data: existingPref } = await supabase
              .from("contact_instance_preferences")
              .select("id")
              .eq("contact_id", contactId)
              .eq("location_id", locationId)
              .maybeSingle();

            if (existingPref) {
              await supabase
                .from("contact_instance_preferences")
                .update({ instance_id: instance.id, updated_at: new Date().toISOString() })
                .eq("id", existingPref.id);
            } else {
              await supabase
                .from("contact_instance_preferences")
                .insert({
                  contact_id: contactId,
                  location_id: locationId,
                  instance_id: instance.id,
                  lead_phone: targetPhone?.replace(/\D/g, "") || null,
                });
            }
            console.log("[Outbound] ✅ Preference updated for override instance");
          } catch (prefErr) {
            console.error("[Outbound] ❌ Error updating preference for override:", prefErr);
          }
        }

        // Broadcast instance_switch so the bridge-switcher dropdown updates in real time
        try {
          await supabase.channel("ghl_updates").send({
            type: "broadcast",
            event: "instance_switch",
            payload: {
              location_id: locationId,
              lead_phone: targetPhone,
              new_instance_id: instance.id,
              new_instance_name: (instance as any).instance_name,
              previous_instance_name: "override",
            },
          });
          console.log("[Outbound] ✅ Instance override broadcasted to frontend");
        } catch (broadcastErr) {
          console.error("[Outbound] ❌ Error broadcasting override:", broadcastErr);
        }

        // Send InternalComment confirming the switch
        if (contactId && settings?.ghl_client_id && settings?.ghl_client_secret) {
          try {
            const switchToken = await getValidToken(supabase, subaccount, settings);
            if (switchToken) {
              await fetchGHL("https://services.leadconnectorhq.com/conversations/messages", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${switchToken}`,
                  Version: "2021-04-15",
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  type: "InternalComment",
                  contactId,
                  message: `🔄 Instância alterada: ${previousInstanceName} → ${(instance as any).instance_name}`,
                }),
              });
              console.log("[Outbound] ✅ Override InternalComment sent");
            }
          } catch (icErr) {
            console.error("[Outbound] ❌ Error sending override InternalComment:", icErr);
          }
        }
    } else if (instanceOverrideMatch && !matchedInstance) {
        console.log("[Outbound] ⚠️ No connected instance found for override:", overrideIdentifier);

        // Check if a matching instance exists but is DISCONNECTED (vs. truly not found / wrong command)
        let disconnectedInstance: any = null;
        try {
          const { data: allSubInstances } = await supabase
            .from("instances")
            .select("id, instance_name, phone, instance_status")
            .eq("subaccount_id", subaccount.id);

          if (allSubInstances?.length) {
            if (phoneOverrideMatch) {
              const overrideLast10 = overrideIdentifier.slice(-10);
              disconnectedInstance = allSubInstances.find((inst: any) => {
                const instPhone = (inst.phone || "").replace(/\D/g, "");
                return instPhone.length >= 10 && instPhone.slice(-10) === overrideLast10;
              });
            } else {
              const lowerName = overrideIdentifier.toLowerCase();
              disconnectedInstance = allSubInstances.find((inst: any) =>
                (inst.instance_name || "").toLowerCase() === lowerName
              );
            }
          }
        } catch (lookupErr) {
          console.error("[Outbound] Error looking up disconnected instances:", lookupErr);
        }

        const feedbackMessage = disconnectedInstance
          ? `⚠️ A instância "${disconnectedInstance.instance_name}" está desconectada. Reconecte-a antes de enviar mensagens por ela.`
          : `❌ Comando inválido ou instância não encontrada: "${overrideIdentifier}".\nUse #TELEFONE: mensagem ou #Nome da Instância: mensagem.`;

        if (contactId && settings?.ghl_client_id && settings?.ghl_client_secret) {
          try {
            const feedbackToken = await getValidToken(supabase, subaccount, settings);
            if (feedbackToken) {
              await fetchGHL("https://services.leadconnectorhq.com/conversations/messages", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${feedbackToken}`,
                  Version: "2021-04-15",
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  type: "InternalComment",
                  contactId,
                  message: feedbackMessage,
                }),
              });
            }
          } catch (e) {
            console.error("[Outbound] Error sending override feedback:", e);
          }
        }
        return; // Don't send the message
    }

    // =======================================================================
    // IMPORTANTE: Atualizar/criar preferência com lead_phone para bridge-switcher
    // Isso garante que o dropdown no GHL saiba qual instância usar para este contato
    // =======================================================================
    // Fire-and-forget: preference update is non-critical for message delivery
    const prefUpdatePromise = (async () => {
      try {
        const normalizedPhone = targetPhone.replace(/\D/g, "");
        const { data: existingPref } = await supabase
          .from("contact_instance_preferences")
          .select("id, lead_phone, instance_id")
          .eq("contact_id", contactId)
          .eq("location_id", locationId)
          .maybeSingle();
        
        if (existingPref) {
          if (!existingPref.lead_phone || existingPref.lead_phone !== normalizedPhone) {
            await supabase
              .from("contact_instance_preferences")
              .update({ lead_phone: normalizedPhone, updated_at: new Date().toISOString() })
              .eq("id", existingPref.id);
          }
        } else {
          await supabase
            .from("contact_instance_preferences")
            .insert({
              contact_id: contactId,
              location_id: locationId,
              instance_id: instance.id,
              lead_phone: normalizedPhone,
            });
        }
      } catch (prefError) {
        console.error("[Outbound] ❌ Erro ao atualizar preferência:", prefError);
      }
    })();

    // Use waitUntil so pref update runs after response
    try {
      (globalThis as any).EdgeRuntime?.waitUntil?.(prefUpdatePromise);
    } catch {
      // fallback: just let it run in background
    }

    // Check if we have content to send
    if (!messageText && attachments.length === 0) {
      console.log("No message text or attachments provided; acknowledging");
      return; // Already responded
    }

    // Re-resolve base URL for the chosen instance (might differ after preference lookup)
    const base = (instance.uazapi_base_url || settings.uazapi_base_url)?.replace(/\/$/, "") || "";
    const instanceToken = instance.uazapi_instance_token;
    const results: Array<{ type: string; sent: boolean; status: number }> = [];

    // =====================================================================
    // CHECK FOR GROUP MANAGEMENT COMMANDS
    // Commands start with # and are processed instead of being sent as messages
    // =====================================================================
    if (messageText && messageText.trim().startsWith("#")) {
      console.log("Detected potential group command:", messageText.substring(0, 50));
      
      // Se for um grupo, passa o JID para comandos como #attfotogrupo
      const groupJidForCommand = isGroup ? targetPhone : undefined;
      
      const commandResult = await processGroupCommand(
        base,
        instanceToken,
        messageText,
        (instance as any)?.instance_name,
        groupJidForCommand, // Passa o JID do grupo se a mensagem veio de um grupo
        { supabase, subaccount, settings, contactId }, // Context for GHL operations
        targetPhone, // Phone for non-group commands like #pix
      );
      
      if (commandResult.isCommand) {
        console.log("Group command processed:", commandResult);
        
        // Optionally send result back to GHL as a note or to the sender
        // For now, just log and return - don't send the command as a message
        return; // Command handled, don't send as regular message
      }
      // If not a recognized command, continue to send as regular message
    }

    // =====================================================================
    // SIGN MESSAGES: prepend the user's name to outgoing text/captions.
    // Toggled per-instance via auto_tag flags (__sign:1, __sign_source:assigned|sender).
    // Format: "*Name:*\n message"
    // =====================================================================
    try {
      const signCfg = parseSignConfig((instance as any).auto_tag);
      if (signCfg.enabled && messageText && messageText.trim()) {
        let userIdToLookup = "";
        if (signCfg.source === "sender") {
          userIdToLookup = String(body.userId ?? body.user?.id ?? "").trim();
        }
        if (!userIdToLookup) {
          // Fallback / assigned mode: use the GHL user assigned to the instance
          userIdToLookup = String((instance as any).ghl_user_id || "").trim();
        }
        if (userIdToLookup && settings?.ghl_client_id && settings?.ghl_client_secret) {
          const signToken = await getValidToken(supabase, subaccount, settings);
          if (signToken) {
            const userName = await fetchGhlUserName(signToken, userIdToLookup);
            if (userName) {
              messageText = `*${userName}:*\n ${messageText}`;
              console.log("[sign] Signed message:", { userId: userIdToLookup, name: userName, source: signCfg.source });
            } else {
              console.log("[sign] No name resolved, skipping signature:", { userIdToLookup });
            }
          }
        } else {
          console.log("[sign] Cannot sign: missing user id or OAuth credentials", { userIdToLookup, hasOAuth: !!(settings?.ghl_client_id && settings?.ghl_client_secret) });
        }
      }
    } catch (signErr) {
      console.error("[sign] Error applying signature:", signErr);
    }

    // Send attachments first (media)
    for (const attachment of attachments) {
      const mediaType = detectMediaType(attachment);
      console.log("Sending media:", { attachment, mediaType, phone: targetPhone, isGroup });
      
      const outboundTrackId = settings?.track_id || "";
      const result = await sendMediaMessage(base, instanceToken, targetPhone, attachment, mediaType, messageText || undefined, outboundTrackId);
      results.push({ type: `media:${mediaType}`, sent: result.sent, status: result.status });
      
      if (!result.sent) {
        console.error("Failed to send media:", { attachment, status: result.status, body: result.body });
      } else if (result.uazapiMessageId) {
        // Register UAZAPI dedup to prevent webhook-inbound from re-processing the echo
        try {
          await supabase.from("ghl_processed_messages").upsert(
            { message_id: `uazapi:${instanceToken}:${result.uazapiMessageId}` },
            { onConflict: "message_id" }
          );
          console.log("Registered UAZAPI dedup for outbound media:", `uazapi:${instanceToken}:${result.uazapiMessageId}`);
        } catch (dedupErr) {
          console.error("Failed to register UAZAPI dedup:", dedupErr);
        }

        if (messageId) {
        // Save message mapping for outbound media
        try {
          const { error: mapError } = await supabase.from("message_map").upsert({
            ghl_message_id: messageId,
            uazapi_message_id: result.uazapiMessageId,
            location_id: locationId,
            contact_id: contactId || null,
            message_text: messageText || "",
            message_type: `media:${mediaType}`,
            from_me: true,
            original_timestamp: new Date().toISOString(),
          }, { onConflict: "ghl_message_id" });
          if (mapError) {
            console.error("Failed to save outbound media mapping:", mapError);
          } else {
            console.log("Outbound message mapping saved:", { ghl: messageId, uazapi: result.uazapiMessageId });
          }
        } catch (mapErr) {
          console.error("Failed to save outbound mapping:", mapErr);
        }
        }
      }
    }

    // Send text message if there's text AND no attachments (to avoid duplicate text)
    // If there were attachments, text was already sent as caption
    if (messageText && attachments.length === 0) {
      console.log("Sending text:", { text: messageText.substring(0, 50), phone: targetPhone, isGroup });
      const outboundTrackId = settings?.track_id || "";
      const result = await sendTextMessage(base, instanceToken, targetPhone, messageText, outboundTrackId);
      results.push({ type: "text", sent: result.sent, status: result.status });
      
      if (!result.sent) {
        console.error("Failed to send text:", { status: result.status, body: result.body });
      } else if (result.uazapiMessageId) {
        // Register UAZAPI dedup to prevent webhook-inbound from re-processing the echo
        try {
          await supabase.from("ghl_processed_messages").upsert(
            { message_id: `uazapi:${instanceToken}:${result.uazapiMessageId}` },
            { onConflict: "message_id" }
          );
          console.log("Registered UAZAPI dedup for outbound text:", `uazapi:${instanceToken}:${result.uazapiMessageId}`);
        } catch (dedupErr) {
          console.error("Failed to register UAZAPI dedup:", dedupErr);
        }

        if (messageId) {
        // Save message mapping for outbound text
        try {
          const { error: mapError } = await supabase.from("message_map").upsert({
            ghl_message_id: messageId,
            uazapi_message_id: result.uazapiMessageId,
            location_id: locationId,
            contact_id: contactId || null,
            message_text: messageText,
            message_type: "text",
            from_me: true,
            original_timestamp: new Date().toISOString(),
          }, { onConflict: "ghl_message_id" });
          if (mapError) {
            console.error("Failed to save outbound text mapping:", mapError);
          } else {
            console.log("Outbound message mapping saved:", { ghl: messageId, uazapi: result.uazapiMessageId });
          }
        } catch (mapErr) {
          console.error("Failed to save outbound mapping:", mapErr);
        }
        }
      }
    }

    const allSent = results.every(r => r.sent);
    const anySent = results.some(r => r.sent);

    console.log(`${anySent ? "✅" : "❌"} Message processing complete:`, { phone: targetPhone, isGroup, results });

  } catch (error) {
    console.error("Webhook outbound background processing error:", error);
  }
  })();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
