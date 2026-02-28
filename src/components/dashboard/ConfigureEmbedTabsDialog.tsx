import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EmbedVisibleOptions {
  assign_user: boolean;
  webhook: boolean;
  track_id: boolean;
  base_url: boolean;
  token: boolean;
  connect: boolean;
  disconnect: boolean;
  status: boolean;
  messages: boolean;
  api_oficial: boolean;
  group_manager: boolean;
}

const DEFAULT_OPTIONS: EmbedVisibleOptions = {
  assign_user: true,
  webhook: true,
  track_id: true,
  base_url: true,
  token: true,
  connect: true,
  disconnect: true,
  status: true,
  messages: true,
  api_oficial: true,
  group_manager: true,
};

const OPTION_LABELS: Record<keyof EmbedVisibleOptions, string> = {
  assign_user: "Atribuir Usuário GHL",
  webhook: "Configurar Webhooks",
  track_id: "Copiar Track ID",
  base_url: "Exibir Base URL",
  token: "Exibir Token",
  connect: "Conectar / QR Code",
  disconnect: "Desconectar",
  status: "Atualizar Status",
  messages: "Mensagem em massa (beta)",
  api_oficial: "API Oficial",
  group_manager: "Gerenciador de Grupos",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  instanceName: string;
  currentOptions?: EmbedVisibleOptions | null;
  onSaved?: (options: EmbedVisibleOptions) => void;
}

export function ConfigureEmbedTabsDialog({
  open,
  onOpenChange,
  instanceId,
  instanceName,
  currentOptions,
  onSaved,
}: Props) {
  const [options, setOptions] = useState<EmbedVisibleOptions>({ ...DEFAULT_OPTIONS, ...currentOptions });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setOptions({ ...DEFAULT_OPTIONS, ...currentOptions });
    }
  }, [open, currentOptions]);

  const toggle = (key: keyof EmbedVisibleOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("instances")
        .update({ embed_visible_options: options as any })
        .eq("id", instanceId);
      if (error) throw error;
      toast.success("Configurações do embed salvas!");
      onSaved?.(options);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar Abas do Embed</DialogTitle>
          <DialogDescription>
            Escolha quais opções serão visíveis no link GHL para <strong>{instanceName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {(Object.keys(OPTION_LABELS) as (keyof EmbedVisibleOptions)[]).map((key) => (
              <div key={key} className="flex items-center justify-between">
                <Label htmlFor={`embed-opt-${key}`} className="cursor-pointer">
                  {OPTION_LABELS[key]}
                </Label>
                <Switch
                  id={`embed-opt-${key}`}
                  checked={options[key]}
                  onCheckedChange={() => toggle(key)}
                />
              </div>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
