import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface InstanceOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const overrideCommands = [
  {
    command: "#TELEFONE:",
    description: "Troca a instância de envio pelo número de telefone",
    format: "#5500900000000: mensagem aqui",
    context: "Contato",
    notes: "Use o número completo com DDI+DDD. A troca é persistida para o contato.",
  },
  {
    command: "#NOME:",
    description: "Troca a instância de envio pelo nome da instância",
    format: "#Minha Instância: mensagem aqui",
    context: "Contato",
    notes: "O nome é case-insensitive. Deve corresponder exatamente ao nome cadastrado.",
  },
];

function OverrideCommandsList() {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const handleCopy = (cmd: typeof overrideCommands[0]) => {
    navigator.clipboard.writeText(cmd.format);
    setCopiedCommand(cmd.command);
    toast.success("Exemplo copiado!");
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  return (
    <>
      <div className="space-y-2">
        {overrideCommands.map((cmd) => (
          <div
            key={cmd.command}
            className="flex items-start justify-between gap-2 p-3 rounded-lg border border-border bg-muted/20"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{cmd.description}</p>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className="font-mono text-primary font-medium text-sm">
                  {cmd.command}
                </span>
                <Badge variant="outline" className="text-xs">
                  {cmd.context}
                </Badge>
              </div>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground mt-1 inline-block">
                {cmd.format}
              </code>
              {cmd.notes && (
                <p className="text-xs text-muted-foreground mt-1">{cmd.notes}</p>
              )}
            </div>
            <button
              onClick={() => handleCopy(cmd)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
              title="Copiar exemplo"
            >
              {copiedCommand === cmd.command ? (
                <Check className="h-4 w-4 text-primary" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border space-y-2">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Como funciona:</strong> Ao enviar uma mensagem com o prefixo, a instância é trocada automaticamente e a preferência é salva para aquele contato.
        </p>
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Feedback:</strong> Um comentário interno (🔄) confirma a troca no histórico da conversa.
        </p>
      </div>
    </>
  );
}

export function InstanceOverrideDialog({ open, onOpenChange }: InstanceOverrideDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Trocar Instância</DrawerTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Troque a instância de envio diretamente pelo chat do GoHighLevel.
            </p>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">
            <OverrideCommandsList />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Trocar Instância</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Troque a instância de envio diretamente pelo chat do GoHighLevel.
          </p>
        </DialogHeader>
        <OverrideCommandsList />
      </DialogContent>
    </Dialog>
  );
}
