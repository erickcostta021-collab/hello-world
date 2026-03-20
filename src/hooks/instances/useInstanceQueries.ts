import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { getEffectiveUserId } from "@/hooks/useSettings";
import type { Instance } from "./instanceApi";

/**
 * Query: list of instances filtered by optional subaccountId.
 */
export function useInstanceList(subaccountId?: string, sharedFromUserId?: string | null) {
  const { user } = useAuth();
  const impersonatedUserId = useImpersonation((s) => s.impersonatedUserId);

  return useQuery({
    queryKey: ["instances", user?.id, impersonatedUserId, subaccountId, sharedFromUserId],
    queryFn: async () => {
      if (!user) return [];
      const effectiveUserId = impersonatedUserId || await getEffectiveUserId(user.id);

      let query = supabase
        .from("instances")
        .select("*")
        .eq("user_id", effectiveUserId);

      if (subaccountId) {
        query = query.eq("subaccount_id", subaccountId);
      }

      const { data, error } = await query.order("instance_name");
      if (error) throw error;
      return data as Instance[];
    },
    enabled: !!user,
  });
}

/**
 * Query: count of instances linked to a subaccount (counts toward plan limit).
 */
export function useLinkedInstanceCount(sharedFromUserId?: string | null) {
  const { user } = useAuth();
  const impersonatedUserId = useImpersonation((s) => s.impersonatedUserId);

  return useQuery({
    queryKey: ["instance-count-linked", user?.id, impersonatedUserId, sharedFromUserId],
    queryFn: async () => {
      if (!user) return 0;
      const effectiveUserId = impersonatedUserId || await getEffectiveUserId(user.id);

      const { count, error } = await supabase
        .from("instances")
        .select("*", { count: "exact", head: true })
        .eq("user_id", effectiveUserId)
        .not("subaccount_id", "is", null);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });
}

/**
 * Query: count of instances not associated with any subaccount.
 */
export function useUnlinkedInstanceCount(sharedFromUserId?: string | null) {
  const { user } = useAuth();
  const impersonatedUserId = useImpersonation((s) => s.impersonatedUserId);

  return useQuery({
    queryKey: ["instance-count-unlinked", user?.id, impersonatedUserId, sharedFromUserId],
    queryFn: async () => {
      if (!user) return 0;
      const effectiveUserId = impersonatedUserId || await getEffectiveUserId(user.id);

      const { count, error } = await supabase
        .from("instances")
        .select("*", { count: "exact", head: true })
        .eq("user_id", effectiveUserId)
        .is("subaccount_id", null);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });
}
