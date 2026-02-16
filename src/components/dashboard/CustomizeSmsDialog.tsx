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

interface CustomizeSmsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const smsScript = `<script>
(function() {
  function trocarTexto() {
    // Seletor 1 - Tab principal
    const smsTab = document.querySelector('#composer-textarea > div > div.flex.flex-col.flex-1.min-w-0.h-full.rounded-md.border-none > div.flex.flex-row.py-1.items-center.justify-end.rounded-t-lg.\\\\!h-\\\\[32px\\\\].bg-gray-50 > div.flex.gap-6.items-center.w-full > div > span');
    if (smsTab && smsTab.innerText.trim() === 'SMS') {
      smsTab.innerText = 'WhatsApp QR';
    }

    // Seletor 2 - Popover
    const smsPopover = document.querySelector('#provider-select-popover > div.hr-popover__content > div > div > div.flex.items-center.justify-between.py-2.px-2.cursor-pointer.transition-colors.duration-150.hover\\\\:bg-gray-50.bg-blue-50 > div > div');
    if (smsPopover && smsPopover.innerText.trim() === 'SMS') {
      smsPopover.innerText = 'WhatsApp QR';
    }
  }

  // Primeiro tenta de imediato
  trocarTexto();

  // Observa mudanças no DOM
  const observer = new MutationObserver(() => {
    trocarTexto();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
</script>`;

export function CustomizeSmsDialog({ open, onOpenChange }: CustomizeSmsDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(smsScript);
    setCopied(true);
    toast.success("Script copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Customizar SMS</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Este script altera o nome <strong>"SMS"</strong> para <strong>"WhatsApp QR"</strong> na interface do GoHighLevel.
            Cole-o no Custom JS/CSS da sua subconta.
          </p>
        </DialogHeader>

        <div className="mt-4 relative">
          <pre className="rounded-lg border border-border bg-muted/30 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words text-foreground/80">
            {smsScript}
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
