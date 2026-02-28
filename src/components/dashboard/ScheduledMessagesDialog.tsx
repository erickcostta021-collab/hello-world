import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  CalendarClock,
  Repeat,
  Clock,
  MessageSquare,
  Trash2,
  Loader2,
  Inbox,
} from "lucide-react";

interface ScheduledMessage {
  id: string;
  groupName: string;
  groupJid: string;
  message: string;
  scheduledFor: string;
  isRecurring: boolean;
  recurringInterval?: string;
  status: "pending" | "sent" | "failed";
  createdAt: string;
}

interface ScheduledMessagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScheduledMessagesDialog({ open, onOpenChange }: ScheduledMessagesDialogProps) {
  const [messages] = useState<ScheduledMessage[]>([]);
  const [loading] = useState(false);
  const isMobile = useIsMobile();

  const content = (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          {messages.filter((m) => m.status === "pending" && !m.isRecurring).length} Agendadas
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
          <Repeat className="h-3.5 w-3.5" />
          {messages.filter((m) => m.isRecurring).length} Recorrentes
        </Badge>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && messages.length === 0 && (
        <div className="text-center py-16">
          <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h4 className="font-medium text-card-foreground mb-1">Nenhuma mensagem programada</h4>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            As mensagens agendadas e recorrentes que você criar nos grupos aparecerão aqui.
          </p>
        </div>
      )}

      {/* Messages list */}
      {!loading && messages.length > 0 && (
        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <Card key={msg.id} className="bg-card/60 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-card-foreground truncate">
                        {msg.groupName}
                      </span>
                      {msg.isRecurring ? (
                        <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/30">
                          <Repeat className="h-2.5 w-2.5 mr-0.5" />
                          {msg.recurringInterval}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30">
                          <Clock className="h-2.5 w-2.5 mr-0.5" />
                          Agendada
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          msg.status === "pending"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : msg.status === "sent"
                            ? "bg-green-500/10 text-green-400 border-green-500/30"
                            : "bg-red-500/10 text-red-400 border-red-500/30"
                        }`}
                      >
                        {msg.status === "pending" ? "Pendente" : msg.status === "sent" ? "Enviada" : "Falhou"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      <MessageSquare className="h-3 w-3 inline mr-1" />
                      {msg.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      <CalendarClock className="h-3 w-3 inline mr-1" />
                      {new Date(msg.scheduledFor).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              Mensagens Programadas
            </DrawerTitle>
          </DrawerHeader>
          <div className="p-4 pb-6 overflow-y-auto max-h-[70vh]">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Mensagens Programadas
          </DialogTitle>
          <DialogDescription>
            Gerencie suas mensagens agendadas e recorrentes
          </DialogDescription>
        </DialogHeader>
        <DialogBody>{content}</DialogBody>
      </DialogContent>
    </Dialog>
  );
}
