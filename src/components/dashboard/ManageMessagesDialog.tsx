import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Instance } from "@/hooks/useInstances";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner";
import {
  Loader2, Send, Clock, Plus, Trash2, Layers, CalendarIcon, ListChecks,
  Pause, Play, Trash, RefreshCw, Search, FolderOpen, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import { getBaseUrlForInstance } from "@/hooks/instances/instanceApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ManageMessagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: Instance;
}

const MESSAGE_TYPES = [
  { value: "text", label: "Texto" },
  { value: "image", label: "Imagem" },
  { value: "video", label: "Vídeo" },
  { value: "audio", label: "Áudio" },
  { value: "ptt", label: "Áudio Gravado (PTT)" },
  { value: "sticker", label: "Sticker" },
  { value: "document", label: "Documento" },
  { value: "contact", label: "Contato" },
  { value: "location", label: "Localização" },
  { value: "list", label: "Lista" },
  { value: "button", label: "Botão" },
  { value: "poll", label: "Enquete" },
  { value: "carousel", label: "Carrossel" },
];

// ─── Advanced message item ───
interface AdvancedMessage {
  number: string;
  type: string;
  text?: string;
  file?: string;
  docName?: string;
  footerText?: string;
  buttonText?: string;
  listButton?: string;
  imageButton?: string;
  choices?: string[];
  fullName?: string;
  phoneNumber?: string;
  organization?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
  linkPreview?: boolean;
}

function emptyAdvancedMsg(): AdvancedMessage {
  return { number: "", type: "text", text: "" };
}

// ─── Campaign folder type ───
interface CampaignFolder {
  folder_id?: string;
  id?: string;
  info?: string;
  status?: string;
  total?: number;
  sent?: number;
  failed?: number;
  scheduled?: number;
  created_at?: string;
  [key: string]: unknown;
}

interface CampaignMessage {
  id?: string;
  number?: string;
  status?: string;
  type?: string;
  text?: string;
  sent_at?: string;
  [key: string]: unknown;
}

