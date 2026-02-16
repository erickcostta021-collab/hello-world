import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { getOAuthRedirectUri } from "@/lib/canonicalOrigin";

export interface UserSettings {
  id: string;
  user_id: string;
  track_id: string | null;
  ghl_agency_token: string | null;
  ghl_client_id: string | null;
  ghl_client_secret: string | null;
  ghl_conversation_provider_id: string | null;
  uazapi_admin_token: string | null;
  uazapi_base_url: string | null;
  global_webhook_url: string | null;
  external_supabase_url: string | null;
  external_supabase_key: string | null;
  external_supabase_pat: string | null;
  shared_from_user_id: string | null;
}

// Get the effective user ID (for shared accounts, returns the original owner's ID)
export async function getEffectiveUserId(userId: string): Promise<string> {
  const { data } = await supabase
    .rpc("get_effective_user_id", { p_user_id: userId });
  return data || userId;
}

// Configure global webhook on UAZAPI (admin level - all instances)
async function configureGlobalWebhook(
  baseUrl: string,
  adminToken: string,
  webhookUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const base = baseUrl.replace(/\/$/, "");

    // Some UAZAPI servers expose this route with different prefixes.
    // We try a small set of candidates to avoid the user needing to guess.
    const candidatePaths = ["/globalwebhook", "/api/globalwebhook"];

    const body = {
      url: webhookUrl,
      enabled: true,
      events: ["messages", "messages_update"],
      // Do NOT exclude wasSentByApi - we need these messages to sync AI agent responses (track_id=agente_ia)
      // Loop prevention is handled in webhook-inbound by checking track_id
    };

    let response: Response | null = null;
    for (const path of candidatePaths) {
      // eslint-disable-next-line no-await-in-loop
      const r = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          admintoken: adminToken,
        },
        body: JSON.stringify(body),
      });

      // If the endpoint doesn't exist on this server, try the next.
      if (r.status === 404) continue;

      response = r;
      break;
    }

    if (!response) {
      return { success: false, error: "Endpoint /globalwebhook não encontrado (tente conferir se a API usa /api)" };
    }
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const errorMsg = data.message || `HTTP ${response.status}`;
      return { success: false, error: errorMsg };
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro de conexão" };
  }
}

export function useSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["user-settings", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data as UserSettings | null;
    },
    enabled: !!user,
  });

  const updateSettings = useMutation({
    mutationFn: async (newSettings: Partial<Omit<UserSettings, "id" | "user_id">>) => {
      if (!user) throw new Error("Not authenticated");

      // Check if agency token is being set and if it already belongs to another user
      if (newSettings.ghl_agency_token) {
        const { data: existingOwner } = await supabase
          .rpc("get_token_owner", { p_agency_token: newSettings.ghl_agency_token });

        if (existingOwner && existingOwner !== user.id) {
          // Token already owned by someone else - set up sharing
          const { data, error } = await supabase
            .from("user_settings")
            .update({ 
              ...newSettings, 
              shared_from_user_id: existingOwner 
            })
            .eq("user_id", user.id)
            .select()
            .single();

          if (error) throw error;
          
          toast.info("Token já em uso! Espelhando dashboard da conta principal.");
          return data;
        }
      }

      // If changing token and was previously shared, clear sharing
      if (newSettings.ghl_agency_token && settings?.shared_from_user_id) {
        newSettings = { ...newSettings, shared_from_user_id: null } as typeof newSettings;
      }

      const { data, error } = await supabase
        .from("user_settings")
        .update(newSettings)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      queryClient.invalidateQueries({ queryKey: ["subaccounts"] });
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      toast.success("Configurações salvas com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao salvar configurações: " + error.message);
    },
  });

  // Apply global webhook at admin level in UAZAPI
  const applyGlobalWebhook = useMutation({
    mutationFn: async (webhookUrl: string) => {
      if (!user) throw new Error("Not authenticated");
      if (!settings?.uazapi_base_url) throw new Error("URL base da UAZAPI não configurada");
      if (!settings?.uazapi_admin_token) throw new Error("Token Admin da UAZAPI não configurado");

      const result = await configureGlobalWebhook(
        settings.uazapi_base_url,
        settings.uazapi_admin_token,
        webhookUrl
      );

      if (!result.success) {
        throw new Error(result.error || "Falha ao configurar webhook global na UAZAPI");
      }

      return { success: true };
    },
    onSuccess: () => {
      toast.success("Webhook global configurado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao aplicar webhook: " + error.message);
    },
  });

  // Fetch admin OAuth credentials
  const { data: adminCredentials } = useQuery({
    queryKey: ["admin-oauth-credentials"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_oauth_credentials");
      if (error) {
        console.error("Error fetching admin credentials:", error);
        return null;
      }
      return data?.[0] || null;
    },
  });

  // Generate OAuth URL - uses admin credentials or fallback to marketplace app
  const getOAuthUrl = () => {
    // Priority: admin credentials > own settings > marketplace fallback
    const clientId = adminCredentials?.ghl_client_id || settings?.ghl_client_id || "69714e4c3c479f8c8e5e8e2d-mkpu6ehw";

    // IMPORTANT: Use the canonical (published) origin for redirect_uri.
    // The Preview domain is temporary and will cause "Missing user context in state"
    // when the provider redirects elsewhere.
    const redirectUri = getOAuthRedirectUri();

    // State is used by the backend callback to identify which logged-in user
    // initiated the installation.
    const state = btoa(JSON.stringify({ userId: user?.id }));
    
    const scopes = [
      "locations.readonly",
      "contacts.readonly",
      "contacts.write",
      "opportunities.readonly",
      "opportunities.write",
      "users.readonly",
      "conversations/message.write",
      "conversations/message.readonly",
      "users.write",
      "calendars/events.readonly",
      "calendars/events.write",
      "calendars/groups.readonly",
      "calendars/groups.write",
      "calendars/resources.readonly",
      "calendars/resources.write",
      "conversations/reports.readonly",
      "conversations/livechat.write",
      "socialplanner/post.write",
      "workflows.readonly",
      "recurring-tasks.readonly",
      "recurring-tasks.write",
      "locations/customValues.readonly",
      "locations/customValues.write",
      "locations/customFields.readonly",
      "locations/customFields.write",
      "locations/tasks.readonly",
      "locations/tasks.write",
      "conversations.readonly",
      "conversations.write",
      "calendars.write",
      "calendars.readonly",
      "locations/tags.readonly",
      "locations/tags.write",
    ].join(" ");
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes,
      state,
    });
    
    return `https://marketplace.leadconnectorhq.com/oauth/chooselocation?${params.toString()}`;
  };

  return {
    settings,
    isLoading,
    updateSettings,
    applyGlobalWebhook,
    getOAuthUrl,
  };
}
