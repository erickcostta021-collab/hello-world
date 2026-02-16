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

interface SendButtonsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const buttonCommands = [
  {
    command: "#pix",
    description: "Envia botão de pagamento PIX ao contato",
    format: "tipo|chave|nome",
    context: "Contato",
    notes: "Tipos: EVP, CPF, CNPJ, PHONE, EMAIL",
  },
  {
    command: "#botoes",
    description: "Envia mensagem com botões de resposta rápida",
    format: "texto|rodapé|botão1,botão2,botão3",
    context: "Contato",
    notes: "Máx. 3 botões separados por vírgula. Rodapé opcional (pode omitir).",
  },
  {
    command: "#lista",
    description: "Envia lista interativa com seções e itens",
    format: "texto|textoBotão|[Seção],item1,item2",
    context: "Contato",
    notes: "Use [Título] para seções. Itens: texto|id|descrição.",
  },
  {
    command: "#enquete",
    description: "Envia enquete/votação ao contato",
    format: "pergunta|opção1|opção2|opção3",
    context: "Contato",
    notes: "Mínimo 2 opções. Sem limite definido.",
  },
];

function ButtonCommandsList() {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const handleCopy = (cmd: typeof buttonCommands[0]) => {
    const fullCommand = cmd.format
      ? `${cmd.command} ${cmd.format}`
      : cmd.command;
    navigator.clipboard.writeText(fullCommand);
    setCopiedCommand(cmd.command);
    toast.success("Comando copiado!");
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  return (
    <>
      <div className="space-y-2">
        {buttonCommands.map((cmd) => (
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
              {cmd.format && (
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground mt-1 inline-block">
                  {cmd.format}
                </code>
              )}
              {cmd.notes && (
                <p className="text-xs text-muted-foreground mt-1">{cmd.notes}</p>
              )}
            </div>
            <button
              onClick={() => handleCopy(cmd)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
              title="Copiar comando"
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

      <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Dica:</strong> Esses comandos devem ser enviados no chat de um contato individual no CRM.
        </p>
      </div>
    </>
  );
}

export function SendButtonsDialog({ open, onOpenChange }: SendButtonsDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Comandos de Enviar Botões</DrawerTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Comandos para enviar botões interativos pelo chat do GoHighLevel.
            </p>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">
            <ButtonCommandsList />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Comandos de Enviar Botões</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Comandos para enviar botões interativos pelo chat do GoHighLevel.
          </p>
        </DialogHeader>
        <ButtonCommandsList />
      </DialogContent>
    </Dialog>
  );
}
