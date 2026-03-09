import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { useInstances } from "@/hooks/useInstances";

export function CreateUnlinkedInstanceDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const { createInstance, isManagedMode } = useInstances();

  const handleCreate = () => {
    if (!name.trim()) return;

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
  const hasUAZAPIConfig = isManagedMode;

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

          <Button
            className="w-full bg-primary hover:bg-primary/90"
            onClick={handleCreate}
            disabled={!name.trim() || createInstance.isPending || !hasUAZAPIConfig}
          >
            {createInstance.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            <Plus className="h-4 w-4 mr-2" />
            Criar Instância
          </Button>
          
          {!hasUAZAPIConfig && (
            <p className="text-xs text-muted-foreground text-center">
              Configure as credenciais UAZAPI nas configurações para criar instâncias.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
