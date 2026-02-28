import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Instance } from "@/hooks/useInstances";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Users,
  Search,
  Loader2,
  Shield,
  ShieldCheck,
  Copy,
  Link,
  ArrowLeft,
  Phone,
  Download,
  Trash2,
  MessageSquare,
  Lock,
  Unlock,
  Pencil,
  Send,
  Calendar as CalendarIcon,
} from "lucide-react";

interface GroupDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: Instance;
  groupId: string;
  groupName: string;
}

interface ParticipantInfo {
  id: string;
  phone: string;
  lid?: string;
  name?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export function GroupDetailDialog({
  open,
  onOpenChange,
  instance,
  groupId,
  groupName,
}: GroupDetailDialogProps) {
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [participantCount, setParticipantCount] = useState(0);
  const [removingPhone, setRemovingPhone] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ParticipantInfo | null>(null);
  const [isAnnounce, setIsAnnounce] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [togglingAnnounce, setTogglingAnnounce] = useState(false);
  const [togglingLocked, setTogglingLocked] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [mentionAll, setMentionAll] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState("");
  const isMobile = useIsMobile();

  const fetchGroupDetails = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-groups", {
        body: { instanceId: instance.id, groupjid: groupId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setParticipants(data?.participants || []);
      setGroupDescription(data?.groupDescription || "");
      setParticipantCount(data?.participantCount || data?.participants?.length || 0);
      setIsAnnounce(data?.isAnnounce ?? false);
      setIsLocked(data?.isLocked ?? false);
    } catch (err: any) {
      console.error("Failed to fetch group details:", err);
      toast.error(err.message || "Erro ao buscar detalhes do grupo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && groupId) {
      fetchGroupDetails();
    } else {
      setParticipants([]);
      setSearchQuery("");
      setGroupDescription("");
      setShowMessageDialog(false);
      setMessageText("");
      setMentionAll(false);
      setScheduleEnabled(false);
      setScheduleDate(undefined);
      setScheduleTime("");
    }
  }, [open, groupId]);

  const adminCount = participants.filter((p) => p.isAdmin || p.isSuperAdmin).length;

