import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Loader2 } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function Documentation() {
  const [loading, setLoading] = useState(true);

  const proxyUrl = useMemo(() => {
    return `${SUPABASE_URL}/functions/v1/docs-proxy/`;
  }, []);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] w-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Documentação da API</h1>
            <p className="text-xs text-muted-foreground">
              Referência completa dos endpoints da BridgeAPI
            </p>
          </div>
        </div>
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <iframe
            src={proxyUrl}
            className="w-full h-full border-0"
            title="Documentação BridgeAPI"
            onLoad={() => setLoading(false)}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
