import { useState, useEffect } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CalendarClock,
  Repeat,
  Clock,
  MessageSquare,
  Trash2,
  Loader2,
  Inbox,
  RefreshCw,
} from "lucide-react";

interface ScheduledMessage {
  id: string;
  group_name: string;
  group_jid: string;
  message_text: string;
  scheduled_for: string;
  is_recurring: boolean;
  recurring_interval?: string;
  status: string;
  mention_all: boolean;
  created_at: string;
}

interface ScheduledMessagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScheduledMessagesDialog({ open, onOpenChange }: ScheduledMessagesDialogProps) {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("scheduled_group_messages")
        .select("*")
        .order("scheduled_for", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar mensagens");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchMessages();
    else setMessages([]);
  }, [open]);

  const deleteMessage = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from("scheduled_group_messages")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setMessages((prev) => prev.filter((m) => m.id !== id));
      toast.success("Mensagem removida!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover");
    } finally {
      setDeletingId(null);
    }
  };

  const pendingCount = messages.filter((m) => m.status === "pending" && !m.is_recurring).length;
  const recurringCount = messages.filter((m) => m.is_recurring && m.status === "pending").length;

  const content = (
    <div className="flex flex-col gap-4">
      {/* Stats & Refresh */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            {pendingCount} Agendadas
          </Badge>
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
            <Repeat className="h-3.5 w-3.5" />
            {recurringCount} Recorrentes
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={fetchMessages} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
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
            As mensagens agendadas que você criar nos grupos aparecerão aqui.
          </p>
        </div>
      )}

      {/* Messages list */}
      {!loading && messages.length > 0 && (
        <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto">
          {messages.map((msg) => (
            <Card key={msg.id} className="bg-card/60 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-sm text-card-foreground truncate">
                        {msg.group_name || msg.group_jid}
                      </span>
                      {msg.is_recurring ? (
                        <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400">
                          <Repeat className="h-2.5 w-2.5 mr-0.5" />
                          {msg.recurring_interval === "daily" ? "Diário" : msg.recurring_interval === "weekly" ? "Semanal" : "Mensal"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
                          <Clock className="h-2.5 w-2.5 mr-0.5" />
                          Agendada
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          msg.status === "pending"
                            ? "border-amber-500/30 text-amber-400"
                            : msg.status === "sent"
                            ? "border-green-500/30 text-green-400"
                            : msg.status === "cancelled"
                            ? "border-muted-foreground/30 text-muted-foreground"
                            : "border-destructive/30 text-destructive"
                        }`}
                      >
                        {msg.status === "pending" ? "Pendente" : msg.status === "sent" ? "Enviada" : msg.status === "cancelled" ? "Cancelada" : "Falhou"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      <MessageSquare className="h-3 w-3 inline mr-1" />
                      {msg.mention_all ? "@todos " : ""}{msg.message_text}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      <CalendarClock className="h-3 w-3 inline mr-1" />
                      {new Date(msg.scheduled_for).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  {msg.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteMessage(msg.id)}
                      disabled={deletingId === msg.id}
                    >
                      {deletingId === msg.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
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
