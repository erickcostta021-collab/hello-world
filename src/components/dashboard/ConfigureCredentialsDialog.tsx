import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/hooks/useSettings";
import { Save, Loader2, Eye, EyeOff } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigureCredentialsDialog({ open, onOpenChange }: Props) {
  const { settings, updateSettings, applyGlobalWebhook } = useSettings();
  const [showTokens, setShowTokens] = useState(false);
  const [formData, setFormData] = useState({
    uazapi_base_url: "",
    uazapi_admin_token: "",
    ghl_agency_token: "",
  });

  useEffect(() => {
    if (settings && open) {
      setFormData({
        uazapi_base_url: settings.uazapi_base_url || "",
        uazapi_admin_token: settings.uazapi_admin_token || "",
        ghl_agency_token: settings.ghl_agency_token || "",
      });
    }
  }, [settings, open]);

  const handleSave = () => {
    const webhookUrl = settings?.global_webhook_url || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-inbound`;

    updateSettings.mutate({ ...formData, global_webhook_url: webhookUrl }, {
      onSuccess: () => {
        if (formData.uazapi_base_url && formData.uazapi_admin_token) {
          applyGlobalWebhook.mutate(webhookUrl);
        }
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Configurar Credenciais</DialogTitle>
          <DialogDescription>
            Preencha as credenciais de integração. Elas serão salvas automaticamente nas configurações.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cred-base-url">URL Base da UAZAPI</Label>
              <Input
                id="cred-base-url"
                type="text"
                value={formData.uazapi_base_url}
                onChange={(e) => setFormData({ ...formData, uazapi_base_url: e.target.value })}
                placeholder="https://seu-servidor.uazapi.com"
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cred-admin-token">Token Admin da UAZAPI</Label>
              <Input
                id="cred-admin-token"
                type={showTokens ? "text" : "password"}
                value={formData.uazapi_admin_token}
                onChange={(e) => setFormData({ ...formData, uazapi_admin_token: e.target.value })}
                placeholder="Seu token admin da UAZAPI"
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cred-agency-token">
                Token de Agência GHL <span className="text-muted-foreground text-xs">(opcional)</span>
              </Label>
              <Input
                id="cred-agency-token"
                type={showTokens ? "text" : "password"}
                value={formData.ghl_agency_token}
                onChange={(e) => setFormData({ ...formData, ghl_agency_token: e.target.value })}
                placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="bg-secondary border-border"
              />
              <p className="text-xs text-muted-foreground">
                Encontre em: GHL → Conta nível agência → Configurações → Integrações Privado
              </p>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTokens(!showTokens)}
          >
            {showTokens ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {showTokens ? "Ocultar" : "Mostrar"}
          </Button>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
