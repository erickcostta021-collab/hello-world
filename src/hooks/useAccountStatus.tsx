import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const GRACE_PERIOD_DAYS = 3;

export interface ProfileData {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  is_paused: boolean;
  paused_at: string | null;
  instance_limit: number;
  created_at: string;
  updated_at: string;
}

export interface AccountStatus {
  profile: ProfileData | null;
  instanceLimit: number;
  isPaused: boolean;
  isInGracePeriod: boolean;
  gracePeriodEndsAt: Date | null;
  hasActiveSubscription: boolean;
}

const DEFAULT_STATUS: AccountStatus = {
  profile: null,
  instanceLimit: 0,
  isPaused: false,
  isInGracePeriod: false,
  gracePeriodEndsAt: null,
  hasActiveSubscription: false,
};

/**
 * Unified hook that consolidates profile, subscription, and pause status
 * into a single database query. Replaces separate useProfile, useSubscription,
 * and usePausedCheck queries.
 */
export function useAccountStatus() {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["account-status", user?.id],
    queryFn: async (): Promise<AccountStatus> => {
      if (!user) return DEFAULT_STATUS;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      if (!profile) return DEFAULT_STATUS;

      let isPaused = profile.is_paused ?? false;
      const pausedAt = profile.paused_at ? new Date(profile.paused_at) : null;
      const instanceLimit = profile.instance_limit ?? 0;

      let isInGracePeriod = false;
      let gracePeriodEndsAt: Date | null = null;

      if (!isPaused && pausedAt) {
        const endsAt = new Date(pausedAt);
        endsAt.setDate(endsAt.getDate() + GRACE_PERIOD_DAYS);
        const now = new Date();

        if (now < endsAt) {
          isInGracePeriod = true;
          gracePeriodEndsAt = endsAt;
        } else {
          // Grace period expired locally but cron hasn't run yet
          isPaused = true;
        }
      }

      const hasActiveSubscription = instanceLimit > 0 && !isPaused;

      return {
        profile: profile as ProfileData,
        instanceLimit,
        isPaused,
        isInGracePeriod,
        gracePeriodEndsAt,
        hasActiveSubscription,
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60, // 1 minute
  });

  return {
    ...(data ?? DEFAULT_STATUS),
    isLoading,
    refetch,
  };
}
