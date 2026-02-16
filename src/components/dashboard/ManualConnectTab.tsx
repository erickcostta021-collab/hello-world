import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, HelpCircle, Link2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { useQueryClient } from "@tanstack/react-query";
import { reconfigureWebhookOnApi } from "@/hooks/instances/instanceApi";

interface ManualConnectTabProps {
  subaccountId: string;
  canCreateInstance: boolean;
  onSuccess: () => void;
}

type ValidationState = "idle" | "validating" | "valid" | "invalid";

export function ManualConnectTab({
  subaccountId,
  canCreateInstance,
  onSuccess,
}: ManualConnectTabProps) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const queryClient = useQueryClient();

  const [serverUrl, setServerUrl] = useState(settings?.uazapi_base_url || "");
  const [instanceToken, setInstanceToken] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [validationState, setValidationState] = useState<ValidationState>("idle");
  const [validationMessage, setValidationMessage] = useState("");
  const [connecting, setConnecting] = useState(false);

  const trimmedUrl = serverUrl.trim().replace(/\/$/, "");
  const trimmedToken = instanceToken.trim();
  const trimmedName = instanceName.trim();

  const isFormValid = trimmedUrl && trimmedToken && trimmedName && validationState !== "validating";

  const validateInstance = async () => {
    if (!trimmedUrl || !trimmedToken) {
      toast.error("Preencha o Server URL e o Token antes de validar");
      return;
    }

    setValidationState("validating");
    setValidationMessage("");

    try {
      const candidatePaths = ["/instance/status", "/api/instance/status"];
      let response: Response | null = null;

      for (const path of candidatePaths) {
        const url = `${trimmedUrl}${path}`;
        const r = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            token: trimmedToken,
          },
        });
        if (r.status === 404) continue;
        response = r;
        break;
      }

      if (!response) {
        setValidationState("invalid");
        setValidationMessage("Endpoint não encontrado. Verifique o Server URL.");
        return;
      }

      if (!response.ok) {
        setValidationState("invalid");
        setValidationMessage(`Erro ${response.status}: token inválido ou servidor inacessível.`);
        return;
      }

      const data = await response.json();

      // Try to extract instance name from response
      const detectedName =
        data.instance?.name || data.name || data.instanceName || "";
      if (detectedName && !trimmedName) {
        setInstanceName(detectedName);
      }

      setValidationState("valid");
      setValidationMessage("Instância encontrada e acessível!");
    } catch (err: any) {
      setValidationState("invalid");
      setValidationMessage(
        err.message?.includes("Failed to fetch")
          ? "Não foi possível conectar ao servidor. Verifique o URL e tente novamente."
          : `Erro: ${err.message}`
      );
    }
  };

  const handleConnect = async () => {
    if (!user || !isFormValid || !canCreateInstance) return;

    setConnecting(true);
    try {
      // Check if already imported
      const { data: existing } = await supabase
        .from("instances")
        .select("id")
        .eq("uazapi_instance_token", trimmedToken)
        .maybeSingle();

      if (existing) {
        toast.error("Esta instância já está vinculada ao sistema");
        setConnecting(false);
        return;
      }

      // Manual instances store their own base URL — do NOT sync to user_settings
      const webhookUrl = settings?.global_webhook_url || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-inbound`;
      
      const { error } = await supabase.from("instances").insert({
        user_id: user.id,
        subaccount_id: subaccountId,
        instance_name: trimmedName,
        uazapi_instance_token: trimmedToken,
        instance_status: "disconnected",
        webhook_url: webhookUrl,
        ignore_groups: false,
        uazapi_base_url: trimmedUrl, // Per-instance base URL
      });

      if (error) throw error;

      // Configure webhook on UAZAPI so inbound messages are forwarded to our endpoint
      try {
        const tempInstance = {
          uazapi_instance_token: trimmedToken,
          uazapi_base_url: trimmedUrl,
        } as any;
        await reconfigureWebhookOnApi(tempInstance, webhookUrl, false);
        console.log("✅ Webhook configured on UAZAPI successfully");
      } catch (webhookErr: any) {
        console.error("Failed to configure webhook on UAZAPI:", webhookErr);
        toast.warning("Instância conectada, mas o webhook não foi configurado automaticamente na UAZAPI. Configure manualmente o webhook apontando para: " + webhookUrl);
      }

      queryClient.invalidateQueries({ queryKey: ["instances"] });
      queryClient.invalidateQueries({ queryKey: ["instance-count-linked"] });
      queryClient.invalidateQueries({ queryKey: ["instance-count-unlinked"] });
      queryClient.invalidateQueries({ queryKey: ["all-user-instances"] });

      toast.success("Instância conectada com sucesso!");
      onSuccess();
    } catch (err: any) {
      toast.error("Erro ao conectar: " + err.message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-4 py-2">
      {/* Server URL */}
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label htmlFor="manual-server-url">Server URL</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs text-xs">
                URL base do servidor UAZAPI onde a instância foi criada. Ex: https://api.uazapi.com
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <Input
          id="manual-server-url"
          value={serverUrl}
          onChange={(e) => {
            setServerUrl(e.target.value);
            setValidationState("idle");
          }}
          placeholder="https://api.uazapi.com"
          className="bg-secondary border-border"
        />
      </div>

      {/* Instance Token */}
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label htmlFor="manual-token">Instance Token</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs text-xs">
                Token da instância fornecido pela plataforma UAZAPI ao criar a instância.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <Input
          id="manual-token"
          value={instanceToken}
          onChange={(e) => {
            setInstanceToken(e.target.value);
            setValidationState("idle");
          }}
          placeholder="Token da instância"
          className="bg-secondary border-border font-mono text-sm"
        />
      </div>

      {/* Instance Name */}
      <div className="space-y-2">
        <Label htmlFor="manual-name">Nome da Instância</Label>
        <Input
          id="manual-name"
          value={instanceName}
          onChange={(e) => setInstanceName(e.target.value)}
          placeholder="Ex: [Cliente][01]"
          className="bg-secondary border-border"
        />
      </div>

      {/* Validate Button */}
      <Button
        variant="outline"
        className="w-full"
        onClick={validateInstance}
        disabled={!trimmedUrl || !trimmedToken || validationState === "validating"}
      >
        {validationState === "validating" ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : validationState === "valid" ? (
          <CheckCircle2 className="h-4 w-4 mr-2 text-primary" />
        ) : validationState === "invalid" ? (
          <XCircle className="h-4 w-4 mr-2 text-destructive" />
        ) : null}
        Validar Conexão
      </Button>

      {/* Validation Feedback */}
      {validationMessage && (
        <Alert
          variant={validationState === "valid" ? "default" : "destructive"}
          className={validationState === "valid" ? "border-primary/50 text-primary" : ""}
        >
          <AlertDescription className="text-sm">
            {validationMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Connect Button */}
      <Button
        className="w-full bg-primary hover:bg-primary/90"
        onClick={handleConnect}
        disabled={!isFormValid || connecting || !canCreateInstance}
      >
        {connecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        <Link2 className="h-4 w-4 mr-2" />
        {canCreateInstance ? "Conectar Instância" : "Limite Atingido"}
      </Button>
    </div>
  );
}
