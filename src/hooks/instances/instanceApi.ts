/**
 * Pure async functions for UAZAPI API calls.
 * No React dependencies — fully testable and reusable.
 */

import type { Database } from "@/integrations/supabase/types";

type InstanceStatus = Database["public"]["Enums"]["instance_status"];

export interface Instance {
  id: string;
  user_id: string;
  subaccount_id: string | null;
  instance_name: string;
  uazapi_instance_token: string;
  instance_status: InstanceStatus;
  webhook_url: string | null;
  ignore_groups: boolean | null;
  ghl_user_id: string | null;
  phone: string | null;
  profile_pic_url: string | null;
  uazapi_base_url: string | null;
  is_official_api: boolean;
}

export interface UazapiInstance {
  token: string;
  name: string;
  status: string;
  phone?: string;
  webhook_url?: string;
}

// ---------------------------------------------------------------------------
// URL Resolution
// ---------------------------------------------------------------------------

export function getBaseUrlForInstance(
  instance: { uazapi_base_url?: string | null },
  globalBaseUrl?: string | null,
): string {
  const instanceUrl = instance.uazapi_base_url;
  if (instanceUrl) return instanceUrl.replace(/\/$/, "");
  if (globalBaseUrl) return globalBaseUrl.replace(/\/$/, "");
  throw new Error("URL base da UAZAPI não configurada");
}

// ---------------------------------------------------------------------------
// Fetch all instances from UAZAPI server
// ---------------------------------------------------------------------------

export async function fetchAllUazapiInstances(
  baseUrl: string,
  adminToken: string,
): Promise<UazapiInstance[]> {
  const base = baseUrl.replace(/\/$/, "");
  const candidatePaths = ["/instance/all", "/api/instance/all"];

  let response: Response | null = null;
  for (const path of candidatePaths) {
    const r = await fetch(`${base}${path}`, {
      method: "GET",
      headers: { "Content-Type": "application/json", admintoken: adminToken },
    });
    if (r.status === 404) continue;
    response = r;
    break;
  }

  if (!response) {
    throw new Error(
      "Não encontrei um endpoint válido para listar instâncias (tente conferir se a API está usando o prefixo /api).",
    );
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Erro ${response.status} ao buscar instâncias`);
  }

  const data = await response.json();
  const instancesArray = Array.isArray(data) ? data : (data.instances || data.data || []);

  return instancesArray.map((inst: any) => ({
    token: inst.token || inst.instanceToken || inst.instance_token || "",
    name: inst.name || inst.instanceName || inst.instance_name || "Sem nome",
    status: inst.status || inst.state || "disconnected",
    phone: inst.phone || inst.number || "",
    webhook_url: inst.webhook_url || inst.webhookUrl || "",
  }));
}

// ---------------------------------------------------------------------------
// Instance status
// ---------------------------------------------------------------------------

export async function fetchInstanceStatus(
  instance: Instance,
  globalBaseUrl?: string | null,
): Promise<{ status: string; phone?: string; profilePicUrl?: string }> {
  const base = getBaseUrlForInstance(instance, globalBaseUrl);

  try {
    const candidatePaths = [
      "/instance/status",
      "/api/instance/status",
      "/v2/instance/status",
      "/api/v2/instance/status",
    ];

    let response: Response | null = null;
    for (const path of candidatePaths) {
      const r = await fetch(`${base}${path}`, {
        method: "GET",
        headers: { "Content-Type": "application/json", token: instance.uazapi_instance_token },
      });
      if (r.status === 404) continue;
      response = r;
      break;
    }

    if (!response || !response.ok) return { status: "disconnected" };

    const data = await response.json();
    console.log("[UAZAPI] Status response:", JSON.stringify(data));

    const phone =
      data.instance?.owner ||
      data.status?.jid?.split("@")?.[0] ||
      data.phone ||
      data.number ||
      data.jid?.split("@")?.[0] ||
      "";

    const profilePicUrl =
      data.instance?.profilePicUrl ||
      data.profilePicUrl ||
      data.profilePic ||
      data.picture ||
      data.imgUrl ||
      "";

    let status = "disconnected";
    const loggedIn = data.status?.loggedIn === true || data.instance?.loggedIn === true;
    const jid = data.status?.jid || data.instance?.jid || data.jid;
    const instanceStatusRaw = data.instance?.status || data.status || data.state || "disconnected";
    const isSessionConnected = loggedIn || !!jid;
    const isInstanceStatusConnected =
      typeof instanceStatusRaw === "string" &&
      ["connected", "open", "authenticated"].includes(instanceStatusRaw.toLowerCase());

    if (isSessionConnected || isInstanceStatusConnected) {
      status = phone ? "connected" : "connecting";
    } else if (typeof instanceStatusRaw === "string") {
      status = instanceStatusRaw;
    }

    console.log("[UAZAPI] Parsed status:", status, "phone:", phone, "loggedIn:", loggedIn, "jid:", jid);
    return { status, phone, profilePicUrl };
  } catch {
    return { status: "disconnected", profilePicUrl: "" };
  }
}

// ---------------------------------------------------------------------------
// Check if instance exists on UAZAPI server
// ---------------------------------------------------------------------------

export async function checkInstanceExistsOnApi(
  instance: Instance,
  globalBaseUrl?: string | null,
): Promise<boolean> {
  try {
    const base = getBaseUrlForInstance(instance, globalBaseUrl);
    const response = await fetch(`${base}/instance/status`, {
      method: "GET",
      headers: { "Content-Type": "application/json", token: instance.uazapi_instance_token },
    });

    if ([401, 403, 404].includes(response.status)) return false;

    const data = await response.json();
    if (
      data.error === true ||
      data.message?.toLowerCase().includes("not found") ||
      data.message?.toLowerCase().includes("invalid") ||
      data.message?.toLowerCase().includes("não encontrad")
    ) {
      return false;
    }
    return true;
  } catch {
    return true; // Network error — assume exists to be safe
  }
}

// ---------------------------------------------------------------------------
// Connect / Disconnect / QR
// ---------------------------------------------------------------------------

export async function connectInstanceOnApi(
  instance: Instance,
  globalBaseUrl?: string | null,
): Promise<string | null> {
  const base = getBaseUrlForInstance(instance, globalBaseUrl);
  const response = await fetch(`${base}/instance/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: instance.uazapi_instance_token },
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data.qrcode || data.instance?.qrcode || data.qr || data.base64 || null;
}

