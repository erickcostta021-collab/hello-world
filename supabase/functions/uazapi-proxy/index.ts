import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

function strip(url: string) {
  return url.replace(/\/+$/, "");
}

async function timedFetch(url: string, init: RequestInit, ms = FETCH_TIMEOUT_MS) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Try multiple candidate paths with retry logic.
 * Returns the first successful response or an error summary.
 */
async function tryPaths(
  baseUrl: string,
  paths: string[],
  init: RequestInit,
): Promise<{ ok: boolean; status: number; data: any }> {
  const base = strip(baseUrl);
  let lastInfo = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    for (const path of paths) {
      const url = `${base}${path}`;
      try {
        const res = await timedFetch(url, init);
        if (res.status === 404 || res.status === 405) continue;
        if ([502, 503, 504].includes(res.status)) {
          lastInfo = `${res.status} gateway error`;
          break; // retry
        }
        const text = await res.text().catch(() => "");
        let data: any;
        try { data = JSON.parse(text); } catch { data = text; }
        return { ok: res.ok, status: res.status, data };
      } catch (e: any) {
        if (e.name === "AbortError") {
          lastInfo = "timeout";
          break; // retry
        }
        lastInfo = e.message || String(e);
        continue;
      }
    }
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { ok: false, status: 0, data: { error: "No endpoint matched", details: lastInfo } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const instanceId = String(body?.instanceId || "").trim();

    const validActions = [
      "status", "connect", "qrcode", "disconnect",
      "create", "delete", "health", "list-all", "passthrough",
    ];

    if (!validActions.includes(action)) {
      return new Response(JSON.stringify({ error: "Ação inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticate user via JWT
    const authHeader = req.headers.get("authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // ── list-all: needs adminToken + baseUrl from settings ──
    if (action === "list-all") {
      const { data: settings } = await admin
        .from("user_settings")
        .select("uazapi_base_url, uazapi_admin_token")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!settings?.uazapi_base_url || !settings?.uazapi_admin_token) {
        return new Response(JSON.stringify({ error: "UAZAPI não configurada" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await tryPaths(
        settings.uazapi_base_url,
        ["/instance/all", "/api/instance/all"],
        {
          method: "GET",
          headers: { "Content-Type": "application/json", admintoken: settings.uazapi_admin_token },
        },
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── create: needs adminToken ──
    if (action === "create") {
      const name = String(body?.name || "").trim();
      const { data: settings } = await admin
        .from("user_settings")
        .select("uazapi_base_url, uazapi_admin_token")
        .eq("user_id", user.id)
        .maybeSingle();

      let createBaseUrl = settings?.uazapi_base_url || "";
      let createAdminToken = settings?.uazapi_admin_token || "";

      // Fallback to admin credentials for managed mode users
      if (!createBaseUrl || !createAdminToken) {
        const { data: adminCreds } = await admin.rpc("get_admin_uazapi_credentials");
        if (adminCreds?.[0]) {
          createBaseUrl = createBaseUrl || adminCreds[0].uazapi_base_url;
          createAdminToken = createAdminToken || adminCreds[0].uazapi_admin_token;
        }
      }

      if (!createBaseUrl || !createAdminToken) {
        return new Response(JSON.stringify({ error: "UAZAPI não configurada" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("[uazapi-proxy] create:", { name, baseUrl: createBaseUrl });

      const base = strip(createBaseUrl);
      try {
        const res = await timedFetch(`${base}/instance/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json", admintoken: createAdminToken },
          body: JSON.stringify({ name, systemName: "Bridge-API" }),
        });
        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = text; }
        console.log("[uazapi-proxy] create result:", { ok: res.ok, status: res.status, data });
        return new Response(JSON.stringify({ ok: res.ok, status: res.status, data }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        console.error("[uazapi-proxy] create error:", e.message);
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── All other actions require an instanceId ──
    if (!instanceId) {
      return new Response(JSON.stringify({ error: "instanceId obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch instance (must belong to the authenticated user)
    const { data: inst, error: instErr } = await admin
      .from("instances")
      .select("id, uazapi_instance_token, uazapi_base_url, user_id")
      .eq("id", instanceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (instErr || !inst) {
      return new Response(JSON.stringify({ error: "Instância não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve base URL
    let baseUrl = inst.uazapi_base_url || "";
    if (!baseUrl) {
      const { data: settings } = await admin
        .from("user_settings")
        .select("uazapi_base_url")
        .eq("user_id", user.id)
        .maybeSingle();
      baseUrl = settings?.uazapi_base_url || "";
    }
    if (!baseUrl) {
      // Try admin credentials for managed mode
      const { data: adminCreds } = await admin.rpc("get_admin_uazapi_credentials");
      if (adminCreds?.[0]?.uazapi_base_url) {
        baseUrl = adminCreds[0].uazapi_base_url;
      }
    }
    if (!baseUrl) {
      return new Response(JSON.stringify({ error: "URL base UAZAPI não configurada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = inst.uazapi_instance_token;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      token,
    };

    // ── passthrough ──
    if (action === "passthrough") {
      const path = String(body?.path || "").trim();
      const method = String(body?.method || "GET").toUpperCase();
      const payload = body?.payload;
      if (!path) {
        return new Response(JSON.stringify({ error: "path obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const base = strip(baseUrl);
      const url = `${base}${path.startsWith("/") ? path : "/" + path}`;
      const init: RequestInit = { method, headers };
      if (payload && ["POST", "PUT", "PATCH"].includes(method)) {
        init.body = JSON.stringify(payload);
      }
      try {
        const res = await timedFetch(url, init);
        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = text; }
        return new Response(JSON.stringify({ ok: res.ok, status: res.status, data }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── status ──
    if (action === "status") {
      console.log("[uazapi-proxy] status:", { baseUrl, instanceId, token: token.substring(0, 8) });
      const result = await tryPaths(baseUrl, [
        "/instance/status", "/api/instance/status",
        "/v2/instance/status", "/api/v2/instance/status",
      ], { method: "GET", headers });
      console.log("[uazapi-proxy] status result:", { ok: result.ok, status: result.status });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── connect ──
    if (action === "connect") {
      console.log("[uazapi-proxy] connect:", { baseUrl, instanceId, token: token.substring(0, 8) });
      const result = await tryPaths(baseUrl, [
        "/instance/connect", "/api/instance/connect",
        "/v2/instance/connect", "/api/v2/instance/connect",
      ], { method: "POST", headers });
      console.log("[uazapi-proxy] connect result:", JSON.stringify(result).substring(0, 500));
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── qrcode ──
    if (action === "qrcode") {
      const result = await tryPaths(baseUrl, [
        "/instance/qrcode", "/qrcode", "/instance/qr",
        "/api/instance/qrcode", "/api/instance/qr",
        "/v2/instance/qrcode", "/api/v2/instance/qrcode",
      ], { method: "GET", headers });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── disconnect ──
    if (action === "disconnect") {
      const endpoints = [
        { path: "/instance/disconnect", method: "POST" },
        { path: "/instance/disconnect", method: "DELETE" },
        { path: "/instance/disconnect", method: "GET" },
        { path: "/instance/logout", method: "POST" },
        { path: "/instance/logout", method: "DELETE" },
        { path: "/instance/logout", method: "GET" },
      ];
      const base = strip(baseUrl);
      let success = false;
      for (const ep of endpoints) {
        try {
          const res = await timedFetch(`${base}${ep.path}`, { method: ep.method, headers });
          if (res.ok || res.status === 200) { success = true; break; }
          if (res.status === 404 || res.status === 405) continue;
        } catch { continue; }
      }
      return new Response(JSON.stringify({ ok: success }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── delete ──
    if (action === "delete") {
      const { data: settings } = await admin
        .from("user_settings")
        .select("uazapi_admin_token")
        .eq("user_id", user.id)
        .maybeSingle();

      let adminToken = settings?.uazapi_admin_token || "";
      if (!adminToken) {
        const { data: adminCreds } = await admin.rpc("get_admin_uazapi_credentials");
        adminToken = adminCreds?.[0]?.uazapi_admin_token || "";
      }

      const deleteHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        token,
      };

      const base = strip(baseUrl);
      const delEndpoints = ["/instance", "/instance/delete", "/api/instance", "/api/instance/delete"];
      let success = false;
      for (const path of delEndpoints) {
        try {
          const res = await timedFetch(`${base}${path}`, { method: "DELETE", headers: deleteHeaders });
          if (res.ok || res.status === 200) { success = true; break; }
          if (res.status === 404 || res.status === 405) continue;
        } catch { continue; }
      }
      return new Response(JSON.stringify({ ok: success }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── health ──
    if (action === "health") {
      try {
        const res = await timedFetch(`${strip(baseUrl)}/instance/status`, {
          method: "GET",
          headers,
        }, 5000);
        return new Response(JSON.stringify({ ok: res.ok || res.status < 500 }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ ok: false }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Ação não implementada" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("uazapi-proxy error:", error);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
