import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useSettings, getEffectiveUserId } from "./useSettings";
import { toast } from "sonner";

export interface Subaccount {
  id: string;
  user_id: string;
  location_id: string;
  account_name: string;
  ghl_user_id: string | null;
  ghl_subaccount_token: string | null;
  ghl_access_token: string | null;
  embed_token: string | null;
}

export function useSubaccounts() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const queryClient = useQueryClient();

  // Check if this account is sharing from another user
  const isSharedAccount = !!settings?.shared_from_user_id;

  const hasAgencyToken = !!settings?.ghl_agency_token;

  const { data: subaccounts, isLoading } = useQuery({
    queryKey: ["subaccounts", user?.id, settings?.shared_from_user_id, hasAgencyToken],
    queryFn: async () => {
      if (!user) return [];
      
      // Get effective user ID (original owner if shared)
      const effectiveUserId = await getEffectiveUserId(user.id);
      
      let query = supabase
        .from("ghl_subaccounts")
        .select("*")
        .eq("user_id", effectiveUserId);
      
      // If no agency token, only show subaccounts with the app installed (via OAuth)
      if (!hasAgencyToken) {
        query = query.not("ghl_access_token", "is", null);
      }
      
      const { data, error } = await query.order("account_name");

      if (error) throw error;
      return data as Subaccount[];
    },
    enabled: !!user,
  });

  const syncSubaccounts = useMutation({
    mutationFn: async () => {
      if (!user || !settings?.ghl_agency_token) {
        throw new Error("Token de agência GHL não configurado");
      }

      // GHL Private Integration Token format: pit-{companyId}-...
      // Extract companyId from token (second segment after pit-)
      const tokenParts = settings.ghl_agency_token.split("-");
      const companyId = tokenParts.length >= 2 ? tokenParts[1] : "";

      if (!companyId) {
        throw new Error("Token inválido - não foi possível extrair o Company ID");
      }

      // Call GHL API to get locations using GET method
      const response = await fetch(
        `https://services.leadconnectorhq.com/locations/search?companyId=${companyId}&limit=100`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${settings.ghl_agency_token}`,
            "Version": "2021-07-28",
            "Accept": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.message || errorData.error || `Erro ${response.status}`;
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const locations = data.locations || [];

      if (locations.length === 0) {
        throw new Error("Nenhuma subconta encontrada. Verifique se o token tem permissão de agência.");
      }

      // Usar função RPC para upsert que ignora RLS
      const locationsJson = locations.map((l: any) => ({
        id: l.id,
        name: l.name,
      }));

      const { error: upsertError } = await supabase.rpc("upsert_subaccounts", {
        p_user_id: user.id,
        p_locations: locationsJson,
      });

      if (upsertError) {
        throw new Error("Erro ao salvar subcontas: " + upsertError.message);
      }

      return locations.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["subaccounts"] });
      toast.success(`${count} subcontas sincronizadas!`);
    },
    onError: (error) => {
      toast.error("Erro ao sincronizar: " + error.message);
    },
  });

  return {
    subaccounts: subaccounts || [],
    isLoading,
    syncSubaccounts,
    isSharedAccount,
  };
}
