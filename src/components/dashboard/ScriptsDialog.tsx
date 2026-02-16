import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

const SCRIPT_SIMPLE = `<script src="https://toolkit.bridgeapi.chat/message-toolkit-v1.js"></script>
<script src="https://recorder.bridgeapi.chat/rec-v1.js"></script>
<script src="https://switch.bridgeapi.chat/switch-v1.js"></script>`;

const SCRIPT_FILTERED = `<script>
  const allowedSubaccounts = [
    // Adicione os IDs das subcontas permitidas para execução dos scripts
    "Coloque seu LocationID aqui dentro", // Subconta 1
    "Coloque seu LocationID aqui dentro", // Subconta 2
    "Coloque seu LocationID aqui dentro", // Subconta 3
    "Coloque seu LocationID aqui dentro"  // Subconta 4
  ];

  const scriptsToLoad = [
    "https://toolkit.bridgeapi.chat/message-toolkit-v1.js",
    "https://recorder.bridgeapi.chat/rec-v1.js",
    "https://switch.bridgeapi.chat/switch-v1.js"
  ];

  const getSubaccountId = () => {
    const match = window.location.pathname.match(/\\/v2\\/location\\/([^\\/]+)/);
    return match ? match[1] : null;
  };

  const loadScripts = () => {
    scriptsToLoad.forEach(src => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      document.head.appendChild(script);
    });
  };

  const checkAndLoadScripts = () => {
    const subaccountId = getSubaccountId();
    if (subaccountId && allowedSubaccounts.includes(subaccountId)) {
      loadScripts();
    }
  };

  // Verifica quando a página carrega
  document.addEventListener('DOMContentLoaded', checkAndLoadScripts);

  // E verifica também mudanças de subconta (caso o usuário navegue sem reload)
  let lastSubaccountId = null;
  setInterval(() => {
    const currentSubaccountId = getSubaccountId();
    if (currentSubaccountId && currentSubaccountId !== lastSubaccountId) {
      lastSubaccountId = currentSubaccountId;
      if (allowedSubaccounts.includes(currentSubaccountId)) {
        loadScripts();
      }
    }
  }, 1000);
</script>`;

interface ScriptsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScriptsDialog({ open, onOpenChange }: ScriptsDialogProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success("Script copiado!");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scripts para GoHighLevel</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Abra o GoHighLevel e siga: <strong>Configurações → Empresa → WhiteLabel → JS Personalizado</strong>
          </p>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* Option 1 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Opção 1 — Script Simples</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopy(SCRIPT_SIMPLE, 0)}
                className="gap-1.5"
              >
                {copiedIndex === 0 ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedIndex === 0 ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Carrega todos os scripts em todas as subcontas.
            </p>
            <pre className="bg-muted/50 border rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap font-mono">
              {SCRIPT_SIMPLE}
            </pre>
          </div>

          {/* Option 2 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Opção 2 — Script com Filtro de Subcontas</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopy(SCRIPT_FILTERED, 1)}
                className="gap-1.5"
              >
                {copiedIndex === 1 ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedIndex === 1 ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Carrega os scripts apenas nas subcontas listadas no array <code className="bg-muted px-1 rounded">allowedSubaccounts</code>.
            </p>
            <pre className="bg-muted/50 border rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap font-mono">
              {SCRIPT_FILTERED}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
