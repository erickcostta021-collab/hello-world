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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  Image,
  Video,
  Music,
  FileText,
  History,
  Filter,
  Pencil,
  Save,
  X,
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
  media_url?: string;
  media_type?: string;
  sent_at?: string;
  execution_count?: number;
}

const superscriptDigits: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};

function toSuperscript(n: number): string {
  return String(n).split("").map((d) => superscriptDigits[d] || d).join("");
}

function formatGroupName(name: string, jid: string): string {
  if (name && !name.includes("@g.us") && !name.includes("@s.whatsapp.net")) return name;
  const digits = jid.replace(/@.*$/, "");
  return `Grupo ${digits.slice(-6)}`;
}

interface ScheduledMessagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId?: string;
}

function MessageCard({
  msg,
  onDelete,
  onEdit,
  deletingId,
  editingId,
}: {
  msg: ScheduledMessage;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, updates: { message_text: string; scheduled_for: string; mention_all: boolean }) => void;
  deletingId?: string | null;
  editingId?: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(msg.message_text);
  const [editDate, setEditDate] = useState(msg.scheduled_for.slice(0, 16));
  const [editMentionAll, setEditMentionAll] = useState(msg.mention_all);

  const handleSave = () => {
    if (!editText.trim()) return;
    onEdit?.(msg.id, {
      message_text: editText,
      scheduled_for: new Date(editDate).toISOString(),
      mention_all: editMentionAll,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(msg.message_text);
    setEditDate(msg.scheduled_for.slice(0, 16));
    setEditMentionAll(msg.mention_all);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Card className="bg-card/60 border-primary/30">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm text-card-foreground">Editando</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={handleSave} disabled={editingId === msg.id}>
                {editingId === msg.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="text-xs min-h-[60px]"
            placeholder="Mensagem..."
          />
          <Input
            type="datetime-local"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            className="text-xs"
          />
          <div className="flex items-center gap-2">
            <Switch
              id={`edit-mention-${msg.id}`}
              checked={editMentionAll}
              onCheckedChange={setEditMentionAll}
            />
            <Label htmlFor={`edit-mention-${msg.id}`} className="text-xs text-muted-foreground cursor-pointer">
              @todos
            </Label>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/60 border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-medium text-sm text-card-foreground truncate">
                {formatGroupName(msg.group_name, msg.group_jid)}
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
                {msg.status === "pending"
                  ? `Pendente${msg.execution_count && msg.execution_count > 0 ? ` (${msg.execution_count}x enviada)` : ""}`
                  : msg.status === "sent"
                  ? `Enviada${msg.execution_count && msg.execution_count > 0 ? toSuperscript(msg.execution_count) : ""}`
                  : msg.status === "cancelled"
                  ? "Cancelada"
                  : "Falhou"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              <MessageSquare className="h-3 w-3 inline mr-1" />
              {msg.mention_all ? "@todos " : ""}{msg.message_text}
            </p>
            {msg.media_url && (
              <p className="text-xs text-primary/80 mt-0.5 flex items-center gap-1">
                {msg.media_type === "image" && <Image className="h-3 w-3" />}
                {msg.media_type === "video" && <Video className="h-3 w-3" />}
                {msg.media_type === "audio" && <Music className="h-3 w-3" />}
                {msg.media_type === "document" && <FileText className="h-3 w-3" />}
                {msg.media_type === "image" ? "Imagem" : msg.media_type === "video" ? "Vídeo" : msg.media_type === "audio" ? "Áudio" : "Documento"} anexado
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              <CalendarClock className="h-3 w-3 inline mr-1" />
              {new Date(msg.scheduled_for).toLocaleString("pt-BR")}
            </p>
            {msg.sent_at && (
              <p className="text-xs text-green-400/80 mt-0.5">
                <History className="h-3 w-3 inline mr-1" />
                Enviada em {new Date(msg.sent_at).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-primary"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={deletingId === msg.id}
                  >
                    {deletingId === msg.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir mensagem?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. A mensagem será removida permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(msg.id)}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ScheduledMessagesDialog({ open, onOpenChange, instanceId }: ScheduledMessagesDialogProps) {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [onlyRecurring, setOnlyRecurring] = useState(false);
  const isMobile = useIsMobile();

  const fetchMessages = async () => {
    setLoading(true);
    try {
      if (instanceId) {
        const { data, error } = await supabase.functions.invoke("scheduled-messages-proxy", {
          body: { action: "list", instanceId },
        });
        if (error) throw error;
        setMessages(data?.messages || []);
      } else {
        const { data, error } = await supabase
          .from("scheduled_group_messages")
          .select("*")
          .order("scheduled_for", { ascending: true });
        if (error) throw error;
        setMessages(data || []);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao buscar mensagens");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchMessages();
    else {
      setMessages([]);
      setOnlyRecurring(false);
    }
  }, [open]);

  const deleteMessage = async (id: string) => {
    setDeletingId(id);
    try {
      if (instanceId) {
        const { data, error } = await supabase.functions.invoke("scheduled-messages-proxy", {
          body: { action: "delete", instanceId, messageId: id },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("scheduled_group_messages")
          .delete()
          .eq("id", id);
        if (error) throw error;
      }
      setMessages((prev) => prev.filter((m) => m.id !== id));
      toast.success("Mensagem removida!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover");
    } finally {
      setDeletingId(null);
    }
  };

  const editMessage = async (id: string, updates: { message_text: string; scheduled_for: string; mention_all: boolean }) => {
    setEditingId(id);
    try {
      if (instanceId) {
        const { data, error } = await supabase.functions.invoke("scheduled-messages-proxy", {
          body: { action: "update", instanceId, messageId: id, updates },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("scheduled_group_messages")
          .update(updates)
          .eq("id", id);
        if (error) throw error;
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
      toast.success("Mensagem atualizada!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    } finally {
      setEditingId(null);
    }
  };

  const clearHistory = async () => {
    setClearingHistory(true);
    try {
      if (instanceId) {
        const { data, error } = await supabase.functions.invoke("scheduled-messages-proxy", {
          body: { action: "clear-history", instanceId },
        });
        if (error) throw error;
      } else {
        // Only clear non-recurring sent messages + failed/cancelled for current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Não autenticado");
        const { error } = await supabase
          .from("scheduled_group_messages")
          .delete()
          .eq("user_id", user.id)
          .eq("is_recurring", false)
          .in("status", ["sent", "failed", "cancelled"]);
        if (error) throw error;
      }
      setMessages((prev) => prev.filter((m) => m.status === "pending" || (m.is_recurring && m.status === "sent")));
      toast.success("Histórico limpo!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao limpar histórico");
    } finally {
      setClearingHistory(false);
    }
  };

  // Recurring messages with "sent" status (finished) stay in pending tab
  const pendingMessages = messages.filter(
    (m) => m.status === "pending" || (m.is_recurring && m.status === "sent")
  );
  const historyMessages = messages.filter(
    (m) => !pendingMessages.includes(m) && m.status !== "pending"
  );

  const filterByRecurring = (list: ScheduledMessage[]) =>
    onlyRecurring ? list.filter((m) => m.is_recurring) : list;

  const filteredPending = filterByRecurring(pendingMessages);
  const filteredHistory = filterByRecurring(historyMessages);

  const pendingCount = pendingMessages.length;
  const recurringCount = messages.filter((m) => m.is_recurring && (m.status === "pending" || m.status === "sent")).length;

  const renderList = (list: ScheduledMessage[], allowActions: boolean) => {
    if (list.length === 0) {
      return (
        <div className="text-center py-12">
          <Inbox className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma mensagem encontrada</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3 max-h-[45vh] overflow-y-auto">
        {list.map((msg) => (
          <MessageCard
            key={msg.id}
            msg={msg}
            onDelete={allowActions ? deleteMessage : undefined}
            onEdit={allowActions ? editMessage : undefined}
            deletingId={deletingId}
            editingId={editingId}
          />
        ))}
      </div>
    );
  };

  const content = (
    <div className="flex flex-col gap-4">
      {/* Stats & Actions */}
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

      {/* Recurring filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <Switch
          id="filter-recurring"
          checked={onlyRecurring}
          onCheckedChange={setOnlyRecurring}
        />
        <Label htmlFor="filter-recurring" className="text-xs text-muted-foreground cursor-pointer">
          Apenas recorrentes
        </Label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
        </div>
      ) : (
        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="pending" className="flex-1 gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Pendentes ({filteredPending.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 gap-1.5">
              <History className="h-3.5 w-3.5" />
              Histórico ({filteredHistory.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-3">
            {renderList(filteredPending, true)}
          </TabsContent>
          <TabsContent value="history" className="mt-3">
            {filteredHistory.length > 0 && (
              <div className="flex justify-end mb-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={clearingHistory}>
                      {clearingHistory ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                      Limpar histórico
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Limpar histórico?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Todas as mensagens enviadas, canceladas e com falha serão removidas permanentemente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={clearHistory}>Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
            {renderList(filteredHistory, true)}
          </TabsContent>
        </Tabs>
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
