import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Instance } from "@/hooks/useInstances";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Repeat,
  Loader2,
  Image,
  Video,
  Music,
  FileText,
  Paperclip,
  X,
  CalendarDays,
  CalendarRange,
  CalendarClock,
} from "lucide-react";

interface CreateRecurringMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: Instance;
  groupId: string;
  groupName: string;
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function CreateRecurringMessageDialog({
  open,
  onOpenChange,
  instance,
  groupId,
  groupName,
}: CreateRecurringMessageDialogProps) {
  const [interval, setInterval] = useState<"daily" | "weekly" | "monthly">("daily");
  const [sendTime, setSendTime] = useState("09:00");
  const [weekdays, setWeekdays] = useState<number[]>([1]); // Monday
  const [dayOfMonth, setDayOfMonth] = useState(15);
  const [messageText, setMessageText] = useState("");
  const [mentionAll, setMentionAll] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [maxExecutions, setMaxExecutions] = useState("3");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [creating, setCreating] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const resetForm = () => {
    setInterval("daily");
    setSendTime("09:00");
    setWeekdays([1]);
    setDayOfMonth(15);
    setMessageText("");
    setMentionAll(false);
    setEndDate("");
    setMaxExecutions("3");
    setMediaUrl("");
    setMediaType(null);
  };

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
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
      toast.success("Mídia anexada!");
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

  const handleCreate = async () => {
    if (!messageText.trim()) {
      toast.error("Digite uma mensagem");
      return;
    }
    if (interval === "weekly" && weekdays.length === 0) {
      toast.error("Selecione pelo menos um dia da semana");
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Calculate first scheduled_for based on interval
      const now = new Date();
      const [hours, minutes] = sendTime.split(":").map(Number);
      let scheduledFor = new Date();
      scheduledFor.setHours(hours, minutes, 0, 0);

      if (interval === "daily") {
        if (scheduledFor <= now) scheduledFor.setDate(scheduledFor.getDate() + 1);
      } else if (interval === "weekly") {
        // Find next matching weekday
        const sortedDays = [...weekdays].sort();
        const todayDay = now.getDay();
        let nextDay = sortedDays.find((d) => d > todayDay || (d === todayDay && scheduledFor > now));
        if (nextDay === undefined) {
          nextDay = sortedDays[0];
          scheduledFor.setDate(scheduledFor.getDate() + (7 - todayDay + nextDay));
        } else {
          scheduledFor.setDate(scheduledFor.getDate() + (nextDay - todayDay));
        }
      } else if (interval === "monthly") {
        scheduledFor.setDate(dayOfMonth);
        if (scheduledFor <= now) scheduledFor.setMonth(scheduledFor.getMonth() + 1);
      }

      const insertData: Record<string, unknown> = {
        user_id: user.id,
        instance_id: instance.id,
        group_jid: groupId,
        group_name: groupName,
        message_text: messageText.trim(),
        mention_all: mentionAll,
        scheduled_for: scheduledFor.toISOString(),
        is_recurring: true,
        recurring_interval: interval,
        status: "pending",
        send_time: sendTime,
        media_url: mediaUrl || null,
        media_type: mediaType || null,
        weekdays: interval === "weekly" ? weekdays : null,
        day_of_month: interval === "monthly" ? dayOfMonth : null,
        end_date: endDate ? new Date(endDate).toISOString() : null,
        max_executions: maxExecutions ? parseInt(maxExecutions) : null,
        execution_count: 0,
      };

      const { error: insertError } = await supabase
        .from("scheduled_group_messages")
        .insert(insertData as any);

      if (insertError) throw insertError;

      toast.success(`Mensagem recorrente criada! Primeiro envio: ${scheduledFor.toLocaleString("pt-BR")}`);
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar recorrência");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Repeat className="h-5 w-5" />
            Criar Mensagem Recorrente
          </DialogTitle>
          <DialogDescription className="text-xs">{groupName}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          {/* Recurrence type */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo de Recorrência</Label>
            <div className="flex gap-2">
              {(["daily", "weekly", "monthly"] as const).map((type) => (
                <Button
                  key={type}
                  variant={interval === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInterval(type)}
                  className={interval === type ? "bg-primary text-primary-foreground" : ""}
                >
                  {type === "daily" && <CalendarDays className="h-3.5 w-3.5 mr-1" />}
                  {type === "weekly" && <CalendarRange className="h-3.5 w-3.5 mr-1" />}
                  {type === "monthly" && <CalendarClock className="h-3.5 w-3.5 mr-1" />}
                  {type === "daily" ? "Diário" : type === "weekly" ? "Semanal" : "Mensal"}
                </Button>
              ))}
            </div>
          </div>

          {/* Send time */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Horário do Envio</Label>
            <Input
              type="time"
              value={sendTime}
              onChange={(e) => setSendTime(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Weekday selector (weekly only) */}
          {interval === "weekly" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Dias da Semana</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_LABELS.map((label, idx) => (
                  <Button
                    key={idx}
                    variant={weekdays.includes(idx) ? "default" : "outline"}
                    size="sm"
                    className={`px-3 ${weekdays.includes(idx) ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => toggleWeekday(idx)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Day of month (monthly only) */}
          {interval === "monthly" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Dia do Mês</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 1)}
                className="w-20 h-10"
              />
            </div>
          )}

          {/* Message */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Mensagem</Label>
            <Textarea
              placeholder="Digite sua mensagem..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="min-h-[100px] resize-y text-sm"
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
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => { setMediaUrl(""); setMediaType(null); }}>
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
            <Switch id="recurring-mention-all" checked={mentionAll} onCheckedChange={setMentionAll} />
            <Label htmlFor="recurring-mention-all" className="text-sm cursor-pointer">
              Mencionar @todos no grupo
            </Label>
          </div>

          {/* Advanced options */}
          <div className="space-y-3 rounded-lg border border-border/50 p-3">
            <Label className="text-sm font-medium">Opções Avançadas</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Data de Término (opcional)</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Limite de Execuções (opcional)</Label>
                <Input
                  type="number"
                  min={1}
                  value={maxExecutions}
                  onChange={(e) => setMaxExecutions(e.target.value)}
                  className="h-9 text-sm"
                  placeholder="∞"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-2 justify-end">
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleCreate}
            disabled={creating || !messageText.trim()}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Repeat className="h-4 w-4 mr-1" />
            )}
            Criar Recorrente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
