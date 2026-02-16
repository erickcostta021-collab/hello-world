import { useEffect, useRef } from "react";
import { useAuth } from "./useAuth";
import { useAccountStatus } from "./useAccountStatus";

export function usePausedCheck() {
  const { signOut } = useAuth();
  const { isPaused, isInGracePeriod, gracePeriodEndsAt, isLoading } = useAccountStatus();
  const didSignOutRef = useRef(false);

  useEffect(() => {
    if (!isLoading && isPaused && !didSignOutRef.current) {
      didSignOutRef.current = true;
      signOut();
    }
  }, [isPaused, isLoading, signOut]);

  return {
    isPaused,
    isInGracePeriod,
    gracePeriodEndsAt,
    checking: isLoading,
  };
}
