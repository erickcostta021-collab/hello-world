import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Action = "status" | "connect" | "qrcode" | "disconnect" | "ghl-users";

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

async function tryFetchJson(
  baseUrl: string,
  candidatePaths: string[],
  init: RequestInit
): Promise<{ ok: boolean; status: number; data: any; usedUrl?: string }>
{
  const base = normalizeBaseUrl(baseUrl);
  let lastText = "";
  for (const path of candidatePaths) {
    const url = `${base}${path}`;
    try {
      const res = await fetch(url, init);
      if (res.status === 404) continue;

      const text = await res.text().catch(() => "");
      lastText = text;
      const data = text ? JSON.parse(text) : {};
      return { ok: res.ok, status: res.status, data, usedUrl: url };
    } catch (e) {
      lastText = e instanceof Error ? e.message : String(e);
      continue;
    }
  }
  return { ok: false, status: 0, data: { error: "No endpoint matched", details: lastText } };
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
    const embedToken = String(body?.embedToken || "").trim();
    const instanceId = String(body?.instanceId || "").trim();
    const action = String(body?.action || "").trim() as Action;

    if (!embedToken || !["status", "connect", "qrcode", "disconnect", "ghl-users"].includes(action)) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For ghl-users action, instanceId is optional (we use locationId from subaccount)
    if (!instanceId && action !== "ghl-users") {
      return new Response(JSON.stringify({ error: "instanceId obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role: validação por embedToken evita acesso indevido.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ============ GHL Users Action ============
    if (action === "ghl-users") {
      const locationId = String(body?.locationId || "").trim();
      if (!locationId) {
        return new Response(JSON.stringify({ error: "locationId obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate embed token belongs to this location
      const { data: sub, error: subErr } = await admin
        .from("ghl_subaccounts")
        .select("id, user_id, ghl_access_token, ghl_refresh_token, ghl_token_expires_at, location_id")
        .eq("embed_token", embedToken)
        .eq("location_id", locationId)
        .maybeSingle();

      if (subErr || !sub) {
        return new Response(JSON.stringify({ error: "Subconta não encontrada" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!sub.ghl_access_token) {
        return new Response(JSON.stringify({ error: "App não instalado na subconta", users: [] }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auto-refresh token if needed
      let token = sub.ghl_access_token;
      if (sub.ghl_token_expires_at && sub.ghl_refresh_token) {
        const expiresAt = new Date(sub.ghl_token_expires_at);
        const now = new Date();
        if (now.getTime() >= expiresAt.getTime() - 5 * 60 * 1000) {
          // Get OAuth credentials
          const { data: settings } = await admin
            .from("user_settings")
            .select("ghl_client_id, ghl_client_secret")
            .eq("user_id", sub.user_id)
            .maybeSingle();

          let clientId = settings?.ghl_client_id;
          let clientSecret = settings?.ghl_client_secret;

          if (!clientId || !clientSecret) {
            const { data: adminCreds } = await admin.rpc("get_admin_oauth_credentials");
            if (adminCreds?.[0]) {
              clientId = adminCreds[0].ghl_client_id;
              clientSecret = adminCreds[0].ghl_client_secret;
            }
          }

          if (clientId && clientSecret) {
            try {
              const tokenRes = await fetch("https://services.leadconnectorhq.com/oauth/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
                body: new URLSearchParams({
                  client_id: clientId,
                  client_secret: clientSecret,
                  grant_type: "refresh_token",
                  refresh_token: sub.ghl_refresh_token,
                  user_type: "Location",
                }).toString(),
              });
              if (tokenRes.ok) {
                const tokenData = await tokenRes.json();
                token = tokenData.access_token;
                await admin
                  .from("ghl_subaccounts")
                  .update({
                    ghl_access_token: tokenData.access_token,
                    ghl_refresh_token: tokenData.refresh_token,
                    ghl_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
                    oauth_last_refresh: new Date().toISOString(),
                  })
                  .eq("id", sub.id);
              }
            } catch (e) {
              console.error("Token refresh failed in proxy:", e);
            }
          }
        }
      }

      // Fetch GHL users server-side
      const ghlRes = await fetch(
        `https://services.leadconnectorhq.com/users/?locationId=${locationId}`,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Version": "2021-07-28",
            "Accept": "application/json",
          },
        }
      );

      if (!ghlRes.ok) {
        return new Response(JSON.stringify({ error: "Falha ao buscar usuários", users: [] }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ghlData = await ghlRes.json();
      // Only return safe fields (id, name, email) - no tokens
      const safeUsers = (ghlData.users || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
      }));

      return new Response(JSON.stringify({ users: safeUsers }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ Instance-based Actions ============
    // Validar se a instância pertence a uma subconta que possui esse embedToken
    const { data: inst, error: instErr } = await admin
      .from("instances")
      .select(
        `id, uazapi_instance_token, uazapi_base_url,
         ghl_subaccounts!inner(id, user_id, embed_token)`
      )
      .eq("id", instanceId)
      .eq("ghl_subaccounts.embed_token", embedToken)
      .maybeSingle();

    if (instErr || !inst) {
      return new Response(JSON.stringify({ error: "Instância não encontrada para este token" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sub = Array.isArray((inst as any).ghl_subaccounts)
      ? (inst as any).ghl_subaccounts[0]
      : (inst as any).ghl_subaccounts;

    const userId = String(sub?.user_id || "");
    if (!userId) {
      return new Response(JSON.stringify({ error: "Subconta inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use per-instance base URL if available, otherwise fall back to user settings
    let uazapiBaseUrl = (inst as any).uazapi_base_url ? String((inst as any).uazapi_base_url) : "";

    if (!uazapiBaseUrl) {
      const { data: settings, error: settingsErr } = await admin
        .from("user_settings")
        .select("uazapi_base_url")
        .eq("user_id", userId)
        .maybeSingle();

      if (settingsErr || !settings?.uazapi_base_url) {
        return new Response(JSON.stringify({ error: "UAZAPI não configurada" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      uazapiBaseUrl = String(settings.uazapi_base_url);
    }

    const instanceToken = String((inst as any).uazapi_instance_token);

    const commonHeaders = {
      "Content-Type": "application/json",
      token: instanceToken,
    };

    if (action === "status") {
      const result = await tryFetchJson(
        uazapiBaseUrl,
        ["/instance/status", "/api/instance/status", "/v2/instance/status", "/api/v2/instance/status"],
        { method: "GET", headers: commonHeaders }
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "connect") {
      const result = await tryFetchJson(
        uazapiBaseUrl,
        ["/instance/connect", "/api/instance/connect", "/v2/instance/connect", "/api/v2/instance/connect"],
        { method: "POST", headers: commonHeaders }
      );
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      // Try multiple disconnect endpoints
      const endpoints = [
        { path: "/instance/disconnect", method: "POST" },
        { path: "/instance/disconnect", method: "DELETE" },
        { path: "/instance/disconnect", method: "GET" },
        { path: "/instance/logout", method: "POST" },
        { path: "/instance/logout", method: "DELETE" },
        { path: "/instance/logout", method: "GET" },
      ];

      const base = normalizeBaseUrl(uazapiBaseUrl);
      let success = false;

      for (const ep of endpoints) {
        try {
          const res = await fetch(`${base}${ep.path}`, {
            method: ep.method,
            headers: commonHeaders,
          });
          if (res.ok || res.status === 200) {
            success = true;
            break;
          }
          if (res.status === 404 || res.status === 405) continue;
        } catch {
          continue;
        }
      }

      // Update DB
      await admin
        .from("instances")
        .update({ instance_status: "disconnected", phone: null, profile_pic_url: null })
        .eq("id", instanceId);

      return new Response(JSON.stringify({ ok: success }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // qrcode
    const result = await tryFetchJson(
      uazapiBaseUrl,
      [
        "/instance/qrcode",
        "/instance/qr",
        "/qrcode",
        "/api/instance/qrcode",
        "/api/instance/qr",
        "/v2/instance/qrcode",
        "/api/v2/instance/qrcode",
      ],
      { method: "GET", headers: commonHeaders }
    );
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("uazapi-proxy-embed error:", error);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