  const filteredParticipants = participants.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      (p.name?.toLowerCase().includes(q) ?? false) ||
      p.phone.includes(q)
    );
  });

  const copyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    toast.success("Número copiado!");
  };

  const copyGroupJid = () => {
    navigator.clipboard.writeText(groupId);
    toast.success("JID do grupo copiado!");
  };

  const downloadCsv = () => {
    if (participants.length === 0) {
      toast.error("Nenhum participante para exportar");
      return;
    }
    const header = "Nome,Telefone,Admin,Dono";
    const rows = participants.map((p) =>
      `"${(p.name || "").replace(/"/g, '""')}","${p.phone}","${p.isAdmin ? "Sim" : "Não"}","${p.isSuperAdmin ? "Sim" : "Não"}"`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `participantes-${groupName.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${participants.length} participantes exportados!`);
  };

  const removeParticipant = async (participant: ParticipantInfo) => {
    setRemovingPhone(participant.phone);
    try {
      const messageText = `#removerdogrupo ${groupId}|${participant.phone}`;
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: { instanceId: instance.id, messageText },
      });

      if (error) throw error;
      if (data?.result && !data.result.success) {
        throw new Error(data.result.message || "Erro ao remover participante");
      }

      toast.success(`${participant.name || participant.phone} removido do grupo!`);
      setParticipants((prev) => prev.filter((p) => p.phone !== participant.phone));
      setParticipantCount((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      console.error("Failed to remove participant:", err);
      toast.error(err.message || "Erro ao remover participante");
    } finally {
      setRemovingPhone(null);
      setConfirmRemove(null);
    }
  };

  const toggleAnnounce = async () => {
    setTogglingAnnounce(true);
    try {
      const cmd = isAnnounce ? "#msgliberada" : "#somenteadminmsg";
      const messageText = `${cmd} ${groupId}`;
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: { instanceId: instance.id, messageText },
      });
      if (error) throw error;
      if (data?.result && !data.result.success) throw new Error(data.result.message);
      setIsAnnounce(!isAnnounce);
      toast.success(isAnnounce ? "Todos podem enviar mensagens agora" : "Apenas admins podem enviar mensagens agora");
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar configuração");
    } finally {
      setTogglingAnnounce(false);
    }
  };

  const toggleLocked = async () => {
    setTogglingLocked(true);
    try {
      const cmd = isLocked ? "#editliberado" : "#somenteadminedit";
      const messageText = `${cmd} ${groupId}`;
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: { instanceId: instance.id, messageText },
      });
      if (error) throw error;
      if (data?.result && !data.result.success) throw new Error(data.result.message);
      setIsLocked(!isLocked);
      toast.success(isLocked ? "Todos podem editar o grupo agora" : "Apenas admins podem editar o grupo agora");
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar configuração");
    } finally {
      setTogglingLocked(false);
    }
  };

  const sendGroupMessage = async () => {
    if (!messageText.trim()) {
      toast.error("Digite uma mensagem");
      return;
    }
    setSendingMessage(true);
    try {
      let finalMessage = messageText.trim();
      if (mentionAll) {
        finalMessage = `@todos\n${finalMessage}`;
      }
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: {
          instanceId: instance.id,
          messageText: `#enviargrupo ${groupId}|${finalMessage}`,
        },
      });

      if (error) throw error;
      if (data?.result && !data.result.success) throw new Error(data.result.message);
      toast.success("Mensagem enviada ao grupo!");
      setMessageText("");
      setMentionAll(false);
      setShowMessageDialog(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar mensagem");
    } finally {
      setSendingMessage(false);
    }
  };

  const content = (
    <div className="flex flex-col gap-4">
      {/* Group Info Card */}
      <Card className="bg-card/80 border-border/50">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-card-foreground text-lg truncate">
                {groupName}
              </h3>
              {groupDescription && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {groupDescription}
                </p>
              )}
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="font-medium text-card-foreground">{participantCount}</span> participantes
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="font-medium text-card-foreground">{adminCount}</span> admins
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                JID: {groupId}
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={copyGroupJid}>
                <Link className="h-4 w-4 mr-1" />
                Copiar JID
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadCsv}
                disabled={participants.length === 0}
              >
                <Download className="h-4 w-4 mr-1" />
                Baixar CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowMessageDialog(true)}
        >
          <MessageSquare className="h-4 w-4 mr-1" />
          Enviar Mensagem
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={toggleAnnounce}
          disabled={togglingAnnounce}
        >
          {togglingAnnounce ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : isAnnounce ? (
            <Lock className="h-4 w-4 mr-1" />
          ) : (
            <MessageSquare className="h-4 w-4 mr-1" />
          )}
          {isAnnounce ? "Só Admins Enviam" : "Todos Enviam"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={toggleLocked}
          disabled={togglingLocked}
        >
          {togglingLocked ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : isLocked ? (
            <Lock className="h-4 w-4 mr-1" />
          ) : (
            <Pencil className="h-4 w-4 mr-1" />
          )}
          {isLocked ? "Só Admins Editam" : "Todos Editam"}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar participantes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Participants Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-card-foreground">
            Participantes
          </span>
          <Badge variant="secondary" className="text-xs">
            {filteredParticipants.length} total
          </Badge>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando participantes...</span>
        </div>
      )}

      {/* Participants List */}
      {!loading && filteredParticipants.length > 0 && (
        <div className="flex flex-col gap-2">
          {filteredParticipants.map((p, idx) => (
            <Card
              key={p.id || idx}
              className="bg-card/60 border-border/50 hover:border-primary/40 transition-all"
            >
              <CardContent className="p-3 flex items-center gap-3">
                <div
                  className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0 cursor-pointer"
                  onClick={() => copyPhone(p.phone)}
                  title="Copiar número"
                >
                  <Phone className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => copyPhone(p.phone)}>
                  <p className="text-sm font-medium text-card-foreground truncate">
                    {p.name || `+${p.phone}`}
                  </p>
                  {p.name && (
                    <p className="text-xs text-muted-foreground">
                      +{p.phone}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.isSuperAdmin && (
                    <Badge className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                      <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                      Dono
                    </Badge>
                  )}
                  {p.isAdmin && !p.isSuperAdmin && (
                    <Badge className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                      <Shield className="h-2.5 w-2.5 mr-0.5" />
                      Admin
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyPhone(p.phone);
                    }}
                    title="Copiar número"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {!p.isSuperAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={removingPhone === p.phone}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmRemove(p);
                      }}
                      title="Remover do grupo"
                    >
                      {removingPhone === p.phone ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && participants.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum participante encontrado</p>
        </div>
      )}

      {/* No search results */}
      {!loading && participants.length > 0 && filteredParticipants.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            Nenhum participante corresponde à pesquisa "{searchQuery}"
          </p>
        </div>
      )}
    </div>
  );

  const confirmDialog = (
    <AlertDialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover participante</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja remover <strong>{confirmRemove?.name || confirmRemove?.phone}</strong> do grupo <strong>{groupName}</strong>?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => confirmRemove && removeParticipant(confirmRemove)}
          >
            Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const messageDialog = (
    <Dialog open={showMessageDialog} onOpenChange={setShowMessageDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            {scheduleEnabled ? "Agendar Mensagem" : "Enviar Mensagem no Grupo"}
          </DialogTitle>
          <DialogDescription>{groupName}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {/* Schedule toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="schedule-toggle"
              checked={scheduleEnabled}
              onCheckedChange={setScheduleEnabled}
            />
            <Label htmlFor="schedule-toggle" className="text-sm cursor-pointer flex items-center gap-1.5">
              <CalendarIcon className="h-4 w-4" />
              Agendar envio
            </Label>
          </div>

          {/* Date/time picker */}
          {scheduleEnabled && (
            <div className="space-y-2">
              <Label>Data e Hora do Envio</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start text-left font-normal">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {scheduleDate ? format(scheduleDate, "dd/MM/yyyy") : "dd/mm/aaaa"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={scheduleDate}
                      onSelect={setScheduleDate}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-[120px]"
                  placeholder="--:--"
                />
              </div>
            </div>
          )}

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="group-message">Mensagem</Label>
            <Textarea
              id="group-message"
              placeholder="Digite sua mensagem..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="min-h-[120px] resize-none"
            />
          </div>

          {/* Mention all */}
          <div className="flex items-center gap-2">
            <Switch
              id="mention-all"
              checked={mentionAll}
              onCheckedChange={setMentionAll}
            />
            <Label htmlFor="mention-all" className="text-sm cursor-pointer">
              Mencionar @todos no grupo
            </Label>
          </div>
        </div>
        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setShowMessageDialog(false)}>
            Cancelar
          </Button>
          <Button
            onClick={sendGroupMessage}
            disabled={sendingMessage || !messageText.trim()}
          >
            {sendingMessage ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            {scheduleEnabled ? "Agendar Mensagem" : "Enviar Agora"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              toast.info("Mensagens recorrentes em breve!");
            }}
          >
            <CalendarIcon className="h-4 w-4 mr-1" />
            Recorrente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="flex items-center gap-2">
                <ArrowLeft className="h-5 w-5 cursor-pointer" onClick={() => onOpenChange(false)} />
                Detalhes do Grupo
              </DrawerTitle>
            </DrawerHeader>
            <div className="p-4 pb-6 overflow-y-auto max-h-[70vh]">{content}</div>
          </DrawerContent>
        </Drawer>
        {confirmDialog}
        {messageDialog}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Detalhes do Grupo
            </DialogTitle>
            <DialogDescription>
              Informações completas e participantes
            </DialogDescription>
          </DialogHeader>
          <DialogBody>{content}</DialogBody>
        </DialogContent>
      </Dialog>
      {confirmDialog}
      {messageDialog}
    </>
  );
}
