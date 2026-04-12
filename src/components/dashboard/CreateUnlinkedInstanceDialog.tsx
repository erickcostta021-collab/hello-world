import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2, AlertTriangle } from "lucide-react";
import { useInstances } from "@/hooks/useInstances";
import { useSettings } from "@/hooks/useSettings";

export function CreateUnlinkedInstanceDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const { createInstance, isManagedMode, canCreateInstance, instanceLimit, linkedInstanceCount, unlinkedInstanceCount, isInGracePeriod } = useInstances();
  const { settings } = useSettings();

  const totalCount = linkedInstanceCount + unlinkedInstanceCount;

  const handleCreate = () => {
    if (!name.trim()) return;
    if (!canCreateInstance) {
      return;
    }

    createInstance.mutate(
      { name: name.trim(), subaccountId: null },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
        },
      }
    );
  };

  // Check if UAZAPI is configured (in managed mode, credentials come from admin)
  const hasUAZAPIConfig = isManagedMode || (!!settings?.uazapi_admin_token && !!settings?.uazapi_base_url);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          Criar Instância
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">
            Criar Nova Instância
          </DialogTitle>
          <DialogDescription>
            Crie uma instância WhatsApp sem vincular a nenhuma subconta. 
            Você pode vincular depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="instance-name">Nome da Instância</Label>
            <Input
              id="instance-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Instância Principal"
              className="bg-secondary border-border"
            />
          </div>

          {isInGracePeriod && (
            <Alert className="border-destructive/50 bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-sm text-destructive">
                Pagamento pendente. A criação de novas instâncias está bloqueada. Regularize seu pagamento para continuar.
              </AlertDescription>
            </Alert>
          )}

          {!canCreateInstance && !isInGracePeriod && instanceLimit > 0 && (
            <Alert className="border-destructive/50 bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-sm text-destructive">
                Você atingiu o limite do seu plano ({totalCount} de {instanceLimit}). Para criar mais instâncias, faça um upgrade.
              </AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full bg-primary hover:bg-primary/90"
            onClick={handleCreate}
            disabled={!name.trim() || createInstance.isPending || !hasUAZAPIConfig || !canCreateInstance}
          >
            {createInstance.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            <Plus className="h-4 w-4 mr-2" />
            {canCreateInstance ? "Criar Instância" : `Limite Atingido (${totalCount}/${instanceLimit})`}
          </Button>
          
          {!hasUAZAPIConfig && (
            <p className="text-xs text-muted-foreground text-center">
              {isManagedMode
                ? "Entre em contato com o administrador para configurar sua conta."
                : "Configure as credenciais nas configurações para criar instâncias."}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
