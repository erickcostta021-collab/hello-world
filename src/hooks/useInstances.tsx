import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useSettings, getEffectiveUserId } from "./useSettings";
import { useProfile } from "./useProfile";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

// Re-export types from instanceApi for backward compatibility
export type { Instance, UazapiInstance } from "./instances/instanceApi";

import {
  type Instance,
  type UazapiInstance,
  fetchAllUazapiInstances,
  fetchInstanceStatus,
  checkInstanceExistsOnApi,
  connectInstanceOnApi,
  getQRCodeFromApi,
  disconnectInstanceOnApi,
  createInstanceOnApi,
  deleteInstanceFromApi,
  updateWebhookOnApi,
  reconfigureWebhookOnApi,
  mapToInstanceStatus,
  getBaseUrlForInstance,
} from "./instances/instanceApi";

import {
  useInstanceList,
  useLinkedInstanceCount,
  useUnlinkedInstanceCount,
} from "./instances/useInstanceQueries";

type InstanceStatus = Database["public"]["Enums"]["instance_status"];

/** Invalidate all instance-related queries */
function invalidateInstanceQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["instances"] });
  queryClient.invalidateQueries({ queryKey: ["instance-count-linked"] });
  queryClient.invalidateQueries({ queryKey: ["instance-count-unlinked"] });
  queryClient.invalidateQueries({ queryKey: ["all-user-instances"] });
}