export function ManageMessagesDialog({ open, onOpenChange, instance }: ManageMessagesDialogProps) {
  const { settings } = useSettings();
  const [sending, setSending] = useState(false);

  // ─── Simple campaign fields ───
  const [folder, setFolder] = useState("");
  const [numbers, setNumbers] = useState("");
  const [messageType, setMessageType] = useState("text");
  const [text, setText] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [docName, setDocName] = useState("");
  const [delayMin, setDelayMin] = useState("10");
  const [delayMax, setDelayMax] = useState("30");
  const [scheduledFor, setScheduledFor] = useState<Date | undefined>(undefined);
  const [linkPreview, setLinkPreview] = useState(false);
  const [footerText, setFooterText] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [choices, setChoices] = useState<string[]>([""]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactOrg, setContactOrg] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");

  // ─── Advanced campaign fields ───
  const [advInfo, setAdvInfo] = useState("");
  const [advDelayMin, setAdvDelayMin] = useState("3");
  const [advDelayMax, setAdvDelayMax] = useState("6");
  const [advScheduledFor, setAdvScheduledFor] = useState<Date | undefined>(undefined);
  const [advMessages, setAdvMessages] = useState<AdvancedMessage[]>([emptyAdvancedMsg()]);

  // ─── Campaign control fields ───
  const [campaignFolderId, setCampaignFolderId] = useState("");
  const [campaignAction, setCampaignAction] = useState<"stop" | "continue" | "delete">("stop");
  const [executingAction, setExecutingAction] = useState(false);

  // ─── List folders ───
  const [folders, setFolders] = useState<CampaignFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderStatusFilter, setFolderStatusFilter] = useState("");

  // ─── List messages ───
  const [msgFolderId, setMsgFolderId] = useState("");
  const [msgStatusFilter, setMsgStatusFilter] = useState("");
  const [msgPage, setMsgPage] = useState(1);
  const [msgPageSize, setMsgPageSize] = useState(10);
  const [campaignMessages, setCampaignMessages] = useState<CampaignMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);

  // ─── Clear done ───
  const [clearHours, setClearHours] = useState("168");
  const [clearingDone, setClearingDone] = useState(false);

  // ─── Clear all ───
  const [clearingAll, setClearingAll] = useState(false);

  const getBaseUrl = () => getBaseUrlForInstance(instance, settings?.uazapi_base_url);
  const getHeaders = () => ({ "Content-Type": "application/json", Accept: "application/json", token: instance.uazapi_instance_token });

  // ─── Campaign control ───
  const handleCampaignAction = async () => {
    if (!campaignFolderId.trim()) { toast.error("Informe o ID da campanha"); return; }
    setExecutingAction(true);
    try {
      const res = await fetch(`${getBaseUrl()}/sender/edit`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify({ folder_id: campaignFolderId.trim(), action: campaignAction }),
      });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      const labels = { stop: "pausada", continue: "retomada", delete: "deletada" };
      toast.success(`Campanha ${labels[campaignAction]} com sucesso!`);
      setCampaignFolderId("");
      // Refresh folders list
      if (folders.length > 0) handleListFolders();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally { setExecutingAction(false); }
  };

  // ─── List folders ───
  const handleListFolders = async () => {
    setLoadingFolders(true);
    try {
      const url = new URL(`${getBaseUrl()}/sender/listfolders`);
      if (folderStatusFilter) url.searchParams.set("status", folderStatusFilter);
      const res = await fetch(url.toString(), {
        method: "GET", headers: getHeaders(),
      });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.folders || data.data || []);
      setFolders(list);
      if (list.length === 0) toast.info("Nenhuma campanha encontrada");
    } catch (err: any) {
      toast.error(`Erro ao listar campanhas: ${err.message}`);
    } finally { setLoadingFolders(false); }
  };

  // ─── List messages of a folder ───
  const handleListMessages = async (folderId?: string) => {
    const id = folderId || msgFolderId;
    if (!id.trim()) { toast.error("Informe o ID da campanha"); return; }
    setLoadingMessages(true);
    try {
      const body: Record<string, unknown> = { folder_id: id.trim() };
      if (msgStatusFilter) body.messageStatus = msgStatusFilter;
      body.page = msgPage;
      body.pageSize = msgPageSize;
      const res = await fetch(`${getBaseUrl()}/sender/listmessages`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.messages || data.data || []);
      setCampaignMessages(list);
      setExpandedFolder(id.trim());
      if (list.length === 0) toast.info("Nenhuma mensagem encontrada");
    } catch (err: any) {
      toast.error(`Erro ao listar mensagens: ${err.message}`);
    } finally { setLoadingMessages(false); }
  };

  // ─── Clear done ───
  const handleClearDone = async () => {
    setClearingDone(true);
    try {
      const res = await fetch(`${getBaseUrl()}/sender/cleardone`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify({ hours: parseInt(clearHours) || 168 }),
      });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      toast.success("Limpeza de mensagens enviadas iniciada!");
      if (folders.length > 0) handleListFolders();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally { setClearingDone(false); }
  };

  // ─── Clear all ───
  const handleClearAll = async () => {
    setClearingAll(true);
    try {
      const res = await fetch(`${getBaseUrl()}/sender/clearall`, {
        method: "DELETE", headers: { Accept: "application/json", token: instance.uazapi_instance_token },
      });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      toast.success("Toda a fila de mensagens foi limpa!");
      setFolders([]);
      setCampaignMessages([]);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally { setClearingAll(false); }
  };

  const handleAddChoice = () => setChoices([...choices, ""]);
  const handleRemoveChoice = (index: number) => setChoices(choices.filter((_, i) => i !== index));
  const handleChoiceChange = (index: number, value: string) => {
    const updated = [...choices];
    updated[index] = value;
    setChoices(updated);
  };

  // ─── Advanced message helpers ───
  const updateAdvMsg = (index: number, patch: Partial<AdvancedMessage>) => {
    setAdvMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };
  const addAdvMsg = () => setAdvMessages((prev) => [...prev, emptyAdvancedMsg()]);
  const removeAdvMsg = (index: number) => setAdvMessages((prev) => prev.filter((_, i) => i !== index));
  const updateAdvChoice = (msgIdx: number, choiceIdx: number, value: string) => {
    setAdvMessages((prev) =>
      prev.map((m, i) => {
        if (i !== msgIdx) return m;
        const c = [...(m.choices || [""])];
        c[choiceIdx] = value;
        return { ...m, choices: c };
      })
    );
  };
  const addAdvChoice = (msgIdx: number) => {
    setAdvMessages((prev) =>
      prev.map((m, i) => (i === msgIdx ? { ...m, choices: [...(m.choices || []), ""] } : m))
    );
  };
  const removeAdvChoice = (msgIdx: number, choiceIdx: number) => {
    setAdvMessages((prev) =>
      prev.map((m, i) => (i === msgIdx ? { ...m, choices: (m.choices || []).filter((_, ci) => ci !== choiceIdx) } : m))
    );
  };

  // ─── Simple send ───
  const handleSendSimple = async () => {
    const numberList = numbers
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const clean = n.replace(/\D/g, "");
        return clean.includes("@") ? n.trim() : `${clean}@s.whatsapp.net`;
      });

    if (numberList.length === 0) { toast.error("Adicione pelo menos um número"); return; }
    if (messageType === "text" && !text.trim()) { toast.error("Digite a mensagem"); return; }

    const baseUrl = getBaseUrl();
    const body: Record<string, unknown> = {
      numbers: numberList,
      type: messageType,
      folder: folder || "Campanha Bridge",
      delayMin: parseInt(delayMin) || 10,
      delayMax: parseInt(delayMax) || 30,
      scheduled_for: scheduledFor ? scheduledFor.getTime() : 0,
    };
    if (text) body.text = text;
    if (linkPreview) body.linkPreview = true;
    if (fileUrl) body.file = fileUrl;
    if (docName) body.docName = docName;
    if (messageType === "contact") {
      body.fullName = contactName; body.phoneNumber = contactPhone;
      body.organization = contactOrg; body.email = contactEmail;
    }
    if (messageType === "location") {
      body.latitude = parseFloat(latitude) || 0; body.longitude = parseFloat(longitude) || 0;
      body.name = locationName; body.address = locationAddress;
    }
    if (["list", "button", "poll", "carousel"].includes(messageType)) {
      if (footerText) body.footerText = footerText;
      if (buttonText) body.buttonText = buttonText;
      const fc = choices.filter(Boolean);
      if (fc.length > 0) body.choices = fc;
    }

    setSending(true);
    try {
      const res = await fetch(`${baseUrl}/sender/simple`, {
        method: "POST", headers: getHeaders(), body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      toast.success(`Campanha simples criada! ${numberList.length} número(s) na fila.`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally { setSending(false); }
  };

  // ─── Advanced send ───
  const handleSendAdvanced = async () => {
    const validMessages = advMessages.filter((m) => m.number.trim());
    if (validMessages.length === 0) { toast.error("Adicione pelo menos uma mensagem com número"); return; }

    const baseUrl = getBaseUrl();
    const messages = validMessages.map((m) => {
      const clean = m.number.replace(/\D/g, "");
      const obj: Record<string, unknown> = {
        number: clean.includes("@") ? m.number.trim() : clean,
        type: m.type,
      };
      if (m.text) obj.text = m.text;
      if (m.file) obj.file = m.file;
      if (m.docName) obj.docName = m.docName;
      if (m.footerText) obj.footerText = m.footerText;
      if (m.buttonText) obj.buttonText = m.buttonText;
      if (m.listButton) obj.listButton = m.listButton;
      if (m.imageButton) obj.imageButton = m.imageButton;
      if (m.linkPreview) obj.linkPreview = true;
      const fc = (m.choices || []).filter(Boolean);
      if (fc.length > 0) obj.choices = fc;
      if (m.type === "contact") {
        if (m.fullName) obj.fullName = m.fullName;
        if (m.phoneNumber) obj.phoneNumber = m.phoneNumber;
        if (m.organization) obj.organization = m.organization;
        if (m.email) obj.email = m.email;
      }
      if (m.type === "location") {
        if (m.latitude) obj.latitude = m.latitude;
        if (m.longitude) obj.longitude = m.longitude;
        if (m.name) obj.name = m.name;
        if (m.address) obj.address = m.address;
      }
      return obj;
    });

    const body: Record<string, unknown> = {
      delayMin: parseInt(advDelayMin) || 3,
      delayMax: parseInt(advDelayMax) || 6,
      info: advInfo || "Envio avançado Bridge",
      scheduled_for: advScheduledFor ? advScheduledFor.getTime() : 1,
      messages,
    };

    setSending(true);
    try {
      const res = await fetch(`${baseUrl}/sender/advanced`, {
        method: "POST", headers: getHeaders(), body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      toast.success(`Envio avançado criado! ${messages.length} mensagem(ns) na fila.`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally { setSending(false); }
  };

  const showMediaField = ["image", "video", "audio", "ptt", "sticker", "document"].includes(messageType);
  const showContactFields = messageType === "contact";
  const showLocationFields = messageType === "location";
  const showChoiceFields = ["list", "button", "poll", "carousel"].includes(messageType);

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "scheduled": return "border-yellow-500/50 text-yellow-500";
      case "sending": return "border-blue-500/50 text-blue-500";
      case "paused": return "border-orange-500/50 text-orange-500";
      case "done": return "border-green-500/50 text-green-500";
      case "deleting": return "border-destructive/50 text-destructive";
      case "sent": return "border-green-500/50 text-green-500";
      case "failed": return "border-destructive/50 text-destructive";
      default: return "border-muted-foreground/50 text-muted-foreground";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-card-foreground flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Gerenciar Mensagens
          </DialogTitle>
          <DialogDescription>
            Crie campanhas de disparo para a instância <strong>{instance.instance_name}</strong>
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="simple" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="simple" className="flex-1">
              <Send className="h-4 w-4 mr-2" />
              Simples
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex-1">
              <Layers className="h-4 w-4 mr-2" />
              Avançado
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="flex-1">
              <ListChecks className="h-4 w-4 mr-2" />
              Campanhas
            </TabsTrigger>
          </TabsList>

          {/* ════════ SIMPLE TAB ════════ */}
          <TabsContent value="simple" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nome da Campanha</Label>
              <Input placeholder="Ex: Campanha Janeiro" value={folder} onChange={(e) => setFolder(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label>Números (um por linha ou separados por vírgula)</Label>
              <Textarea placeholder={"5511999999999\n5511888888888"} value={numbers} onChange={(e) => setNumbers(e.target.value)} className="bg-secondary border-border min-h-[80px]" />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Mensagem</Label>
              <Select value={messageType} onValueChange={setMessageType}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESSAGE_TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            {(messageType === "text" || showMediaField || showChoiceFields) && (
              <div className="space-y-2">
                <Label>Texto da Mensagem</Label>
                <Textarea placeholder="Digite sua mensagem..." value={text} onChange={(e) => setText(e.target.value)} className="bg-secondary border-border min-h-[100px]" />
              </div>
            )}
            {messageType === "text" && (
              <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg border border-border">
                <Label className="cursor-pointer">Preview de Link</Label>
                <Switch checked={linkPreview} onCheckedChange={setLinkPreview} />
              </div>
            )}
            {showMediaField && (
              <div className="space-y-2">
                <Label>URL do Arquivo</Label>
                <Input placeholder="https://exemplo.com/arquivo.jpg" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} className="bg-secondary border-border" />
                {messageType === "document" && (
                  <div className="space-y-2">
                    <Label>Nome do Documento</Label>
                    <Input placeholder="documento.pdf" value={docName} onChange={(e) => setDocName(e.target.value)} className="bg-secondary border-border" />
                  </div>
                )}
              </div>
            )}
            {showContactFields && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Nome Completo</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label>Telefone</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label>Organização</Label><Input value={contactOrg} onChange={(e) => setContactOrg(e.target.value)} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label>Email</Label><Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="bg-secondary border-border" /></div>
              </div>
            )}
            {showLocationFields && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Latitude</Label><Input value={latitude} onChange={(e) => setLatitude(e.target.value)} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label>Longitude</Label><Input value={longitude} onChange={(e) => setLongitude(e.target.value)} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label>Nome do Local</Label><Input value={locationName} onChange={(e) => setLocationName(e.target.value)} className="bg-secondary border-border" /></div>
                <div className="space-y-2"><Label>Endereço</Label><Input value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} className="bg-secondary border-border" /></div>
              </div>
            )}
            {showChoiceFields && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Texto do Rodapé</Label><Input value={footerText} onChange={(e) => setFooterText(e.target.value)} className="bg-secondary border-border" placeholder="Rodapé" /></div>
                  <div className="space-y-2"><Label>Texto do Botão</Label><Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} className="bg-secondary border-border" placeholder="Ver opções" /></div>
                </div>
                <Label>Opções</Label>
                {choices.map((choice, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={choice} onChange={(e) => handleChoiceChange(i, e.target.value)} placeholder={`Opção ${i + 1}`} className="bg-secondary border-border" />
                    {choices.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveChoice(i)} className="shrink-0 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={handleAddChoice} className="border-border"><Plus className="h-4 w-4 mr-1" /> Adicionar Opção</Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Delay Mínimo (seg)</Label><Input type="number" value={delayMin} onChange={(e) => setDelayMin(e.target.value)} className="bg-secondary border-border" /></div>
              <div className="space-y-2"><Label>Delay Máximo (seg)</Label><Input type="number" value={delayMax} onChange={(e) => setDelayMax(e.target.value)} className="bg-secondary border-border" /></div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />Agendar (opcional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal bg-secondary border-border", !scheduledFor && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduledFor ? format(scheduledFor, "PPP", { locale: ptBR }) : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={scheduledFor} onSelect={setScheduledFor} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={handleSendSimple} disabled={sending} className="w-full bg-primary hover:bg-primary/90">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Criar Campanha Simples
            </Button>
          </TabsContent>

          {/* ════════ ADVANCED TAB ════════ */}
          <TabsContent value="advanced" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Descrição do Envio</Label>
              <Input placeholder="Ex: Campanha de lançamento" value={advInfo} onChange={(e) => setAdvInfo(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Delay Mínimo (seg)</Label><Input type="number" value={advDelayMin} onChange={(e) => setAdvDelayMin(e.target.value)} className="bg-secondary border-border" /></div>
              <div className="space-y-2"><Label>Delay Máximo (seg)</Label><Input type="number" value={advDelayMax} onChange={(e) => setAdvDelayMax(e.target.value)} className="bg-secondary border-border" /></div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />Agendar (opcional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal bg-secondary border-border", !advScheduledFor && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {advScheduledFor ? format(advScheduledFor, "PPP", { locale: ptBR }) : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={advScheduledFor} onSelect={setAdvScheduledFor} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>

            {/* Messages list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Mensagens ({advMessages.length})</Label>
                <Button variant="outline" size="sm" onClick={addAdvMsg} className="border-border">
                  <Plus className="h-4 w-4 mr-1" /> Adicionar Mensagem
                </Button>
              </div>

              {advMessages.map((msg, idx) => {
                const showMsgMedia = ["image", "video", "audio", "ptt", "sticker", "document"].includes(msg.type);
                const showMsgChoices = ["list", "button", "poll", "carousel"].includes(msg.type);
                return (
                  <Card key={idx} className="bg-secondary/30 border-border/50">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Mensagem {idx + 1}</span>
                        {advMessages.length > 1 && (
                          <Button variant="ghost" size="icon" onClick={() => removeAdvMsg(idx)} className="h-7 w-7 text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Número</Label>
                          <Input placeholder="5511999999999" value={msg.number} onChange={(e) => updateAdvMsg(idx, { number: e.target.value })} className="bg-secondary border-border" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Tipo</Label>
                          <Select value={msg.type} onValueChange={(v) => updateAdvMsg(idx, { type: v })}>
                            <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {MESSAGE_TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {(msg.type === "text" || showMsgMedia || showMsgChoices) && (
                        <div className="space-y-2">
                          <Label className="text-xs">Texto</Label>
                          <Textarea placeholder="Mensagem..." value={msg.text || ""} onChange={(e) => updateAdvMsg(idx, { text: e.target.value })} className="bg-secondary border-border min-h-[60px]" />
                        </div>
                      )}
                      {showMsgMedia && (
                        <div className="space-y-2">
                          <Label className="text-xs">URL do Arquivo</Label>
                          <Input placeholder="https://..." value={msg.file || ""} onChange={(e) => updateAdvMsg(idx, { file: e.target.value })} className="bg-secondary border-border" />
                          {msg.type === "document" && (
                            <div className="space-y-2">
                              <Label className="text-xs">Nome do Documento</Label>
                              <Input placeholder="doc.pdf" value={msg.docName || ""} onChange={(e) => updateAdvMsg(idx, { docName: e.target.value })} className="bg-secondary border-border" />
                            </div>
                          )}
                        </div>
                      )}
                      {showMsgChoices && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Rodapé</Label>
                              <Input placeholder="Rodapé" value={msg.footerText || ""} onChange={(e) => updateAdvMsg(idx, { footerText: e.target.value })} className="bg-secondary border-border" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{msg.type === "list" ? "Botão da Lista" : "Texto do Botão"}</Label>
                              <Input
                                placeholder={msg.type === "list" ? "Ver Categorias" : "Ver opções"}
                                value={msg.type === "list" ? (msg.listButton || "") : (msg.buttonText || "")}
                                onChange={(e) => updateAdvMsg(idx, msg.type === "list" ? { listButton: e.target.value } : { buttonText: e.target.value })}
                                className="bg-secondary border-border"
                              />
                            </div>
                          </div>
                          {(msg.type === "button" || msg.type === "carousel") && (
                            <div className="space-y-1">
                              <Label className="text-xs">URL da Imagem do Botão</Label>
                              <Input placeholder="https://..." value={msg.imageButton || ""} onChange={(e) => updateAdvMsg(idx, { imageButton: e.target.value })} className="bg-secondary border-border" />
                            </div>
                          )}
                          <Label className="text-xs">Opções</Label>
                          {(msg.choices || [""]).map((c, ci) => (
                            <div key={ci} className="flex items-center gap-2">
                              <Input value={c} onChange={(e) => updateAdvChoice(idx, ci, e.target.value)} placeholder={`Opção ${ci + 1}`} className="bg-secondary border-border text-sm" />
                              {(msg.choices || []).length > 1 && (
                                <Button variant="ghost" size="icon" onClick={() => removeAdvChoice(idx, ci)} className="h-7 w-7 shrink-0 text-destructive"><Trash2 className="h-3 w-3" /></Button>
                              )}
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={() => addAdvChoice(idx)} className="border-border text-xs h-7">
                            <Plus className="h-3 w-3 mr-1" /> Opção
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Button onClick={handleSendAdvanced} disabled={sending} className="w-full bg-primary hover:bg-primary/90">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Layers className="h-4 w-4 mr-2" />}
              Criar Envio Avançado
            </Button>
          </TabsContent>

          {/* ════════ CAMPAIGNS TAB ════════ */}
          <TabsContent value="campaigns" className="space-y-4 mt-4">

            {/* ── List Folders ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-primary" /> Campanhas
                </h3>
                <div className="flex items-center gap-2">
                  <Select value={folderStatusFilter} onValueChange={setFolderStatusFilter}>
                    <SelectTrigger className="bg-secondary border-border h-8 w-[130px] text-xs">
                      <SelectValue placeholder="Todos status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="scheduled">Agendada</SelectItem>
                      <SelectItem value="sending">Enviando</SelectItem>
                      <SelectItem value="paused">Pausada</SelectItem>
                      <SelectItem value="done">Concluída</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={handleListFolders} disabled={loadingFolders} className="border-border h-8">
                    {loadingFolders ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    <span className="ml-1 text-xs">Carregar</span>
                  </Button>
                </div>
              </div>

              {folders.length > 0 && (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {folders.map((f, idx) => {
                    const fId = f.folder_id || f.id || `folder-${idx}`;
                    const isExpanded = expandedFolder === fId;
                    return (
                      <Card key={idx} className="bg-secondary/30 border-border/50">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="outline" className={cn("text-[10px] shrink-0", getStatusColor(f.status))}>
                                {f.status || "—"}
                              </Badge>
                              <span className="text-xs font-medium truncate">{f.info || fId}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost" size="icon" className="h-6 w-6"
                                onClick={() => { setCampaignFolderId(fId); }}
                                title="Usar ID para controle"
                              >
                                <Search className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-6 w-6"
                                onClick={() => {
                                  setMsgFolderId(fId);
                                  if (isExpanded) { setExpandedFolder(null); setCampaignMessages([]); }
                                  else handleListMessages(fId);
                                }}
                              >
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </Button>
                            </div>
                          </div>
                          <div className="flex gap-3 text-[10px] text-muted-foreground">
                            {f.total != null && <span>Total: {f.total}</span>}
                            {f.sent != null && <span>Enviadas: {f.sent}</span>}
                            {f.failed != null && <span>Falhas: {f.failed}</span>}
                            {f.scheduled != null && <span>Agendadas: {f.scheduled}</span>}
                          </div>
                          {/* Inline messages */}
                          {isExpanded && campaignMessages.length > 0 && (
                            <div className="mt-2 rounded border border-border overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow className="h-7">
                                    <TableHead className="text-[10px] px-2 py-1">Número</TableHead>
                                    <TableHead className="text-[10px] px-2 py-1">Tipo</TableHead>
                                    <TableHead className="text-[10px] px-2 py-1">Status</TableHead>
                                    <TableHead className="text-[10px] px-2 py-1">Texto</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {campaignMessages.map((cm, mi) => (
                                    <TableRow key={mi} className="h-7">
                                      <TableCell className="text-[10px] px-2 py-1 font-mono">{cm.number || "—"}</TableCell>
                                      <TableCell className="text-[10px] px-2 py-1">{cm.type || "—"}</TableCell>
                                      <TableCell className="text-[10px] px-2 py-1">
                                        <Badge variant="outline" className={cn("text-[9px]", getStatusColor(cm.status))}>{cm.status || "—"}</Badge>
                                      </TableCell>
                                      <TableCell className="text-[10px] px-2 py-1 max-w-[120px] truncate">{cm.text || "—"}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              {loadingMessages && <div className="p-2 text-center"><Loader2 className="h-3 w-3 animate-spin mx-auto" /></div>}
                            </div>
                          )}
                          {isExpanded && campaignMessages.length === 0 && !loadingMessages && (
                            <p className="text-[10px] text-muted-foreground text-center py-2">Nenhuma mensagem encontrada</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Campaign Control ── */}
            <div className="space-y-3 pt-2 border-t border-border">
              <h3 className="text-sm font-semibold text-card-foreground">Controlar Campanha</h3>
              <div className="space-y-2">
                <Label className="text-xs">ID da Campanha (folder_id)</Label>
                <Input placeholder="Ex: folder_123" value={campaignFolderId} onChange={(e) => setCampaignFolderId(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={campaignAction === "stop" ? "default" : "outline"}
                  onClick={() => setCampaignAction("stop")}
                  className={cn("border-border text-xs", campaignAction === "stop" && "bg-yellow-600 hover:bg-yellow-700 text-white")}
                  size="sm"
                >
                  <Pause className="h-3.5 w-3.5 mr-1" /> Pausar
                </Button>
                <Button
                  variant={campaignAction === "continue" ? "default" : "outline"}
                  onClick={() => setCampaignAction("continue")}
                  className={cn("border-border text-xs", campaignAction === "continue" && "bg-green-600 hover:bg-green-700 text-white")}
                  size="sm"
                >
                  <Play className="h-3.5 w-3.5 mr-1" /> Continuar
                </Button>
                <Button
                  variant={campaignAction === "delete" ? "default" : "outline"}
                  onClick={() => setCampaignAction("delete")}
                  className={cn("border-border text-xs", campaignAction === "delete" && "bg-destructive hover:bg-destructive/90 text-white")}
                  size="sm"
                >
                  <Trash className="h-3.5 w-3.5 mr-1" /> Deletar
                </Button>
              </div>
              <Button onClick={handleCampaignAction} disabled={executingAction || !campaignFolderId.trim()} className="w-full bg-primary hover:bg-primary/90" size="sm">
                {executingAction ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ListChecks className="h-4 w-4 mr-2" />}
                Executar Ação
              </Button>
            </div>

            {/* ── Cleanup ── */}
            <div className="space-y-3 pt-2 border-t border-border">
              <h3 className="text-sm font-semibold text-card-foreground">Limpeza</h3>

              {/* Clear done */}
              <Card className="bg-secondary/30 border-border/50">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-card-foreground">Limpar Enviadas</p>
                      <p className="text-[10px] text-muted-foreground">Remove mensagens já enviadas mais antigas que o período informado.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" placeholder="168" value={clearHours}
                      onChange={(e) => setClearHours(e.target.value)}
                      className="bg-secondary border-border w-24 h-8 text-xs"
                    />
                    <span className="text-[10px] text-muted-foreground">horas</span>
                    <Button variant="outline" size="sm" onClick={handleClearDone} disabled={clearingDone} className="border-border ml-auto h-8 text-xs">
                      {clearingDone ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
                      Limpar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Clear all */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 h-8 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                    Limpar Toda a Fila (irreversível)
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpar toda a fila?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação é <strong>irreversível</strong>. Todas as mensagens da fila de envio em massa serão removidas, incluindo pendentes e já enviadas.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAll} disabled={clearingAll} className="bg-destructive hover:bg-destructive/90">
                      {clearingAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Confirmar Limpeza
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
