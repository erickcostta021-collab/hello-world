import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface WhatsAppThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const themeScript = `<script>
(() => {
  const BG_URL = 'https://s0.smartresize.com/wallpaper/744/548/HD-wallpaper-whatsapp-ma-doodle-pattern.jpg';

  function applyWhatsAppBackground() {
    const panel = document.querySelector('#conversation-panel');
    if (!panel) return;

    // Aplicar wallpaper no panel
    panel.style.setProperty('background-image', \`url("\${BG_URL}")\`, 'important');
    panel.style.setProperty('background-color', 'transparent', 'important');
    panel.style.setProperty('background-size', 'cover', 'important');
    panel.style.setProperty('background-position', 'center', 'important');
    panel.style.setProperty('background-repeat', 'no-repeat', 'important');

    // Remover fundo dos filhos (o div m-3 que fica por cima)
    panel.querySelectorAll('.m-3, [class*="bg-"]').forEach(el => {
      // Não remover fundo das bolhas de mensagem
      if (!el.closest('[class*="chat-"]') && !el.classList.contains('hr-tag')) {
        el.style.setProperty('background-color', 'transparent', 'important');
      }
    });

    // Header branco
    const container = panel.parentElement;
    if (container) {
      const header = container.querySelector('.border-b');
      if (header) header.style.setProperty('background-color', 'white', 'important');
      container.style.setProperty('background-color', 'white', 'important');
    }
  }

  // Aplicar após DOM carregar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(applyWhatsAppBackground, 500));
  } else {
    setTimeout(applyWhatsAppBackground, 500);
  }

  // Reaplicar quando mudar de conversa
  const observer = new MutationObserver(() => {
    const panel = document.querySelector('#conversation-panel');
    if (panel && !panel.style.backgroundImage?.includes('whatsapp')) {
      applyWhatsAppBackground();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
</script>`;

export function WhatsAppThemeDialog({ open, onOpenChange }: WhatsAppThemeDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(themeScript);
    setCopied(true);
    toast.success("Script copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Tema WhatsApp</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Este script aplica o <strong>wallpaper do WhatsApp</strong> no painel de conversas do GoHighLevel,
            criando uma experiência visual mais familiar.
          </p>
        </DialogHeader>

        <div className="mt-4 relative">
          <pre className="rounded-lg border border-border bg-muted/30 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words text-foreground/80">
            {themeScript}
          </pre>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="mt-3 w-full sm:w-auto gap-2"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-primary" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copiar Script
              </>
            )}
          </Button>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Como usar:</strong> Acesse seu Go High Level → Settings → Company → Custom JavaScript e cole o código acima.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
