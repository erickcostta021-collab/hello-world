import { useImpersonation } from "@/hooks/useImpersonation";
import { Button } from "@/components/ui/button";
import { Eye, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function ImpersonationBanner() {
  const { impersonatedUserId, impersonatedEmail, stopImpersonation } = useImpersonation();
  const queryClient = useQueryClient();

  if (!impersonatedUserId) return null;

  const handleStop = () => {
    stopImpersonation();
    // Invalidate all queries so they refetch with the real user
    queryClient.invalidateQueries();
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-black">
      <Eye className="h-4 w-4" />
      <span>
        Visualizando como: <strong>{impersonatedEmail}</strong>
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 border-black/30 bg-black/10 text-black hover:bg-black/20 hover:text-black"
        onClick={handleStop}
      >
        <X className="h-3.5 w-3.5" />
        Voltar ao Admin
      </Button>
    </div>
  );
}
