import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LifeBuoy, MessageCircle, Gamepad2, ExternalLink } from "lucide-react";

export function SupportButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir suporte"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-brand-green px-4 py-3 text-white shadow-lg shadow-brand-green/30 transition-all duration-300 hover:scale-105 hover:bg-brand-green/90"
      >
        <LifeBuoy className="h-5 w-5" />
        <span className="hidden font-medium sm:inline">Suporte</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fale com o Suporte</DialogTitle>
            <DialogDescription>
              Escolha o canal de sua preferência para conversar com nossa equipe.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 px-6 pb-6">
            <a
              href="https://wa.me/5521994587619"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-all duration-300 hover:bg-secondary"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-green/10 text-brand-green">
                <MessageCircle className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-foreground">WhatsApp</div>
                <div className="text-sm text-muted-foreground">+55 21 99458-7619</div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            </a>
            <a
              href="https://app.gather.town/app/LzOJK6DmLDBwR8lo/Suporte%20Bridge%20API"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-all duration-300 hover:bg-secondary"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Gamepad2 className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-foreground">Gather</div>
                <div className="text-sm text-muted-foreground">Sala de suporte virtual</div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