export async function getQRCodeFromApi(
  instance: Instance,
  globalBaseUrl?: string | null,
): Promise<string> {
  const base = getBaseUrlForInstance(instance, globalBaseUrl);
  const headers = { "Content-Type": "application/json", token: instance.uazapi_instance_token };

  const extractQr = (data: any): string | null =>
    data?.qrcode || data?.instance?.qrcode || data?.qr || data?.base64 || data?.code || null;

  // 1. Try connect first (usually generates fresh QR)
  try {
    const connectResponse = await fetch(`${base}/instance/connect`, {
      method: "POST",
      headers,
    });
    if (connectResponse.ok) {
      const connectData = await connectResponse.json();
      const qr = extractQr(connectData);
      if (qr) return qr;
    }
  } catch { /* continue */ }

  // 2. Try dedicated qrcode endpoints (GET and POST)
  const qrEndpoints = [
    "/instance/qrcode",
    "/qrcode",
    "/instance/qr",
    "/api/instance/qrcode",
    "/api/instance/qr",
    "/v2/instance/qrcode",
    "/api/v2/instance/qrcode",
  ];

  for (const endpoint of qrEndpoints) {
    for (const method of ["GET", "POST"] as const) {
      try {
        const response = await fetch(`${base}${endpoint}`, { method, headers });
        if (response.ok) {
          const data = await response.json();
          const qr = extractQr(data);
          if (qr) return qr;
        }
        if (response.status === 404 || response.status === 405) continue;
      } catch { /* continue */ }
    }
  }

  // 3. Force disconnect + reconnect to generate a fresh QR
  try {
    const disconnectEndpoints = ["/instance/disconnect", "/instance/logout"];
    for (const ep of disconnectEndpoints) {
      try {
        const r = await fetch(`${base}${ep}`, { method: "POST", headers });
        if (r.ok || r.status === 200) break;
      } catch { /* continue */ }
    }

    // Wait a moment for the server to process
    await new Promise((r) => setTimeout(r, 1500));

    // Retry connect after disconnect
    const reconnect = await fetch(`${base}/instance/connect`, { method: "POST", headers });
    if (reconnect.ok) {
      const data = await reconnect.json();
      const qr = extractQr(data);
      if (qr) return qr;
    }

    // Retry qrcode endpoint after disconnect
    for (const endpoint of ["/instance/qrcode", "/qrcode"]) {
      try {
        const response = await fetch(`${base}${endpoint}`, { method: "GET", headers });
        if (response.ok) {
          const data = await response.json();
          const qr = extractQr(data);
          if (qr) return qr;
        }
      } catch { /* continue */ }
    }
  } catch { /* continue */ }

  throw new Error("QR Code não disponível - a instância pode já estar conectada ou o servidor não suporta este endpoint");
}

