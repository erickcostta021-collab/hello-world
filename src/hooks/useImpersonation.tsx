import { create } from "zustand";

interface ImpersonationState {
  impersonatedUserId: string | null;
  impersonatedEmail: string | null;
  startImpersonation: (userId: string, email: string) => void;
  stopImpersonation: () => void;
}

export const useImpersonation = create<ImpersonationState>((set) => ({
  impersonatedUserId: null,
  impersonatedEmail: null,
  startImpersonation: (userId, email) =>
    set({ impersonatedUserId: userId, impersonatedEmail: email }),
  stopImpersonation: () =>
    set({ impersonatedUserId: null, impersonatedEmail: null }),
}));

/**
 * Returns the effective user ID for data queries.
 * If admin is impersonating, returns the impersonated user's ID.
 * Otherwise returns the real user's ID.
 */
export function useEffectiveUserId(realUserId: string | undefined): string | undefined {
  const impersonatedUserId = useImpersonation((s) => s.impersonatedUserId);
  return impersonatedUserId || realUserId;
}