export function useInstances(subaccountId?: string) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { instanceLimit } = useProfile();
  const queryClient = useQueryClient();

  const isSharedAccount = !!settings?.shared_from_user_id;
  const globalBaseUrl = settings?.uazapi_base_url ?? null;

  // ── Queries ──────────────────────────────────────────────────────────
  const { data: linkedInstanceCount = 0 } = useLinkedInstanceCount(settings?.shared_from_user_id);
  const { data: unlinkedInstanceCount = 0 } = useUnlinkedInstanceCount(settings?.shared_from_user_id);
  const { data: instances, isLoading } = useInstanceList(subaccountId, settings?.shared_from_user_id);

  // ── Helper: fetch UAZAPI instances list ──────────────────────────────
  const fetchUazapiInstances = async (): Promise<UazapiInstance[]> => {
    if (!settings?.uazapi_admin_token || !settings?.uazapi_base_url) {
      throw new Error("Configurações UAZAPI não encontradas");
    }
    return fetchAllUazapiInstances(settings.uazapi_base_url, settings.uazapi_admin_token);
  };

  // ── Status Mutations ────────────────────────────────────────────────
  const syncInstanceStatus = useMutation({
    mutationFn: async (instance: Instance): Promise<{ status: InstanceStatus; phone?: string; profilePicUrl?: string }> => {
      const result = await fetchInstanceStatus(instance, globalBaseUrl);
      const mappedStatus = mapToInstanceStatus(result.status);

      const updateData: Record<string, unknown> = { instance_status: mappedStatus };
      if (result.phone) updateData.phone = result.phone;
      if (result.profilePicUrl) updateData.profile_pic_url = result.profilePicUrl;

      const { error } = await supabase
        .from("instances")
        .update(updateData)
        .eq("id", instance.id);

      if (error) throw error;
      return { status: mappedStatus, phone: result.phone, profilePicUrl: result.profilePicUrl };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
    },
  });

  const syncAllInstancesStatus = useMutation({
    mutationFn: async (): Promise<{ successful: number; failed: number; notFound: string[]; total: number }> => {
      if (!instances || instances.length === 0) {
        throw new Error("Nenhuma instância para atualizar");
      }

      const notFoundInstances: string[] = [];

      const results = await Promise.allSettled(
        instances.map(async (instance) => {
          const result = await fetchInstanceStatus(instance, globalBaseUrl);
          const instanceExists = await checkInstanceExistsOnApi(instance, globalBaseUrl);

          if (!instanceExists) {
            notFoundInstances.push(instance.id);
            return { id: instance.id, status: "not_found" as const };
          }

          const mappedStatus = mapToInstanceStatus(result.status);
          const updateData: Record<string, unknown> = { instance_status: mappedStatus };
          if (result.phone) updateData.phone = result.phone;
          if (result.profilePicUrl) updateData.profile_pic_url = result.profilePicUrl;

          await supabase.from("instances").update(updateData).eq("id", instance.id);
          return { id: instance.id, status: mappedStatus };
        }),
      );

      const successful = results.filter((r) => r.status === "fulfilled" && (r.value as any).status !== "not_found").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      return { successful, failed, notFound: notFoundInstances, total: instances.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });

      if (data.notFound.length > 0) {
        toast.warning(`${data.notFound.length} instância(s) não encontrada(s) no servidor UAZAPI`, {
          description: "Clique em 'Limpar' para removê-las",
          action: {
            label: "Limpar",
            onClick: () => {
              data.notFound.forEach(async (id) => {
                await supabase.from("instances").delete().eq("id", id);
              });
              queryClient.invalidateQueries({ queryKey: ["instances"] });
              toast.success("Instâncias inexistentes removidas!");
            },
          },
          duration: 10000,
        });
      } else if (data.failed > 0) {
        toast.success(`${data.successful} instâncias atualizadas, ${data.failed} falharam`);
      } else {
        toast.success(`${data.successful} instâncias atualizadas com sucesso!`);
      }
    },
    onError: (error) => {
      toast.error("Erro ao atualizar instâncias: " + error.message);
    },
  });

  // ── CRUD Mutations ──────────────────────────────────────────────────
  const importInstance = useMutation({
    mutationFn: async ({
      uazapiInstance,
      subaccountId,
    }: {
      uazapiInstance: UazapiInstance;
      subaccountId: string;
    }) => {
      if (!user) throw new Error("Não autenticado");

      // Fresh count from DB to avoid stale cache
      if (instanceLimit > 0) {
        const effectiveUserId = await getEffectiveUserId(user.id);
        const { count, error: countError } = await supabase
          .from("instances")
          .select("*", { count: "exact", head: true })
          .eq("user_id", effectiveUserId)
          .not("subaccount_id", "is", null);

        if (countError) throw countError;
        if ((count ?? 0) >= instanceLimit) {
          throw new Error(`Limite de instâncias atingido (${instanceLimit}). Faça upgrade do seu plano para adicionar mais instâncias.`);
        }
      }

      // Check if already exists
      const { data: existing } = await supabase
        .from("instances")
        .select("id, subaccount_id")
        .eq("uazapi_instance_token", uazapiInstance.token)
        .maybeSingle();

      if (existing && existing.subaccount_id) {
        throw new Error("Esta instância já está vinculada a uma subconta");
      }

      // Re-link if unlinked
      if (existing && !existing.subaccount_id) {
        const { data, error } = await supabase
          .from("instances")
          .update({ subaccount_id: subaccountId })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      // Create new
      const mappedStatus = mapToInstanceStatus(uazapiInstance.status);
      const { data, error } = await supabase
        .from("instances")
        .insert({
          user_id: user.id,
          subaccount_id: subaccountId,
          instance_name: uazapiInstance.name,
          uazapi_instance_token: uazapiInstance.token,
          instance_status: mappedStatus,
          webhook_url: uazapiInstance.webhook_url || settings?.global_webhook_url || null,
          ignore_groups: false,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidateInstanceQueries(queryClient);
      toast.success("Instância vinculada com sucesso!");

      // Auto-sync status after import
      if (data) {
        const instanceForSync: Instance = {
          id: data.id,
          user_id: data.user_id,
          subaccount_id: data.subaccount_id,
          instance_name: data.instance_name,
          uazapi_instance_token: data.uazapi_instance_token,
          instance_status: data.instance_status as InstanceStatus,
          webhook_url: data.webhook_url,
          ignore_groups: data.ignore_groups,
          ghl_user_id: data.ghl_user_id,
          phone: data.phone,
          profile_pic_url: data.profile_pic_url,
          uazapi_base_url: data.uazapi_base_url,
          is_official_api: data.is_official_api,
        };
        syncInstanceStatus.mutate(instanceForSync);
      }
    },
    onError: (error) => {
      toast.error("Erro ao importar: " + error.message);
    },
  });

  const createInstance = useMutation({
    mutationFn: async ({ name, subaccountId }: { name: string; subaccountId: string }) => {
      if (!user || !settings?.uazapi_admin_token || !settings?.uazapi_base_url) {
        throw new Error("Configurações UAZAPI não encontradas");
      }

      // Fresh count from DB
      if (instanceLimit > 0) {
        const effectiveUserId = await getEffectiveUserId(user.id);
        const { count, error: countError } = await supabase
          .from("instances")
          .select("*", { count: "exact", head: true })
          .eq("user_id", effectiveUserId)
          .not("subaccount_id", "is", null);
        if (countError) throw countError;
        if ((count ?? 0) >= instanceLimit) {
          throw new Error(`Limite de instâncias atingido (${instanceLimit}). Faça upgrade do seu plano para adicionar mais instâncias.`);
        }
      }

      const instanceToken = await createInstanceOnApi(settings.uazapi_base_url, settings.uazapi_admin_token, name);

      const { data, error } = await supabase
        .from("instances")
        .insert({
          user_id: user.id,
          subaccount_id: subaccountId,
          instance_name: name,
          uazapi_instance_token: instanceToken,
          instance_status: "disconnected" as InstanceStatus,
          webhook_url: settings.global_webhook_url,
          ignore_groups: false,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateInstanceQueries(queryClient);
      toast.success("Instância criada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar instância: " + error.message);
    },
  });

  const deleteInstance = useMutation({
    mutationFn: async ({ instance, deleteFromUazapi = false }: { instance: Instance; deleteFromUazapi?: boolean }) => {
      if (deleteFromUazapi) {
        await deleteInstanceFromApi(instance, settings?.uazapi_admin_token || "", globalBaseUrl);
      }
      const { error } = await supabase.from("instances").delete().eq("id", instance.id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      invalidateInstanceQueries(queryClient);
      toast.success(
        variables.deleteFromUazapi
          ? "Instância excluída do sistema e da UAZAPI!"
          : "Instância removida do sistema!",
      );
    },
    onError: (error) => {
      toast.error("Erro ao excluir: " + error.message);
    },
  });

  const unlinkInstance = useMutation({
    mutationFn: async (instance: Instance) => {
      const { error } = await supabase
        .from("instances")
        .update({ subaccount_id: null })
        .eq("id", instance.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateInstanceQueries(queryClient);
      toast.success("Instância desvinculada da subconta!");
    },
    onError: (error) => {
      toast.error("Erro ao desvincular: " + error.message);
    },
  });

  // ── Connect / Disconnect ────────────────────────────────────────────
  const getQRCode = async (instance: Instance): Promise<string> => {
    const qr = await getQRCodeFromApi(instance, globalBaseUrl);
    // Update status to connecting
    await supabase.from("instances").update({ instance_status: "connecting" }).eq("id", instance.id);
    queryClient.invalidateQueries({ queryKey: ["instances"] });
    return qr;
  };

  const connectInstance = async (instance: Instance): Promise<string | null> => {
    const qrCode = await connectInstanceOnApi(instance, globalBaseUrl);
    await supabase.from("instances").update({ instance_status: "connecting" }).eq("id", instance.id);
    queryClient.invalidateQueries({ queryKey: ["instances"] });
    return qrCode;
  };

  const disconnectInstance = useMutation({
    mutationFn: async (instance: Instance) => {
      await disconnectInstanceOnApi(instance, globalBaseUrl);
      const { error } = await supabase
        .from("instances")
        .update({ instance_status: "disconnected", phone: null, profile_pic_url: null })
        .eq("id", instance.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      toast.success("Instância desconectada!");
    },
    onError: (error) => {
      toast.error("Erro ao desconectar: " + error.message);
    },
  });

  // ── Webhook / Config Mutations ──────────────────────────────────────
  const updateInstanceWebhook = useMutation({
    mutationFn: async ({ instance, webhookUrl, ignoreGroups }: { instance: Instance; webhookUrl: string; ignoreGroups: boolean }) => {
      await updateWebhookOnApi(instance, webhookUrl, ignoreGroups, globalBaseUrl);
      const { error } = await supabase
        .from("instances")
        .update({ webhook_url: webhookUrl, ignore_groups: ignoreGroups })
        .eq("id", instance.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      toast.success("Webhook atualizado!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar webhook: " + error.message);
    },
  });

  const reconfigureWebhook = useMutation({
    mutationFn: async (instance: Instance) => {
      const webhookUrl = instance.webhook_url || settings?.global_webhook_url || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-inbound`;
      const ignoreGroups = instance.ignore_groups ?? false;

      await reconfigureWebhookOnApi(instance, webhookUrl, ignoreGroups, globalBaseUrl);

      const { error } = await supabase
        .from("instances")
        .update({ webhook_url: webhookUrl, ignore_groups: ignoreGroups })
        .eq("id", instance.id);
      if (error) throw error;
      return { webhookUrl };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      toast.success(`Webhook reconfigurado! URL: ${data.webhookUrl.substring(0, 50)}...`);
    },
    onError: (error) => {
      toast.error("Erro ao reconfigurar webhook: " + error.message);
    },
  });

  const updateInstanceGHLUser = useMutation({
    mutationFn: async ({ instanceId, ghlUserId }: { instanceId: string; ghlUserId: string | null }) => {
      const { error } = await supabase
        .from("instances")
        .update({ ghl_user_id: ghlUserId })
        .eq("id", instanceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      toast.success("Usuário GHL atribuído com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atribuir usuário: " + error.message);
    },
  });

  const updateInstanceOfficialApi = useMutation({
    mutationFn: async ({ instanceId, isOfficialApi }: { instanceId: string; isOfficialApi: boolean }) => {
      const { error } = await supabase
        .from("instances")
        .update({ is_official_api: isOfficialApi })
        .eq("id", instanceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      toast.success("Configuração de API Oficial atualizada!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });

  // ── Return (same interface as before) ───────────────────────────────
  return {
    instances: instances || [],
    isLoading,
    createInstance,
    deleteInstance,
    unlinkInstance,
    importInstance,
    getQRCode,
    connectInstance,
    disconnectInstance,
    syncInstanceStatus,
    syncAllInstancesStatus,
    updateInstanceWebhook,
    updateInstanceGHLUser,
    updateInstanceOfficialApi,
    reconfigureWebhook,
    fetchUazapiInstances,
    instanceLimit,
    linkedInstanceCount,
    unlinkedInstanceCount,
    totalInstanceCount: linkedInstanceCount + unlinkedInstanceCount,
    canCreateInstance: instanceLimit === 0 || linkedInstanceCount < instanceLimit,
  };
}
