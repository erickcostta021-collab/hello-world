/**
 * Pure async functions for UAZAPI API calls.
 * All calls are routed through the uazapi-proxy Edge Function to avoid CORS.
 */

import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

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
// Proxy helper — all UAZAPI calls go through Edge Function
// ---------------------------------------------------------------------------

async function callProxy(body: Record<string, any>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("uazapi-proxy", { body });
  if (error) throw new Error(error.message || "Erro ao chamar proxy UAZAPI");
  return data;
}

// ---------------------------------------------------------------------------
// URL Resolution (kept for backward compat but not used for fetch anymore)
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
  _baseUrl: string,
  _adminToken: string,
): Promise<UazapiInstance[]> {
  const result = await callProxy({ action: "list-all" });

  if (!result?.ok) {
    throw new Error(result?.data?.error || result?.data?.message || "Erro ao buscar instâncias");
  }

  const data = result.data;
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
  _globalBaseUrl?: string | null,
): Promise<{ status: string; phone?: string; profilePicUrl?: string }> {
  try {
    const result = await callProxy({ action: "status", instanceId: instance.id });

    if (!result?.ok) return { status: "disconnected" };

    const data = result.data;
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
  _globalBaseUrl?: string | null,
): Promise<boolean> {
  try {
    const result = await callProxy({ action: "status", instanceId: instance.id });
    if (!result?.ok && [401, 403, 404].includes(result?.status)) return false;
    const data = result?.data;
    if (
      data?.error === true ||
      data?.message?.toLowerCase().includes("not found") ||
      data?.message?.toLowerCase().includes("invalid") ||
      data?.message?.toLowerCase().includes("não encontrad")
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
  _globalBaseUrl?: string | null,
): Promise<string | null> {
  const result = await callProxy({ action: "connect", instanceId: instance.id });
  if (!result?.ok) return null;
  const data = result.data;
  return data.qrcode || data.instance?.qrcode || data.qr || data.base64 || null;
}

export async function getQRCodeFromApi(
  instance: Instance,
  _globalBaseUrl?: string | null,
): Promise<string> {
  const extractQr = (data: any): string | null =>
    data?.qrcode || data?.instance?.qrcode || data?.qr || data?.base64 || data?.code || null;

  // 1. Try connect first (usually generates fresh QR)
  try {
    const connectResult = await callProxy({ action: "connect", instanceId: instance.id });
    if (connectResult?.ok) {
      const qr = extractQr(connectResult.data);
      if (qr) return qr;
    }
  } catch { /* continue */ }

  // 2. Try dedicated qrcode endpoint
  try {
    const qrResult = await callProxy({ action: "qrcode", instanceId: instance.id });
    if (qrResult?.ok) {
      const qr = extractQr(qrResult.data);
      if (qr) return qr;
    }
  } catch { /* continue */ }

  // 3. Force disconnect + reconnect to generate a fresh QR
  try {
    await callProxy({ action: "disconnect", instanceId: instance.id });
    await new Promise((r) => setTimeout(r, 1500));

    const reconnectResult = await callProxy({ action: "connect", instanceId: instance.id });
    if (reconnectResult?.ok) {
      const qr = extractQr(reconnectResult.data);
      if (qr) return qr;
    }

    const qrRetry = await callProxy({ action: "qrcode", instanceId: instance.id });
    if (qrRetry?.ok) {
      const qr = extractQr(qrRetry.data);
      if (qr) return qr;
    }
  } catch { /* continue */ }

  throw new Error("QR Code não disponível - a instância pode já estar conectada ou o servidor não suporta este endpoint");
}

export async function disconnectInstanceOnApi(
  instance: Instance,
  _globalBaseUrl?: string | null,
): Promise<void> {
  const result = await callProxy({ action: "disconnect", instanceId: instance.id });
  if (!result?.ok) {
    throw new Error("Nenhum endpoint de desconexão funcionou neste servidor UAZAPI");
  }
}

// ---------------------------------------------------------------------------
// Create / Delete instance on UAZAPI
// ---------------------------------------------------------------------------

export async function createInstanceOnApi(
  _baseUrl: string,
  _adminToken: string,
  name: string,
): Promise<string> {
  const result = await callProxy({ action: "create", name });
  if (!result?.ok) {
    const msg = result?.data?.message || result?.data?.error || result?.error || "Erro ao criar instância na UAZAPI";
    throw new Error(msg);
  }
  const data = result.data;
  const instanceToken = data.token || data.instance_token || data.instanceToken;
  if (!instanceToken) {
    throw new Error("Token da instância não retornado pela API");
  }
  return instanceToken;
}

export async function deleteInstanceFromApi(
  instance: Instance,
  _adminToken: string,
  _globalBaseUrl?: string | null,
): Promise<void> {
  const result = await callProxy({ action: "delete", instanceId: instance.id });
  if (!result?.ok) {
    throw new Error("Falha ao excluir instância na UAZAPI");
  }
}

// ---------------------------------------------------------------------------
// Webhook configuration on UAZAPI
// ---------------------------------------------------------------------------

export async function updateWebhookOnApi(
  instance: Instance,
  webhookUrl: string,
  ignoreGroups: boolean,
  _globalBaseUrl?: string | null,
  webhookEvents?: string[],
  createNew?: boolean,
  enabled?: boolean,
  webhookId?: string,
  excludeMessages?: string,
): Promise<void> {
  // Route through Edge Function to avoid CORS issues with direct UAZAPI calls
  // Only update the instance record if not creating a new (additional) webhook
  if (!createNew) {
    const { error: updateError } = await supabase
      .from("instances")
      .update({ webhook_url: webhookUrl, ignore_groups: ignoreGroups })
      .eq("id", instance.id);
    if (updateError) throw updateError;
  }

  const { data, error } = await supabase.functions.invoke("configure-webhook", {
    body: {
      instance_id: instance.id,
      webhook_events: webhookEvents,
      create_new: createNew,
      webhook_url_override: createNew ? webhookUrl : undefined,
      enabled: enabled ?? true,
      webhook_id: webhookId,
      exclude_messages: excludeMessages,
    },
  });

  if (error) throw new Error(`Falha ao configurar webhook: ${error.message}`);
  if (data?.error) throw new Error(`Falha ao configurar webhook: ${data.error}`);
}

export async function reconfigureWebhookOnApi(
  instance: Instance,
  _webhookUrl: string,
  _ignoreGroups: boolean,
  _globalBaseUrl?: string | null,
): Promise<void> {
  // Route through Edge Function to avoid CORS issues
  const { data, error } = await supabase.functions.invoke("configure-webhook", {
    body: { instance_id: instance.id },
  });

  if (error) throw new Error(`Falha ao reconfigurar webhook: ${error.message}`);
  if (data?.error) throw new Error(`Falha ao reconfigurar webhook: ${data.error}`);
}

// ---------------------------------------------------------------------------
// Server health check (lightweight ping)
// ---------------------------------------------------------------------------

export async function checkServerHealth(
  instance: Instance,
  _globalBaseUrl?: string | null,
): Promise<boolean> {
  try {
    const result = await callProxy({ action: "health", instanceId: instance.id });
    return result?.ok === true;
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
