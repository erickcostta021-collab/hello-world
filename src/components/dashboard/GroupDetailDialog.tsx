import { useState, useEffect, useRef } from "react";
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
  UserPlus,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  RefreshCw,
  Image,
  Video,
  Music,
  FileText,
  Paperclip,
  X,
  Repeat,
  CalendarDays,
  CalendarRange,
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
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const isMobile = useIsMobile();
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  // Recurring message states
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState<"daily" | "weekly" | "monthly">("daily");
  const [recurringSendTime, setRecurringSendTime] = useState("09:00");
  const [recurringWeekdays, setRecurringWeekdays] = useState<number[]>([1]);
  const [recurringDayOfMonth, setRecurringDayOfMonth] = useState(15);
  const [recurringEndDate, setRecurringEndDate] = useState("");
  const [recurringMaxExec, setRecurringMaxExec] = useState("3");

  // New states for added features
  const [addPhoneInput, setAddPhoneInput] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);
  const [promotingPhone, setPromotingPhone] = useState<string | null>(null);
  const [demotingPhone, setDemotingPhone] = useState<string | null>(null);
  const [currentGroupName, setCurrentGroupName] = useState(groupName);

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
      setCurrentGroupName(data?.groupName || groupName);
    } catch (err: any) {
      console.error("Failed to fetch group details:", err);
      toast.error(err.message || "Erro ao buscar detalhes do grupo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && groupId) {
      setCurrentGroupName(groupName);
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
      setMediaUrl("");
      setMediaType(null);
      setAddPhoneInput("");
      setEditingName(false);
      setEditingDesc(false);
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
    a.download = `participantes-${currentGroupName.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${participants.length} participantes exportados!`);
  };

  const removeParticipant = async (participant: ParticipantInfo) => {
    setRemovingPhone(participant.phone);
    try {
      const msgText = `#removerdogrupo ${groupId}|${participant.phone}`;
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: { instanceId: instance.id, messageText: msgText },
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
      const msgText = `${cmd} ${groupId}`;
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: { instanceId: instance.id, messageText: msgText },
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
      const msgText = `${cmd} ${groupId}`;
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: { instanceId: instance.id, messageText: msgText },
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

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 5MB)");
      return;
    }
    setUploadingMedia(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data, error } = await supabase.functions.invoke("upload-command-image", { body: formData });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMediaUrl(data.url);
      setMediaType(type);
      toast.success(`${type === "image" ? "Imagem" : type === "video" ? "Vídeo" : type === "audio" ? "Áudio" : "Documento"} anexado!`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer upload");
    } finally {
      setUploadingMedia(false);
      if (mediaInputRef.current) mediaInputRef.current.value = "";
    }
  };

  const triggerMediaUpload = (type: string) => {
    setMediaType(type);
    const accept = type === "image" ? "image/*" : type === "video" ? "video/*" : type === "audio" ? "audio/*" : "*/*";
    if (mediaInputRef.current) {
      mediaInputRef.current.accept = accept;
      mediaInputRef.current.click();
    }
  };

  const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const toggleWeekday = (day: number) => {
    setRecurringWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const sendGroupMessage = async () => {
    if (!messageText.trim()) {
      toast.error("Digite uma mensagem");
      return;
    }

    // Recurring message flow
    if (scheduleEnabled && recurringEnabled) {
      if (!recurringSendTime) {
        toast.error("Selecione um horário para a recorrência");
        return;
      }
      if (recurringInterval === "weekly" && recurringWeekdays.length === 0) {
        toast.error("Selecione pelo menos um dia da semana");
        return;
      }
      setSendingMessage(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado");

        // Compute first scheduled_for
        const now = new Date();
        const [h, m] = recurringSendTime.split(":").map(Number);
        let firstDate = new Date(now);
        firstDate.setHours(h, m, 0, 0);

        if (recurringInterval === "weekly") {
          const today = now.getDay();
          const sorted = [...recurringWeekdays].sort();
          let nextDay = sorted.find((d) => d > today || (d === today && firstDate > now));
          if (nextDay === undefined) {
            nextDay = sorted[0];
            firstDate.setDate(firstDate.getDate() + (7 - today + nextDay));
          } else {
            firstDate.setDate(firstDate.getDate() + (nextDay - today));
          }
          firstDate.setHours(h, m, 0, 0);
        } else if (recurringInterval === "monthly") {
          firstDate.setDate(recurringDayOfMonth);
          if (firstDate <= now) firstDate.setMonth(firstDate.getMonth() + 1);
          firstDate.setHours(h, m, 0, 0);
        } else {
          if (firstDate <= now) firstDate.setDate(firstDate.getDate() + 1);
        }

        const { error: insertError } = await supabase
          .from("scheduled_group_messages")
          .insert({
            user_id: user.id,
            instance_id: instance.id,
            group_jid: groupId,
            group_name: currentGroupName,
            message_text: messageText.trim(),
            mention_all: mentionAll,
            scheduled_for: firstDate.toISOString(),
            is_recurring: true,
            recurring_interval: recurringInterval,
            send_time: recurringSendTime,
            weekdays: recurringInterval === "weekly" ? recurringWeekdays : null,
            day_of_month: recurringInterval === "monthly" ? recurringDayOfMonth : null,
            end_date: recurringEndDate || null,
            max_executions: recurringMaxExec ? parseInt(recurringMaxExec) : null,
            status: "pending",
            media_url: mediaUrl || null,
            media_type: mediaType || null,
          });

        if (insertError) throw insertError;
        toast.success(`Mensagem recorrente criada! Primeiro envio: ${firstDate.toLocaleString("pt-BR")}`);
        resetMessageForm();
      } catch (err: any) {
        toast.error(err.message || "Erro ao criar recorrência");
      } finally {
        setSendingMessage(false);
      }
      return;
    }

    let scheduledFor: string | undefined;
    if (scheduleEnabled) {
      if (!scheduleDate || !scheduleTime) {
        toast.error("Selecione data e hora para agendar");
        return;
      }
      const [hours, minutes] = scheduleTime.split(":").map(Number);
      const scheduledAt = new Date(scheduleDate);
      scheduledAt.setHours(hours, minutes, 0, 0);
      if (scheduledAt <= new Date()) {
        toast.error("A data/hora deve ser no futuro");
        return;
      }
      scheduledFor = scheduledAt.toISOString();
    }

    setSendingMessage(true);
    try {
      let finalMessage = messageText.trim();

      if (scheduledFor) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado");

        const { error: insertError } = await supabase
          .from("scheduled_group_messages")
          .insert({
            user_id: user.id,
            instance_id: instance.id,
            group_jid: groupId,
            group_name: currentGroupName,
            message_text: finalMessage,
            mention_all: mentionAll,
            scheduled_for: scheduledFor,
            is_recurring: false,
            status: "pending",
            media_url: mediaUrl || null,
            media_type: mediaType || null,
          });

        if (insertError) throw insertError;
        toast.success(`Mensagem agendada para ${new Date(scheduledFor).toLocaleString("pt-BR")}!`);
      } else {
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
      }

      resetMessageForm();
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar mensagem");
    } finally {
      setSendingMessage(false);
    }
  };

  const resetMessageForm = () => {
    setMessageText("");
    setMentionAll(false);
    setScheduleEnabled(false);
    setScheduleDate(undefined);
    setScheduleTime("");
    setMediaUrl("");
    setMediaType(null);
    setRecurringEnabled(false);
    setRecurringInterval("daily");
    setRecurringSendTime("09:00");
    setRecurringWeekdays([1]);
    setRecurringDayOfMonth(15);
    setRecurringEndDate("");
    setRecurringMaxExec("3");
    setShowMessageDialog(false);
  };

  // Add member
  const addMember = async () => {
    const phone = addPhoneInput.trim().replace(/\D/g, "");
    if (!phone) {
      toast.error("Digite um número de telefone");
      return;
    }
    setAddingMember(true);
    try {
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: { instanceId: instance.id, messageText: `#addnogrupo ${groupId}|${phone}` },
      });
      if (error) throw error;
      if (data && !data.success && data.message) throw new Error(data.message);
      toast.success(`Membro ${phone} adicionado ao grupo!`);
      setAddPhoneInput("");
      fetchGroupDetails(); // Refresh
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar membro");
    } finally {
      setAddingMember(false);
    }
  };

  // Edit group name
  const saveGroupName = async () => {
    if (!newGroupName.trim()) return;
    setSavingName(true);
    try {
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: { instanceId: instance.id, messageText: `#attnomegrupo ${groupId}|${newGroupName.trim()}` },
      });
      if (error) throw error;
      if (data && !data.success && data.message) throw new Error(data.message);
      toast.success("Nome do grupo atualizado!");
      setCurrentGroupName(newGroupName.trim());
      setEditingName(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar nome");
    } finally {
      setSavingName(false);
    }
  };

  // Edit group description
  const saveGroupDesc = async () => {
    setSavingDesc(true);
    try {
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: { instanceId: instance.id, messageText: `#attdescricao ${groupId}|${newGroupDesc.trim()}` },
      });
      if (error) throw error;
      if (data && !data.success && data.message) throw new Error(data.message);
      toast.success("Descrição do grupo atualizada!");
      setGroupDescription(newGroupDesc.trim());
      setEditingDesc(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar descrição");
    } finally {
      setSavingDesc(false);
    }
  };

  // Copy invite link
  const copyInviteLink = async () => {
    setCopyingLink(true);
    try {
      // We need to get the invite link - use the group-commands function but for link retrieval
      // We'll call the UAZAPI inviteCode endpoint directly via a new approach
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: { instanceId: instance.id, messageText: `#linkgrupo ${groupId}|clipboard` },
      });
      if (error) throw error;
      // The response is wrapped in data.result
      const result = data?.result || data;
      const msg = result?.message || "";
      const linkMatch = msg.match(/https:\/\/chat\.whatsapp\.com\/\S+/);
      if (linkMatch) {
        navigator.clipboard.writeText(linkMatch[0]);
        toast.success("Link de convite copiado!");
      } else {
        toast.error(result?.message || "Não foi possível obter o link de convite");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao copiar link");
    } finally {
      setCopyingLink(false);
    }
  };

  // Promote to admin
  const promoteParticipant = async (phone: string) => {
    setPromotingPhone(phone);
    try {
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: { instanceId: instance.id, messageText: `#promoveradmin ${groupId}|${phone}` },
      });
      if (error) throw error;
      if (data && !data.success && data.message) throw new Error(data.message);
      toast.success(`${phone} promovido a admin!`);
      setParticipants((prev) =>
        prev.map((p) => (p.phone === phone ? { ...p, isAdmin: true } : p))
      );
    } catch (err: any) {
      toast.error(err.message || "Erro ao promover");
    } finally {
      setPromotingPhone(null);
    }
  };

  // Demote from admin
  const demoteParticipant = async (phone: string) => {
    setDemotingPhone(phone);
    try {
      const { data, error } = await supabase.functions.invoke("group-commands", {
        body: { instanceId: instance.id, messageText: `#revogaradmin ${groupId}|${phone}` },
      });
      if (error) throw error;
      if (data && !data.success && data.message) throw new Error(data.message);
      toast.success(`${phone} rebaixado a membro!`);
      setParticipants((prev) =>
        prev.map((p) => (p.phone === phone ? { ...p, isAdmin: false } : p))
      );
    } catch (err: any) {
      toast.error(err.message || "Erro ao revogar admin");
    } finally {
      setDemotingPhone(null);
    }
  };

  const content = (
    <div className="flex flex-col gap-4">
      {/* Group Info Card */}
      <Card className="bg-card/80 border-border/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {/* Group avatar placeholder */}
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              {/* Group name with edit */}
              <div className="flex items-center gap-2">
                {editingName ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="h-8 text-sm"
                      placeholder="Novo nome do grupo"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && saveGroupName()}
                    />
                    <Button size="sm" variant="outline" onClick={saveGroupName} disabled={savingName}>
                      {savingName ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                      ✕
                    </Button>
                  </div>
                ) : (
                  <>
                    <h3 className="font-semibold text-card-foreground text-lg truncate">
                      {currentGroupName}
                    </h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setNewGroupName(currentGroupName);
                        setEditingName(true);
                      }}
                      title="Editar nome do grupo"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </>
                )}
              </div>

              {/* Description with edit */}
              <div className="flex items-start gap-1 mt-1">
                {editingDesc ? (
                  <div className="flex flex-col gap-2 flex-1">
                    <Textarea
                      value={newGroupDesc}
                      onChange={(e) => setNewGroupDesc(e.target.value)}
                      className="text-sm min-h-[60px]"
                      placeholder="Nova descrição"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={saveGroupDesc} disabled={savingDesc}>
                        {savingDesc ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingDesc(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p
                      className="text-sm text-muted-foreground line-clamp-2 cursor-pointer hover:text-foreground transition-colors"
                      onClick={() => {
                        setNewGroupDesc(groupDescription);
                        setEditingDesc(true);
                      }}
                      title="Clique para editar descrição"
                    >
                      {groupDescription || "Sem descrição"}
                    </p>
                  </>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="font-medium text-card-foreground">{participantCount}</span> participantes
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="font-medium text-card-foreground">{adminCount}</span> Admins
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                JID: {groupId}
              </p>
            </div>
            {/* Link Convite button */}
            <Button
              variant="outline"
              size="sm"
              onClick={copyInviteLink}
              disabled={copyingLink}
              className="shrink-0 border-primary/50 text-primary hover:bg-primary/10"
            >
              {copyingLink ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Link className="h-4 w-4 mr-1" />
              )}
              Link Convite
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons Row */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="border-primary/50 text-primary hover:bg-primary/10"
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

      {/* Add Participant Section */}
      <Card className="bg-card/80 border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-primary">
              <UserPlus className="h-4 w-4" />
              <span className="text-sm font-semibold">Adicionar participante</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="5511999999999"
              value={addPhoneInput}
              onChange={(e) => setAddPhoneInput(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && addMember()}
            />
            <Button
              size="icon"
              onClick={addMember}
              disabled={addingMember || !addPhoneInput.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
            >
              {addingMember ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            💡 Digite o número completo com DDD e código do país
          </p>
        </CardContent>
      </Card>

      {/* Participants Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-bold text-card-foreground">Participantes</span>
          <Badge variant="secondary" className="text-xs bg-primary/20 text-primary">
            {participantCount} total
          </Badge>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchGroupDetails} title="Atualizar">
            <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadCsv}
          disabled={participants.length === 0}
          className="text-primary border-primary/50"
        >
          <Download className="h-4 w-4 mr-1" />
          Baixar CSV
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
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Role badge */}
                  {p.isSuperAdmin ? (
                    <Badge variant="outline" className="text-[10px] px-2">Dono</Badge>
                  ) : p.isAdmin ? (
                    <Badge variant="outline" className="text-[10px] px-2">Admin</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-2 text-muted-foreground">Membro</Badge>
                  )}

                  {/* Promote button */}
                  {!p.isSuperAdmin && !p.isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      onClick={() => promoteParticipant(p.phone)}
                      disabled={promotingPhone === p.phone}
                      title="Promover a Admin"
                    >
                      {promotingPhone === p.phone ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowUp className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}

                  {/* Demote button */}
                  {p.isAdmin && !p.isSuperAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-amber-500"
                      onClick={() => demoteParticipant(p.phone)}
                      disabled={demotingPhone === p.phone}
                      title="Revogar Admin"
                    >
                      {demotingPhone === p.phone ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}

                  {/* Remove button */}
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
            Tem certeza que deseja remover <strong>{confirmRemove?.name || confirmRemove?.phone}</strong> do grupo <strong>{currentGroupName}</strong>?
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
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-primary">
            Enviar Mensagem no Grupo
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">{currentGroupName}</DialogDescription>
        </DialogHeader>
        <DialogBody>
        <div className="flex flex-col gap-4 py-1">
          {/* Schedule toggle */}
          <div className="flex items-center gap-2 rounded-lg border border-border/50 p-3">
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

          {/* Date/time picker for one-time schedule */}
          {scheduleEnabled && !recurringEnabled && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Data e Hora do Envio</Label>
              <div className="flex gap-2 rounded-lg border border-border/50 p-2">
                <Input
                  type="date"
                  value={scheduleDate ? format(scheduleDate, "yyyy-MM-dd") : ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      const [y, m, d] = val.split("-").map(Number);
                      setScheduleDate(new Date(y, m - 1, d));
                    } else {
                      setScheduleDate(undefined);
                    }
                  }}
                  min={format(new Date(), "yyyy-MM-dd")}
                  className="flex-1 h-10"
                />
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-[120px] h-10"
                  placeholder="--:--"
                />
              </div>
            </div>
          )}

          {/* Recurring toggle */}
          {scheduleEnabled && (
            <div className="flex items-center gap-2 rounded-lg border border-border/50 p-3">
              <Switch
                id="recurring-toggle"
                checked={recurringEnabled}
                onCheckedChange={setRecurringEnabled}
              />
              <Label htmlFor="recurring-toggle" className="text-sm cursor-pointer flex items-center gap-1.5">
                <Repeat className="h-4 w-4" />
                Mensagem recorrente
              </Label>
            </div>
          )}

          {/* Recurring options */}
          {scheduleEnabled && recurringEnabled && (
            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              {/* Interval type */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Frequência</Label>
                <div className="flex gap-2">
                  {([
                    { val: "daily", icon: CalendarDays, label: "Diário" },
                    { val: "weekly", icon: CalendarRange, label: "Semanal" },
                    { val: "monthly", icon: CalendarIcon, label: "Mensal" },
                  ] as const).map(({ val, icon: Icon, label }) => (
                    <Button
                      key={val}
                      type="button"
                      size="sm"
                      variant={recurringInterval === val ? "default" : "outline"}
                      className="flex-1 text-xs"
                      onClick={() => setRecurringInterval(val)}
                    >
                      <Icon className="h-3.5 w-3.5 mr-1" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Send time */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Horário de Envio</Label>
                <Input
                  type="time"
                  value={recurringSendTime}
                  onChange={(e) => setRecurringSendTime(e.target.value)}
                  className="h-9"
                />
              </div>

              {/* Weekday selector */}
              {recurringInterval === "weekly" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Dias da Semana</Label>
                  <div className="flex gap-1 flex-wrap">
                    {WEEKDAY_LABELS.map((label, idx) => (
                      <Button
                        key={idx}
                        type="button"
                        size="sm"
                        variant={recurringWeekdays.includes(idx) ? "default" : "outline"}
                        className="h-8 w-10 text-xs p-0"
                        onClick={() => toggleWeekday(idx)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Day of month */}
              {recurringInterval === "monthly" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Dia do Mês</Label>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    value={recurringDayOfMonth}
                    onChange={(e) => setRecurringDayOfMonth(parseInt(e.target.value) || 1)}
                    className="h-9 w-20"
                  />
                </div>
              )}

              {/* Advanced: end date and max executions */}
              <div className="space-y-1.5 pt-1 border-t border-border/30">
                <Label className="text-xs font-medium text-muted-foreground">Opções Avançadas</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Data Final</Label>
                    <Input
                      type="date"
                      value={recurringEndDate}
                      onChange={(e) => setRecurringEndDate(e.target.value)}
                      min={format(new Date(), "yyyy-MM-dd")}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Máx. Execuções</Label>
                    <Input
                      type="number"
                      min={1}
                      value={recurringMaxExec}
                      onChange={(e) => setRecurringMaxExec(e.target.value)}
                      placeholder="∞"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="group-message" className="text-sm font-medium">Mensagem</Label>
            <Textarea
              id="group-message"
              placeholder="Digite sua mensagem..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="min-h-[140px] resize-y text-sm"
            />
          </div>

          {/* Media attachment */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" />
              <span>Anexar Mídia (opcional)</span>
            </div>
            <input
              ref={mediaInputRef}
              type="file"
              className="hidden"
              onChange={(e) => handleMediaUpload(e, mediaType || "image")}
            />
            {mediaUrl ? (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                {mediaType === "image" && <Image className="h-4 w-4 text-primary" />}
                {mediaType === "video" && <Video className="h-4 w-4 text-primary" />}
                {mediaType === "audio" && <Music className="h-4 w-4 text-primary" />}
                {mediaType === "document" && <FileText className="h-4 w-4 text-primary" />}
                <span className="text-xs text-card-foreground truncate flex-1">
                  {mediaType === "image" ? "Imagem" : mediaType === "video" ? "Vídeo" : mediaType === "audio" ? "Áudio" : "Documento"} anexado
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => { setMediaUrl(""); setMediaType(null); }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => triggerMediaUpload("image")} disabled={uploadingMedia}>
                  <Image className="h-3.5 w-3.5 mr-1" /> Imagem
                </Button>
                <Button variant="outline" size="sm" onClick={() => triggerMediaUpload("video")} disabled={uploadingMedia}>
                  <Video className="h-3.5 w-3.5 mr-1" /> Vídeo
                </Button>
                <Button variant="outline" size="sm" onClick={() => triggerMediaUpload("audio")} disabled={uploadingMedia}>
                  <Music className="h-3.5 w-3.5 mr-1" /> Áudio
                </Button>
                <Button variant="outline" size="sm" onClick={() => triggerMediaUpload("document")} disabled={uploadingMedia}>
                  <FileText className="h-3.5 w-3.5 mr-1" /> Documento
                </Button>
                {uploadingMedia && <Loader2 className="h-4 w-4 animate-spin text-primary ml-1 self-center" />}
              </div>
            )}
          </div>

          {/* Mention all */}
          <div className="flex items-center gap-2 rounded-lg border border-border/50 p-3">
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
        </DialogBody>
        <DialogFooter className="flex-row gap-2 sm:gap-2 justify-end">
          <Button variant="outline" onClick={() => setShowMessageDialog(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={sendGroupMessage}
            disabled={sendingMessage || !messageText.trim()}
          >
            {sendingMessage ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : recurringEnabled ? (
              <Repeat className="h-4 w-4 mr-1" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            {recurringEnabled ? "Criar Recorrência" : scheduleEnabled ? "Agendar" : "Enviar"}
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
              Detalhes do Grupo
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
