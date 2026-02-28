// Thin wrapper that delegates to AuthContext for backward compatibility.
// All components importing useAuth continue to work unchanged.
import { useAuthContext } from "@/contexts/AuthContext";

export function useAuth() {
  return useAuthContext();
}
