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
  DialogFooter,
} from "@/components/ui/dialog";
import { FolderPlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function CreateFolderDialog() {
  const [open, setOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleCreate = async () => {
    if (!user || !folderName.trim()) return;
    setCreating(true);
    try {
      // Create a virtual subaccount (folder) with a generated location_id
      const folderId = `folder_${crypto.randomUUID().slice(0, 12)}`;
      
      const { error } = await supabase.from("ghl_subaccounts").insert({
        user_id: user.id,
        location_id: folderId,
        account_name: folderName.trim(),
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["subaccounts"] });
      queryClient.invalidateQueries({ queryKey: ["all-instances-dashboard"] });
      toast.success("Pasta criada com sucesso!");
      setFolderName("");
      setOpen(false);
    } catch (err: any) {
      toast.error("Erro ao criar pasta: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-border">
          <FolderPlus className="h-4 w-4" />
          Criar Pasta
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">Criar Pasta</DialogTitle>
          <DialogDescription>
            Crie uma pasta para agrupar instâncias e gerar um link GHL, como se fosse uma subconta.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome da Pasta</Label>
            <Input
              placeholder="Ex: Minha Empresa"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              className="bg-secondary border-border"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!folderName.trim() || creating}
          >
            {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <FolderPlus className="h-4 w-4 mr-2" />
            Criar Pasta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
