import { useAccountStatus } from "./useAccountStatus";

export function useSubscription() {
  const {
    hasActiveSubscription,
    instanceLimit,
    isPaused,
    isInGracePeriod,
    gracePeriodEndsAt,
    isLoading,
    refetch,
  } = useAccountStatus();

  return {
    hasActiveSubscription,
    instanceLimit,
    isPaused,
    isInGracePeriod,
    gracePeriodEndsAt,
    isLoading,
    refetch,
  };
}