export async function disconnectInstanceOnApi(
  instance: Instance,
  globalBaseUrl?: string | null,
): Promise<void> {
  const base = getBaseUrlForInstance(instance, globalBaseUrl);

  const endpoints = [
    { path: "/instance/disconnect", method: "POST" },
    { path: "/instance/disconnect", method: "DELETE" },
    { path: "/instance/disconnect", method: "GET" },
    { path: "/instance/logout", method: "POST" },
    { path: "/instance/logout", method: "DELETE" },
    { path: "/instance/logout", method: "GET" },
  ];

  let success = false;
  let lastError = "";

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${base}${endpoint.path}`, {
        method: endpoint.method,
        headers: { "Content-Type": "application/json", token: instance.uazapi_instance_token },
      });

      if (response.ok || response.status === 200) {
        success = true;
        break;
      }
      if (response.status === 404 || response.status === 405) continue;

      const errorData = await response.json().catch(() => ({}));
      lastError = errorData.message || `Erro ${response.status}`;
    } catch {
      continue;
    }
  }

  if (!success) {
    throw new Error(lastError || "Nenhum endpoint de desconexão funcionou neste servidor UAZAPI");
  }
}

// ---------------------------------------------------------------------------
// Create / Delete instance on UAZAPI
// ---------------------------------------------------------------------------

export async function createInstanceOnApi(
  baseUrl: string,
  adminToken: string,
  name: string,
): Promise<string> {
  const base = baseUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/instance/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json", admintoken: adminToken },
    body: JSON.stringify({ name, systemName: "lovable-ghl-bridge" }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || "Erro ao criar instância na UAZAPI");
  }

  const uazapiData = await response.json();
  const instanceToken = uazapiData.token || uazapiData.instance_token || uazapiData.instanceToken;

  if (!instanceToken) {
    throw new Error("Token da instância não retornado pela API");
  }
  return instanceToken;
}

export async function deleteInstanceFromApi(
  instance: Instance,
  adminToken: string,
  globalBaseUrl?: string | null,
): Promise<void> {
  const deleteBase = instance.uazapi_base_url?.replace(/\/$/, "") || globalBaseUrl?.replace(/\/$/, "");
  if (!deleteBase) throw new Error("Configurações UAZAPI não encontradas");

  // Endpoint principal conforme curl da UAZAPI: DELETE /instance com header token
  const endpoints = [
    { path: "/instance", method: "DELETE" },
    { path: "/instance/delete", method: "DELETE" },
    { path: "/api/instance", method: "DELETE" },
    { path: "/api/instance/delete", method: "DELETE" },
  ];

  let success = false;
  let lastError = "";

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${deleteBase}${ep.path}`, {
        method: ep.method,
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          token: instance.uazapi_instance_token,
        },
      });
      if (res.ok || res.status === 200) {
        success = true;
        break;
      }
      if (res.status === 404 || res.status === 405) continue;
      lastError = `${ep.path} returned ${res.status}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
  }

  if (!success) {
    throw new Error(`Falha ao excluir instância na UAZAPI: ${lastError}`);
  }
}

// ---------------------------------------------------------------------------
// Webhook configuration on UAZAPI
// ---------------------------------------------------------------------------

export async function updateWebhookOnApi(
  instance: Instance,
  webhookUrl: string,
  ignoreGroups: boolean,
  globalBaseUrl?: string | null,
): Promise<void> {
  const base = getBaseUrlForInstance(instance, globalBaseUrl);
  await fetch(`${base}/instance/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: instance.uazapi_instance_token },
    body: JSON.stringify({ webhook_url: webhookUrl, ignore_groups: ignoreGroups }),
  });
}

export async function reconfigureWebhookOnApi(
  instance: Instance,
  webhookUrl: string,
  ignoreGroups: boolean,
  globalBaseUrl?: string | null,
): Promise<void> {
  const base = getBaseUrlForInstance(instance, globalBaseUrl);

  const endpoints = [
    { path: "/instance/webhook", method: "POST" },
    { path: "/api/instance/webhook", method: "POST" },
    { path: "/webhook/set", method: "POST" },
  ];

  let success = false;
  let lastError = "";

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${base}${endpoint.path}`, {
        method: endpoint.method,
        headers: { "Content-Type": "application/json", token: instance.uazapi_instance_token },
        body: JSON.stringify({ webhook_url: webhookUrl, ignore_groups: ignoreGroups }),
      });

      if (response.ok || response.status === 200) {
        success = true;
        break;
      }
      if (response.status === 404 || response.status === 405) continue;

      const errorData = await response.json().catch(() => ({}));
      lastError = errorData.message || `Erro ${response.status}`;
    } catch {
      continue;
    }
  }

  if (!success) {
    throw new Error(lastError || "Nenhum endpoint de webhook funcionou neste servidor UAZAPI");
  }
}

// ---------------------------------------------------------------------------
// Server health check (lightweight ping)
// ---------------------------------------------------------------------------

export async function checkServerHealth(
  instance: Instance,
  globalBaseUrl?: string | null,
): Promise<boolean> {
  try {
    const base = getBaseUrlForInstance(instance, globalBaseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${base}/instance/status`, {
      method: "GET",
      headers: { "Content-Type": "application/json", token: instance.uazapi_instance_token },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Status mapping helper
// ---------------------------------------------------------------------------

export function mapToInstanceStatus(rawStatus: string): InstanceStatus {
  if (["connected", "open", "authenticated"].includes(rawStatus)) return "connected";
  if (["connecting", "qr", "waiting"].includes(rawStatus)) return "connecting";
  return "disconnected";
}
