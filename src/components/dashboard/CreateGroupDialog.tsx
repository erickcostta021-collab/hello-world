import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Instance } from "@/hooks/useInstances";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Users, ImageIcon, FileText, X } from "lucide-react";

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: Instance;
  onCreated?: () => void;
}

export function CreateGroupDialog({ open, onOpenChange, instance, onCreated }: CreateGroupDialogProps) {
  const [groupName, setGroupName] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [participantsText, setParticipantsText] = useState("");
  const [creating, setCreating] = useState(false);
  const isMobile = useIsMobile();

  const resetForm = () => {
    setGroupName("");
    setDescription("");
    setPhotoUrl("");
    setParticipantsText("");
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      toast.error("Nome do grupo é obrigatório");
      return;
    }

    const phones = participantsText
      .split(/[,;\n]+/)
      .map((p) => p.trim().replace(/\D/g, ""))
      .filter((p) => p.length >= 10);

    if (phones.length === 0) {
      toast.error("Adicione pelo menos um participante válido");
      return;
    }

    // Build #criargrupo command
    const messageText = `#criargrupo ${groupName.trim()}|${description.trim() || "Sem descrição"}|${photoUrl.trim() || "sem_foto"}|${phones.join("|")}`;

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: { instanceId: instance.id, messageText },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.success) {
        toast.success(data.message || "Grupo criado com sucesso!");
        resetForm();
        onOpenChange(false);
        onCreated?.();
      } else {
        toast.error(data?.message || "Erro ao criar grupo");
      }
    } catch (err: any) {
      console.error("Failed to create group:", err);
      toast.error(err.message || "Erro ao criar grupo");
    } finally {
      setCreating(false);
    }
  };

  const content = (
    <div className="flex flex-col gap-4">
      {/* Group Name */}
      <div className="space-y-2">
        <Label htmlFor="group-name" className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Nome do Grupo <span className="text-destructive">*</span>
        </Label>
        <Input
          id="group-name"
          placeholder="Ex: Equipe de Vendas"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="group-desc" className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Descrição
        </Label>
        <Textarea
          id="group-desc"
          placeholder="Descrição do grupo (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      {/* Photo URL */}
      <div className="space-y-2">
        <Label htmlFor="group-photo" className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          URL da Foto
        </Label>
        <Input
          id="group-photo"
          placeholder="https://exemplo.com/foto.jpg (opcional)"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
        />
      </div>

      {/* Participants */}
      <div className="space-y-2">
        <Label htmlFor="group-participants" className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-muted-foreground" />
          Participantes <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="group-participants"
          placeholder={"5511999999999\n5521988888888\n5527977777777"}
          value={participantsText}
          onChange={(e) => setParticipantsText(e.target.value)}
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Adicione números separados por vírgula ou quebra de linha (com DDI + DDD)
        </p>
      </div>
    </div>
  );

  const footer = (
    <div className="flex gap-2 justify-end">
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
        Cancelar
      </Button>
      <Button onClick={handleCreate} disabled={creating}>
        {creating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Criando...
          </>
        ) : (
          <>
            <Plus className="h-4 w-4 mr-2" />
            Criar Grupo
          </>
        )}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Criar Grupo
            </DrawerTitle>
          </DrawerHeader>
          <div className="p-4 overflow-y-auto max-h-[60vh]">{content}</div>
          <DrawerFooter>{footer}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Criar Grupo
          </DialogTitle>
          <DialogDescription>
            Crie um novo grupo no WhatsApp via <strong>{instance.instance_name}</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {content}
          <div className="mt-4">{footer}</div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
