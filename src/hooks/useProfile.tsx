import { useAccountStatus, type ProfileData } from "./useAccountStatus";

// Re-export for backward compatibility
export type UserProfile = ProfileData;

export function useProfile() {
  const { profile, instanceLimit, isPaused, isLoading, refetch } = useAccountStatus();

  return {
    profile,
    isLoading,
    refetch,
    instanceLimit,
    isPaused,
  };
}
