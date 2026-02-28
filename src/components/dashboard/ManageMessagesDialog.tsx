import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { DialogBody } from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, Send, Clock, Plus, Trash2, Layers, CalendarIcon, ListChecks,
  Pause, Play, Trash, RefreshCw, Search, FolderOpen, AlertTriangle, ChevronDown, ChevronUp,
  Upload, Sparkles, ShieldCheck, Info, Scissors, Shield, Eye, MessageSquare, Maximize2, Minimize2,
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
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

interface ManageMessagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: Instance;
  allInstances?: Instance[];
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

// Dynamic field placeholders
const DYNAMIC_FIELDS = [
  { tag: "{{primeiro_nome}}", label: "Primeiro Nome" },
  { tag: "{{nome}}", label: "Nome Completo" },
  { tag: "{{sobrenome}}", label: "Sobrenome" },
  { tag: "{{telefone}}", label: "Telefone" },
];

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

// CSV contact data
interface CsvContact {
  phone: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
}

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

// ─── Parse inline "phone: name" format ───
function parseInlineContacts(raw: string): CsvContact[] | null {
  // Detect "phone: name" pattern — support comma-separated or one per line
  // First expand comma-separated entries: "5511...: João, 5511...: Maria" → separate entries
  const expanded: string[] = [];
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    // Split by comma, but only when followed by a digit (to avoid splitting names with commas)
    const parts = line.split(/,\s*(?=\d)/);
    expanded.push(...parts);
  }

  const colonEntries = expanded.filter((e) => /^\s*[\d+]+\s*:\s*.+/.test(e));
  if (colonEntries.length === 0) return null;

  return colonEntries.map((entry) => {
    const colonIdx = entry.indexOf(":");
    const phone = entry.slice(0, colonIdx).trim().replace(/\D/g, "");
    const fullName = entry.slice(colonIdx + 1).trim();
    const parts = fullName.split(/\s+/);
    return {
      phone,
      firstName: parts[0] || undefined,
      lastName: parts.slice(1).join(" ") || undefined,
      fullName: fullName || undefined,
    };
  });
}

// ─── CSV Parser ───
function parseCsv(content: string): CsvContact[] {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headerLine = lines[0].toLowerCase();
  const sep = headerLine.includes(";") ? ";" : ",";
  const headers = headerLine.split(sep).map((h) => h.trim().replace(/^["']|["']$/g, ""));

  // Find column indexes
  const phoneIdx = headers.findIndex((h) =>
    /^(phone|telefone|numero|número|celular|whatsapp|fone|tel)$/.test(h)
  );
  const firstNameIdx = headers.findIndex((h) =>
    /^(first_?name|primeiro_?nome|nome|name|primeiro)$/.test(h)
  );
  const lastNameIdx = headers.findIndex((h) =>
    /^(last_?name|sobrenome|surname|ultimo_?nome|último_?nome)$/.test(h)
  );
  const fullNameIdx = headers.findIndex((h) =>
    /^(full_?name|nome_?completo|nome_?inteiro)$/.test(h)
  );

  if (phoneIdx === -1) return [];

  const contacts: CsvContact[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const phone = cols[phoneIdx]?.replace(/\D/g, "");
    if (!phone) continue;
    contacts.push({
      phone,
      firstName: firstNameIdx >= 0 ? cols[firstNameIdx] : undefined,
      lastName: lastNameIdx >= 0 ? cols[lastNameIdx] : undefined,
      fullName: fullNameIdx >= 0 ? cols[fullNameIdx] : undefined,
    });
  }
  return contacts;
}

// ─── Replace dynamic fields in text ───
function replaceDynamicFields(text: string, contact: CsvContact): string {
  let result = text;
  const firstName = contact.firstName || contact.fullName?.split(" ")[0] || "";
  const lastName = contact.lastName || (contact.fullName?.split(" ").slice(1).join(" ")) || "";
  const fullName = contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "";
  result = result.replace(/\{\{primeiro_nome\}\}/gi, firstName);
  result = result.replace(/\{\{nome\}\}/gi, fullName);
  result = result.replace(/\{\{sobrenome\}\}/gi, lastName);
  result = result.replace(/\{\{telefone\}\}/gi, contact.phone);
  return result;
}

// ─── Check if text has dynamic fields ───
function hasDynamicFields(text: string): boolean {
  return /\{\{(primeiro_nome|nome|sobrenome|telefone)\}\}/i.test(text);
}

// ─── Anti-ban: add random invisible chars ───
function applyAntiBan(text: string, addInvisibleChars: boolean, addRandomEmoji: boolean): string {
  let result = text;
  if (addInvisibleChars) {
    // Insert zero-width spaces at random positions to make each message unique
    const chars = ["\u200B", "\u200C", "\u200D", "\uFEFF"];
    const words = result.split(" ");
    result = words
      .map((w) => {
        if (Math.random() > 0.6) {
          const ch = chars[Math.floor(Math.random() * chars.length)];
          return w + ch;
        }
        return w;
      })
      .join(" ");
  }
  if (addRandomEmoji) {
    // Small random variations in spacing
    if (Math.random() > 0.5) result = result + " ";
    if (Math.random() > 0.7) result = "\n" + result;
  }
  return result;
}

// ─── Split messages by triple line break ───
function splitMessageByTripleBreak(text: string): string[] {
  if (!text) return [text];
  const parts = text.split(/\n\s*\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

export function ManageMessagesDialog({ open, onOpenChange, instance, allInstances }: ManageMessagesDialogProps) {
  const { settings } = useSettings();
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState("simple");
  const csvInputRef = useRef<HTMLInputElement>(null);

  // ─── CSV contacts ───
  const [csvContacts, setCsvContacts] = useState<CsvContact[]>([]);
  const [csvFileName, setCsvFileName] = useState("");

  // ─── AI Variations ───
  const [generatingVariations, setGeneratingVariations] = useState(false);
  const [aiVariations, setAiVariations] = useState<string[]>([]);
  const [selectedVariationIndexes, setSelectedVariationIndexes] = useState<number[]>([]);
  const [variationCount, setVariationCount] = useState(5);
  const [useVariations, setUseVariations] = useState(false);

  // ─── Anti-Ban ───
  const [antiBanEnabled, setAntiBanEnabled] = useState(false);
  const [addInvisibleChars, setAddInvisibleChars] = useState(true);
  const [addRandomSpacing, setAddRandomSpacing] = useState(false);
  const [splitMessages, setSplitMessages] = useState(false);
  const [splitDelay, setSplitDelay] = useState("2");
  const [antiBanButton, setAntiBanButton] = useState(false);
  const [antiBanBtnTitle, setAntiBanBtnTitle] = useState("Comunicação Oficial");
  const [antiBanBtnFooter, setAntiBanBtnFooter] = useState("Responda para confirmar");
  const [antiBanBtnMessage, setAntiBanBtnMessage] = useState("Deseja continuar recebendo nossas mensagens?");
  const [antiBanBtnOption1, setAntiBanBtnOption1] = useState("Sim, quero receber");
  const [antiBanBtnOption2, setAntiBanBtnOption2] = useState("Não, obrigado");
  const [batchSize, setBatchSize] = useState("50");
  const [batchPauseMin, setBatchPauseMin] = useState("60");
  const [batchPauseMax, setBatchPauseMax] = useState("120");

  // ─── Round-robin multi-instance ───
  const [useRoundRobin, setUseRoundRobin] = useState(false);
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>([]);
  const [siblingInstances, setSiblingInstances] = useState<Instance[]>([]);

  useEffect(() => {
    if (!open) return;
    if (allInstances && allInstances.length > 0) {
      setSiblingInstances(allInstances.filter(
        (i) => i.id !== instance.id && i.instance_status === "connected"
      ));
    } else if (instance.subaccount_id) {
      supabase
        .from("instances")
        .select("*")
        .eq("subaccount_id", instance.subaccount_id)
        .eq("instance_status", "connected")
        .neq("id", instance.id)
        .order("instance_name")
        .then(({ data }) => {
          if (data) setSiblingInstances(data as Instance[]);
        });
    }
  }, [open, instance.id, instance.subaccount_id, allInstances]);

  useEffect(() => {
    if (!open) {
      setUseRoundRobin(false);
      setSelectedInstanceIds([]);
      setCsvContacts([]);
      setCsvFileName("");
      setAiVariations([]);
      setSelectedVariationIndexes([]);
      setUseVariations(false);
    }
  }, [open]);

  const toggleInstanceSelection = (id: string) => {
    setSelectedInstanceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const getRoundRobinInstances = (): Instance[] => {
    if (!useRoundRobin || selectedInstanceIds.length === 0) return [instance];
    const selected = siblingInstances.filter((i) => selectedInstanceIds.includes(i.id));
    return [instance, ...selected];
  };

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
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDays, setScheduleDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [scheduleTimeRestrict, setScheduleTimeRestrict] = useState(false);
  const [scheduleTimeStart, setScheduleTimeStart] = useState("08:00");
  const [scheduleTimeEnd, setScheduleTimeEnd] = useState("18:00");
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
  const [advScheduleEnabled, setAdvScheduleEnabled] = useState(false);
  const [advScheduleDays, setAdvScheduleDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [advScheduleTimeRestrict, setAdvScheduleTimeRestrict] = useState(false);
  const [advScheduleTimeStart, setAdvScheduleTimeStart] = useState("08:00");
  const [advScheduleTimeEnd, setAdvScheduleTimeEnd] = useState("18:00");
  const [advMessages, setAdvMessages] = useState<AdvancedMessage[]>([emptyAdvancedMsg()]);

  // ─── Campaign control fields ───
  const [campaignFolderId, setCampaignFolderId] = useState("");
  const [campaignAction, setCampaignAction] = useState<"stop" | "continue" | "delete">("stop");
  const [executingAction, setExecutingAction] = useState(false);
  const [folders, setFolders] = useState<CampaignFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderStatusFilter, setFolderStatusFilter] = useState("");
  const [folderSearch, setFolderSearch] = useState("");
  const [msgFolderId, setMsgFolderId] = useState("");
  const [msgStatusFilter, setMsgStatusFilter] = useState("");
  const [msgPage, setMsgPage] = useState(1);
  const [msgPageSize, setMsgPageSize] = useState(10);
  const [campaignMessages, setCampaignMessages] = useState<CampaignMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [fullscreenCampaign, setFullscreenCampaign] = useState<any | null>(null);
  const [fullscreenMessages, setFullscreenMessages] = useState<CampaignMessage[]>([]);
  const [loadingFullscreen, setLoadingFullscreen] = useState(false);
  const [fsPage, setFsPage] = useState(1);
  const [clearHours, setClearHours] = useState("168");
  const [clearingDone, setClearingDone] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const getBaseUrl = () => getBaseUrlForInstance(instance, settings?.uazapi_base_url);
  const getHeaders = () => ({ "Content-Type": "application/json", Accept: "application/json", token: instance.uazapi_instance_token });
  const getBaseUrlFor = (inst: Instance) => getBaseUrlForInstance(inst, settings?.uazapi_base_url);
  const getHeadersFor = (inst: Instance) => ({ "Content-Type": "application/json", Accept: "application/json", token: inst.uazapi_instance_token });

  // ─── CSV Upload Handler ───
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const contacts = parseCsv(content);
      if (contacts.length === 0) {
        toast.error("CSV inválido. Certifique-se de ter uma coluna 'phone' ou 'telefone'.");
        return;
      }
      setCsvContacts(contacts);
      // Populate numbers field
      const phonesText = contacts.map((c) => c.phone).join("\n");
      setNumbers(phonesText);
      const hasNames = contacts.some((c) => c.firstName || c.fullName);
      toast.success(`${contacts.length} contatos importados!${hasNames ? " Campos dinâmicos disponíveis." : ""}`);
    };
    reader.readAsText(file);
    // Reset input
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  // ─── Insert dynamic field into textarea ───
  const insertDynamicField = (tag: string, textareaId: string) => {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    if (!textarea) {
      setText((prev) => prev + tag);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;
    const newText = currentText.substring(0, start) + tag + currentText.substring(end);
    setText(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + tag.length;
    }, 0);
  };

  // ─── AI Variation Generation ───
  const handleGenerateVariations = async () => {
    if (!text.trim()) { toast.error("Digite uma mensagem primeiro"); return; }
    setGeneratingVariations(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-message-variations", {
        body: { message: text, count: variationCount },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const variations = data?.variations || [];
      if (variations.length === 0) throw new Error("Nenhuma variação gerada");
      setAiVariations(variations);
      setSelectedVariationIndexes(variations.map((_: string, i: number) => i)); // select all by default
      setUseVariations(true);
      toast.success(`${variations.length} variações geradas! Todas selecionadas.`);
    } catch (err: any) {
      toast.error(`Erro ao gerar variações: ${err.message}`);
    } finally {
      setGeneratingVariations(false);
    }
  };

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
      if (folders.length > 0) handleListFolders();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally { setExecutingAction(false); }
  };

  const handleListFolders = async () => {
    setLoadingFolders(true);
    try {
      const url = new URL(`${getBaseUrl()}/sender/listfolders`);
      if (folderStatusFilter) url.searchParams.set("status", folderStatusFilter);
      const res = await fetch(url.toString(), { method: "GET", headers: getHeaders() });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.folders || data.data || []);
      setFolders(list);
      if (list.length === 0) toast.info("Nenhuma campanha encontrada");
    } catch (err: any) {
      toast.error(`Erro ao listar campanhas: ${err.message}`);
    } finally { setLoadingFolders(false); }
  };

  const normalizeMessages = (rawList: Record<string, unknown>[]): CampaignMessage[] => {
    return rawList.map((item: Record<string, unknown>) => {
      const extractPhone = (val: unknown): string => {
        if (!val) return "";
        const s = String(val);
        return s.split("@")[0].replace(/\D/g, "");
      };
      const phone = extractPhone(item.chatid) || extractPhone(item.chatId) || extractPhone(item.number) || extractPhone(item.phone) || extractPhone(item.to) || extractPhone(item.recipient) || extractPhone(item.jid) || extractPhone(item.chat_id) || extractPhone(item.remoteJid) || "";
      let name = String(item.name || item.contactName || item.contact_name || item.recipientName || item.recipient_name || "");
      if (!name && item.send_payload) {
        try {
          const sp = typeof item.send_payload === "string" ? JSON.parse(item.send_payload as string) : item.send_payload;
          name = String(sp?.name || sp?.contactName || sp?.firstName || sp?.first_name || "");
        } catch { /* ignore */ }
      }
      if (!name && phone) {
        try {
          const stored: Record<string, string> = JSON.parse(localStorage.getItem("campaign_phone_names") || "{}");
          name = stored[phone] || "";
        } catch { /* ignore */ }
      }
      let msgText = "";
      if (item.send_payload) {
        try {
          const payload = typeof item.send_payload === "string" ? JSON.parse(item.send_payload as string) : item.send_payload;
          msgText = String(payload?.text || payload?.message || payload?.body || "");
        } catch { /* ignore parse errors */ }
      }
      if (!msgText) msgText = String(item.text || item.message || item.body || "");
      if (!msgText && item.content) {
        try {
          const cont = typeof item.content === "string" ? JSON.parse(item.content as string) : item.content;
          msgText = String(cont?.text || cont?.message || "");
        } catch { msgText = String(item.content || ""); }
      }
      msgText = msgText.replace(/[\u200B\u200C\u200D\uFEFF]/g, "").replace(/\s{2,}/g, " ").trim();
      return {
        ...item,
        number: phone,
        name,
        type: String(item.type || item.messageType || item.message_type || item.kind || item.send_function || ""),
        status: String(item.status || item.messageStatus || item.message_status || item.state || ""),
        text: msgText,
      } as CampaignMessage;
    });
  };

  const handleListMessages = async (folderId?: string) => {
    const id = folderId || msgFolderId;
    if (!id.trim()) { toast.error("Informe o ID da campanha"); return; }
    setLoadingMessages(true);
    try {
      // Fetch main campaign messages
      const body: Record<string, unknown> = { folder_id: id.trim() };
      if (msgStatusFilter) body.messageStatus = msgStatusFilter;
      body.page = msgPage;
      body.pageSize = msgPageSize;
      const res = await fetch(`${getBaseUrl()}/sender/listmessages`, {
        method: "POST", headers: getHeaders(), body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      const data = await res.json();
      const rawList = Array.isArray(data) ? data : (data.messages || data.data || data.items || data.results || []);
      const list: CampaignMessage[] = normalizeMessages(rawList);

      // Find the campaign name to locate continuation waves (⏩)
      const mainFolder = folders.find((f) => (f.folder_id || f.id) === id.trim());
      const mainInfo = String(mainFolder?.info || mainFolder?.folder_name || mainFolder?.name || "");

      // Fetch continuation campaigns (⏩) and merge their messages
      const continuationFolders = folders.filter((f) => {
        const info = String(f.info || f.folder_name || f.name || "");
        return info.includes("⏩") && mainInfo && info.startsWith(mainInfo.split(" ⏩")[0]);
      });

      // Tag messages from continuation folders so they always merge
      const continuationMessages: CampaignMessage[] = [];
      if (continuationFolders.length > 0) {
        const contResults = await Promise.allSettled(
          continuationFolders.map(async (cf) => {
            const cfId = cf.folder_id || cf.id;
            const cfRes = await fetch(`${getBaseUrl()}/sender/listmessages`, {
              method: "POST", headers: getHeaders(),
              body: JSON.stringify({ folder_id: cfId, page: 1, pageSize: 1000 }),
            });
            if (!cfRes.ok) return [];
            const cfData = await cfRes.json();
            const cfRaw = Array.isArray(cfData) ? cfData : (cfData.messages || cfData.data || cfData.items || cfData.results || []);
            return normalizeMessages(cfRaw);
          })
        );
        for (const r of contResults) {
          if (r.status === "fulfilled") continuationMessages.push(...r.value);
        }
      }

      // Merge split parts into main message per contact, filter anti-ban buttons
      const merged: CampaignMessage[] = [];
      const mainByNumber: Record<string, CampaignMessage> = {};

      // Helper to check if message is a button type
      const isButtonMsg = (msg: CampaignMessage) => {
        const msgType = String(msg.type || "").toLowerCase();
        if (msgType === "button") return true;
        try {
          const raw = (msg as any).send_payload || (msg as any).sendPayload;
          if (raw) {
            const sp = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (sp?.type === "button" || sp?.messageType === "button" || sp?.buttonText || sp?.choices) return true;
          }
        } catch { /* ignore */ }
        return false;
      };

      // First pass: process main campaign messages
      for (const msg of list) {
        if (isButtonMsg(msg)) continue;
        const num = String(msg.number || (msg as any).chatid || "");
        merged.push(msg);
        if (num) mainByNumber[num] = msg;
      }

      // Second pass: merge ALL continuation messages into main entries
      for (const msg of continuationMessages) {
        if (isButtonMsg(msg)) continue;
        const num = String(msg.number || (msg as any).chatid || "");
        if (num && mainByNumber[num]) {
          if (msg.text) mainByNumber[num].text = (mainByNumber[num].text || "") + "\n\n" + msg.text;
        } else {
          // No main entry found, add as standalone
          merged.push(msg);
          if (num) mainByNumber[num] = msg;
        }
      }
      setCampaignMessages(merged);
      setExpandedFolder(id.trim());
      if (merged.length === 0) toast.info("Nenhuma mensagem encontrada");
    } catch (err: any) {
      toast.error(`Erro ao listar mensagens: ${err.message}`);
    } finally { setLoadingMessages(false); }
  };

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

  const handleClearAll = async () => {
    setClearingAll(true);
    try {
      const res = await fetch(`${getBaseUrl()}/sender/clearall`, {
        method: "DELETE", headers: getHeaders(),
      });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      toast.success("Toda a fila de mensagens foi limpa!");
      setFolders([]); setCampaignMessages([]);
      // Reload folders to confirm clearing
      setTimeout(() => handleListFolders(), 1000);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally { setClearingAll(false); }
  };

  const handleAddChoice = () => setChoices([...choices, ""]);
  const handleRemoveChoice = (index: number) => setChoices(choices.filter((_, i) => i !== index));
  const handleChoiceChange = (index: number, value: string) => {
    const updated = [...choices]; updated[index] = value; setChoices(updated);
  };

  const updateAdvMsg = (index: number, patch: Partial<AdvancedMessage>) => {
    setAdvMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };
  const addAdvMsg = () => setAdvMessages((prev) => [...prev, emptyAdvancedMsg()]);
  const removeAdvMsg = (index: number) => setAdvMessages((prev) => prev.filter((_, i) => i !== index));
  const updateAdvChoice = (msgIdx: number, choiceIdx: number, value: string) => {
    setAdvMessages((prev) =>
      prev.map((m, i) => {
        if (i !== msgIdx) return m;
        const c = [...(m.choices || [""])]; c[choiceIdx] = value;
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

  // ─── Schedule Section Renderer ───
  const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const renderScheduleSection = (
    enabled: boolean, setEnabled: (v: boolean) => void,
    date: Date | undefined, setDate: (v: Date | undefined) => void,
    days: number[], setDays: (v: number[]) => void,
    timeRestrict: boolean, setTimeRestrict: (v: boolean) => void,
    timeStart: string, setTimeStart: (v: string) => void,
    timeEnd: string, setTimeEnd: (v: string) => void,
  ) => {
    const toggleDay = (d: number) => setDays(days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort());
    const setPreset = (preset: "weekdays" | "all" | "weekend") => {
      if (preset === "weekdays") setDays([1, 2, 3, 4, 5]);
      else if (preset === "all") setDays([0, 1, 2, 3, 4, 5, 6]);
      else setDays([0, 6]);
    };
    const buildSummary = () => {
      const parts: string[] = [];
      if (date) parts.push(format(date, "dd/MM/yyyy HH:mm"));
      else parts.push("Início manual");
      if (days.length === 7) parts.push("Todos os dias");
      else if (days.length > 0) parts.push(days.map(d => DAY_LABELS[d]).join(", "));
      if (timeRestrict) parts.push(`${timeStart} às ${timeEnd}`);
      return parts.join(" • ");
    };

    return (
      <Card className="bg-secondary/30 border-border/50">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4 text-primary" /> Agendamento
            </Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Configure quando a campanha será executada</p>

              {/* Date/Time */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" /> Data/Hora de Início (opcional)
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="datetime-local"
                    value={date ? format(date, "yyyy-MM-dd'T'HH:mm") : ""}
                    onChange={(e) => setDate(e.target.value ? new Date(e.target.value) : undefined)}
                    className="flex-1 bg-secondary border-border text-sm"
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0 bg-secondary border-border">
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
                <p className="text-[10px] text-muted-foreground">Deixe vazio para iniciar manualmente</p>
              </div>

              {/* Allowed Days */}
              <div className="space-y-2">
                <Label className="text-xs">Dias Permitidos</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {DAY_LABELS.map((label, idx) => (
                    <Button
                      key={idx}
                      type="button"
                      size="sm"
                      variant={days.includes(idx) ? "default" : "outline"}
                      className={cn("h-8 w-10 text-xs p-0", days.includes(idx) ? "bg-primary hover:bg-primary/90" : "border-border")}
                      onClick={() => toggleDay(idx)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2 text-[10px]">
                  <button type="button" className="text-muted-foreground hover:text-foreground underline" onClick={() => setPreset("weekdays")}>Dias úteis</button>
                  <span className="text-muted-foreground">•</span>
                  <button type="button" className="text-muted-foreground hover:text-foreground underline" onClick={() => setPreset("all")}>Todos os dias</button>
                  <span className="text-muted-foreground">•</span>
                  <button type="button" className="text-muted-foreground hover:text-foreground underline" onClick={() => setPreset("weekend")}>Só final de semana</button>
                </div>
              </div>

              {/* Time Restriction */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-xs">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Restringir Horário
                  </Label>
                  <Switch checked={timeRestrict} onCheckedChange={setTimeRestrict} />
                </div>
                {timeRestrict && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Início</Label>
                      <Input type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} className="bg-secondary border-border text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Fim</Label>
                      <Input type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} className="bg-secondary border-border text-sm" />
                    </div>
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 border border-primary/20">
                <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] text-primary">Resumo: {buildSummary()}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // ─── Build schedule params helper ───
  const buildScheduleParams = (
    enabled: boolean, date: Date | undefined, days: number[],
    timeRestrict: boolean, timeStart: string, timeEnd: string
  ) => {
    const params: Record<string, unknown> = {};
    if (enabled) {
      params.scheduled_for = date ? date.getTime() : 0;
      if (days.length < 7) params.allowed_days = days;
      if (timeRestrict) {
        params.time_start = timeStart;
        params.time_end = timeEnd;
      }
    }
    return params;
  };

  const buildSimpleBody = (numberList: string[]) => {
    const body: Record<string, unknown> = {
      numbers: numberList,
      type: messageType,
      folder: folder || "Campanha Bridge",
      delayMin: parseInt(delayMin) || 10,
      delayMax: parseInt(delayMax) || 30,
      scheduled_for: scheduleEnabled && scheduledFor ? scheduledFor.getTime() : 0,
      ...buildScheduleParams(scheduleEnabled, scheduledFor, scheduleDays, scheduleTimeRestrict, scheduleTimeStart, scheduleTimeEnd),
    };
    // split_messages is now handled client-side via triple line breaks
    // Note: anti_ban_button is handled separately by converting to advanced mode
    // with a second button-type message per contact (see handleSendSimple)
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
    return body;
  };

  // ─── Get active variations (selected ones only) ───
  const getActiveVariations = (): string[] => {
    if (!useVariations || aiVariations.length === 0 || selectedVariationIndexes.length === 0) return [];
    return selectedVariationIndexes.map((i) => aiVariations[i]).filter(Boolean);
  };

  // ─── Determine if we need per-contact messages (dynamic fields or AI variations) ───
  const needsPerContactMessages = (): boolean => {
    return (hasDynamicFields(text) && csvContacts.length > 0) || (useVariations && getActiveVariations().length > 0);
  };

  // ─── Simple send (with round-robin, dynamic fields, AI variations, anti-ban) ───
  const handleSendSimple = async () => {
    // Parse numbers — support "phone: name" inline format and plain numbers
    const rawEntries = numbers.split(/[\n]+/).flatMap((line) => line.split(/,\s*(?=\d)/)).map((n) => n.trim()).filter(Boolean);
    const numberList = rawEntries
      .map((entry) => {
        const colonIdx = entry.indexOf(":");
        const raw = colonIdx >= 0 ? entry.slice(0, colonIdx).trim() : entry.trim();
        const clean = raw.replace(/\D/g, "");
        return clean ? `${clean}@s.whatsapp.net` : "";
      })
      .filter(Boolean);

    if (numberList.length === 0) { toast.error("Adicione pelo menos um número"); return; }
    if (messageType === "text" && !text.trim()) { toast.error("Digite a mensagem"); return; }

    const instances = getRoundRobinInstances();
    setSending(true);

    try {
      const perContact = needsPerContactMessages();

      if (perContact) {
        // Convert to advanced mode: one message per contact with personalized text
        const contactMap = new Map<string, CsvContact>();
        csvContacts.forEach((c) => {
          contactMap.set(`${c.phone}@s.whatsapp.net`, c);
          contactMap.set(c.phone, c);
        });

        let messages: Record<string, unknown>[] = numberList.map((num, idx) => {
          const contact = contactMap.get(num) || contactMap.get(num.replace("@s.whatsapp.net", "")) || { phone: num.replace("@s.whatsapp.net", "") };
          let msgText = text;

          // Apply dynamic fields
          if (hasDynamicFields(text) && csvContacts.length > 0) {
            msgText = replaceDynamicFields(msgText, contact);
          }

          // Apply AI variations (rotate through selected variations)
          const activeVars = getActiveVariations();
          if (useVariations && activeVars.length > 0) {
            msgText = replaceDynamicFields(activeVars[idx % activeVars.length], contact);
          }

          // Apply anti-ban
          if (antiBanEnabled) {
            msgText = applyAntiBan(msgText, addInvisibleChars, addRandomSpacing);
          }

          const obj: Record<string, unknown> = {
            number: num.replace("@s.whatsapp.net", ""),
            type: messageType,
          };
          if (msgText) obj.text = msgText;
          if (fileUrl) obj.file = fileUrl;
          if (docName) obj.docName = docName;
          if (linkPreview) obj.linkPreview = true;
          // Include contact name so it's stored in send_payload for history
          const cName = (contact as CsvContact).firstName || (contact as CsvContact).fullName || "";
          if (cName) obj.contactName = cName;
          return obj;
        });

        // If split messages is enabled, organize into waves (wave 0 = part 1 of all contacts, wave 1 = part 2, etc.)
        // Each wave is sent as a separate API call with a real sleep between them
        if (splitMessages) {
          // Build per-contact parts
          const contactWaves: Record<string, unknown>[][] = []; // waves[waveIdx] = array of messages
          let maxParts = 1;
          const perContactParts: { parts: Record<string, unknown>[]; }[] = [];

          for (const msg of messages) {
            const msgText = (msg.text as string) || "";
            const parts = splitMessageByTripleBreak(msgText);
            const built: Record<string, unknown>[] = [];
            for (let i = 0; i < parts.length; i++) {
              const part: Record<string, unknown> = { ...msg, text: parts[i] };
              if (i > 0) { delete part.file; delete part.docName; part.splitPart = true; }
              built.push(part);
            }
            perContactParts.push({ parts: built });
            if (parts.length > maxParts) maxParts = parts.length;
          }

          // Add anti-ban button as an extra wave after the last part
          const addBtnWave = antiBanEnabled && antiBanButton;
          const totalWaves = maxParts + (addBtnWave ? 1 : 0);

          for (let w = 0; w < totalWaves; w++) {
            const wave: Record<string, unknown>[] = [];
            for (const contact of perContactParts) {
              if (w < contact.parts.length) {
                wave.push(contact.parts[w]);
              } else if (w === maxParts && addBtnWave) {
                // Anti-ban button wave
                wave.push({
                  number: contact.parts[0].number,
                  type: "button",
                  text: antiBanBtnMessage,
                  footerText: antiBanBtnFooter,
                  buttonText: antiBanBtnTitle,
                  choices: [antiBanBtnOption1, antiBanBtnOption2].filter(Boolean),
                  splitPart: true,
                });
              }
            }
            if (wave.length > 0) contactWaves.push(wave);
          }

          // Send each wave as a separate API call with real sleep between them.
          // First wave uses the campaign name; subsequent waves are marked with ⏩ to be hidden in history.
          const splitDelayMs = (parseInt(splitDelay) || 2) * 1000;
          const campaignInfo = folder || "Campanha Bridge";

          const sendWave = async (inst: Instance, msgs: Record<string, unknown>[], waveIdx: number) => {
            const body: Record<string, unknown> = {
              delayMin: parseInt(delayMin) || 10,
              delayMax: parseInt(delayMax) || 30,
              info: waveIdx === 0 ? campaignInfo : `${campaignInfo} ⏩${waveIdx + 1}`,
              scheduled_for: scheduleEnabled && scheduledFor ? scheduledFor.getTime() : 1,
              ...buildScheduleParams(scheduleEnabled, scheduledFor, scheduleDays, scheduleTimeRestrict, scheduleTimeStart, scheduleTimeEnd),
              messages: msgs,
            };
            const res = await fetch(`${getBaseUrlFor(inst)}/sender/advanced`, {
              method: "POST", headers: getHeadersFor(inst), body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
          };

          if (instances.length === 1) {
            for (let w = 0; w < contactWaves.length; w++) {
              if (w > 0) await new Promise((r) => setTimeout(r, splitDelayMs));
              await sendWave(instances[0], contactWaves[w], w);
            }
            toast.success(`Campanha enviada com ${contactWaves.length} parte(s)! ${numberList.length} contato(s).`);
          } else {
            // Round-robin per wave
            for (let w = 0; w < contactWaves.length; w++) {
              if (w > 0) await new Promise((r) => setTimeout(r, splitDelayMs));
              const waveMsgs = contactWaves[w];
              const buckets: Record<string, unknown>[][] = instances.map(() => []);
              waveMsgs.forEach((msg, idx) => { buckets[idx % instances.length].push(msg); });
              await Promise.allSettled(
                instances.map((inst, idx) => {
                  if (buckets[idx].length === 0) return Promise.resolve();
                  return sendWave(inst, buckets[idx], w);
                })
              );
            }
            toast.success(`Campanha round-robin com ${contactWaves.length} parte(s)! ${numberList.length} contato(s).`);
          }
          // Redirect to campaigns tab and reload folders
          setActiveTab("campaigns");
          setTimeout(() => { const el = document.querySelector('[data-dialog-body]'); el?.scrollTo({ top: 0, behavior: "smooth" }); handleListFolders(); }, 500);
          setSending(false);
          return;
        }

        // If anti-ban button is enabled (no split), add button messages
        if (antiBanEnabled && antiBanButton) {
          const withButtons: Record<string, unknown>[] = [];
          for (const msg of messages) {
            withButtons.push(msg);
            const btnMsg: Record<string, unknown> = {
              number: msg.number,
              type: "button",
              text: antiBanBtnMessage,
              footerText: antiBanBtnFooter,
              buttonText: antiBanBtnTitle,
              choices: [antiBanBtnOption1, antiBanBtnOption2].filter(Boolean),
            };
            withButtons.push(btnMsg);
          }
          messages = withButtons;
        }

        // Send as advanced (no split)
        if (instances.length === 1) {
          const body: Record<string, unknown> = {
            delayMin: parseInt(delayMin) || 10,
            delayMax: parseInt(delayMax) || 30,
            info: folder || "Campanha Bridge",
            scheduled_for: scheduleEnabled && scheduledFor ? scheduledFor.getTime() : 1,
            ...buildScheduleParams(scheduleEnabled, scheduledFor, scheduleDays, scheduleTimeRestrict, scheduleTimeStart, scheduleTimeEnd),
            messages,
          };
          const res = await fetch(`${getBaseUrlFor(instances[0])}/sender/advanced`, {
            method: "POST", headers: getHeadersFor(instances[0]), body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
          toast.success(`Campanha personalizada criada! ${messages.length} mensagem(ns) na fila.`);
        } else {
          // Round-robin distribution
          const buckets: Record<string, unknown>[][] = instances.map(() => []);
          messages.forEach((msg, idx) => { buckets[idx % instances.length].push(msg); });

          const results = await Promise.allSettled(
            instances.map((inst, idx) => {
              if (buckets[idx].length === 0) return Promise.resolve();
              const body: Record<string, unknown> = {
                delayMin: parseInt(delayMin) || 10,
                delayMax: parseInt(delayMax) || 30,
                info: `${folder || "Campanha Bridge"} (${inst.instance_name})`,
                scheduled_for: scheduleEnabled && scheduledFor ? scheduledFor.getTime() : 1,
                ...buildScheduleParams(scheduleEnabled, scheduledFor, scheduleDays, scheduleTimeRestrict, scheduleTimeStart, scheduleTimeEnd),
                messages: buckets[idx],
              };
              return fetch(`${getBaseUrlFor(inst)}/sender/advanced`, {
                method: "POST", headers: getHeadersFor(inst), body: JSON.stringify(body),
              }).then(async (res) => { if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`); });
            })
          );
          const succeeded = results.filter((r) => r.status === "fulfilled").length;
          const failed = results.filter((r) => r.status === "rejected").length;
          if (failed > 0) toast.warning(`${succeeded} instância(s) OK, ${failed} falharam.`);
          else toast.success(`Round-robin personalizado! ${messages.length} msgs em ${instances.length} instâncias.`);
        }
      } else if (antiBanEnabled && antiBanButton) {
        // Anti-ban button active: use advanced mode to send 2 messages per contact
        // (original message + button message)
        let bodyText = text;
        if (antiBanEnabled) {
          bodyText = applyAntiBan(bodyText, addInvisibleChars, addRandomSpacing);
        }

        const advMessages: Record<string, unknown>[] = [];
        for (const num of numberList) {
          const cleanNum = num.replace("@s.whatsapp.net", "");
          // Original message
          const mainMsg: Record<string, unknown> = { number: cleanNum, type: messageType };
          if (bodyText) mainMsg.text = bodyText;
          if (fileUrl) mainMsg.file = fileUrl;
          if (docName) mainMsg.docName = docName;
          if (linkPreview) mainMsg.linkPreview = true;
          advMessages.push(mainMsg);

          // Anti-ban button message
          const btnMsg: Record<string, unknown> = {
            number: cleanNum,
            type: "button",
            text: antiBanBtnMessage,
            footerText: antiBanBtnFooter,
            buttonText: antiBanBtnTitle,
            choices: [antiBanBtnOption1, antiBanBtnOption2].filter(Boolean),
          };
          advMessages.push(btnMsg);
        }

        const sendAdvanced = async (inst: Instance, msgs: Record<string, unknown>[]) => {
          const body: Record<string, unknown> = {
            delayMin: parseInt(delayMin) || 10,
            delayMax: parseInt(delayMax) || 30,
            info: folder || "Campanha Bridge",
            scheduled_for: scheduleEnabled && scheduledFor ? scheduledFor.getTime() : 1,
            ...buildScheduleParams(scheduleEnabled, scheduledFor, scheduleDays, scheduleTimeRestrict, scheduleTimeStart, scheduleTimeEnd),
            messages: msgs,
          };
          // split_messages is now handled client-side
          const res = await fetch(`${getBaseUrlFor(inst)}/sender/advanced`, {
            method: "POST", headers: getHeadersFor(inst), body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
        };

        if (instances.length === 1) {
          await sendAdvanced(instances[0], advMessages);
          toast.success(`Campanha com botão anti-ban criada! ${numberList.length} contato(s).`);
        } else {
          // Round-robin: distribute pairs (main+button) together
          const pairs: Record<string, unknown>[][] = instances.map(() => []);
          for (let i = 0; i < numberList.length; i++) {
            const bucket = i % instances.length;
            pairs[bucket].push(advMessages[i * 2], advMessages[i * 2 + 1]);
          }
          const results = await Promise.allSettled(
            instances.map((inst, idx) => {
              if (pairs[idx].length === 0) return Promise.resolve();
              return sendAdvanced(inst, pairs[idx]);
            })
          );
          const succeeded = results.filter((r) => r.status === "fulfilled").length;
          const failed = results.filter((r) => r.status === "rejected").length;
          if (failed > 0) toast.warning(`${succeeded} instância(s) OK, ${failed} falharam.`);
          else toast.success(`Round-robin com botão anti-ban! ${numberList.length} contatos em ${instances.length} instâncias.`);
        }
      } else if (splitMessages) {
        // Split messages by triple line break → convert to advanced mode
        let bodyText = text;
        if (antiBanEnabled) {
          bodyText = applyAntiBan(bodyText, addInvisibleChars, addRandomSpacing);
        }
        const parts = splitMessageByTripleBreak(bodyText);
        const splitDelayMs = (parseInt(splitDelay) || 2) * 1000;
        const campaignInfo = folder || "Campanha Bridge";

        // Build waves: wave[w] = array of messages (one per contact) for part w
        const contactWaves: Record<string, unknown>[][] = [];
        for (let w = 0; w < parts.length; w++) {
          const wave: Record<string, unknown>[] = [];
          for (const num of numberList) {
            const cleanNum = num.replace("@s.whatsapp.net", "");
            const msg: Record<string, unknown> = {
              number: cleanNum,
              type: messageType,
            };
            if (parts[w]) msg.text = parts[w];
            if (w === 0 && fileUrl) msg.file = fileUrl;
            if (w === 0 && docName) msg.docName = docName;
            if (linkPreview) msg.linkPreview = true;
            if (w > 0) msg.splitPart = true;
            wave.push(msg);
          }
          contactWaves.push(wave);
        }

        const sendWave = async (inst: Instance, msgs: Record<string, unknown>[], waveIdx: number) => {
          const body: Record<string, unknown> = {
            delayMin: parseInt(delayMin) || 10,
            delayMax: parseInt(delayMax) || 30,
            info: waveIdx === 0 ? campaignInfo : `${campaignInfo} ⏩${waveIdx + 1}`,
            scheduled_for: scheduleEnabled && scheduledFor ? scheduledFor.getTime() : 1,
            ...buildScheduleParams(scheduleEnabled, scheduledFor, scheduleDays, scheduleTimeRestrict, scheduleTimeStart, scheduleTimeEnd),
            messages: msgs,
          };
          const res = await fetch(`${getBaseUrlFor(inst)}/sender/advanced`, {
            method: "POST", headers: getHeadersFor(inst), body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
        };

        if (instances.length === 1) {
          for (let w = 0; w < contactWaves.length; w++) {
            if (w > 0) await new Promise((r) => setTimeout(r, splitDelayMs));
            await sendWave(instances[0], contactWaves[w], w);
          }
          toast.success(`Campanha dividida criada! ${numberList.length} contato(s), ${parts.length} parte(s) cada.`);
        } else {
          for (let w = 0; w < contactWaves.length; w++) {
            if (w > 0) await new Promise((r) => setTimeout(r, splitDelayMs));
            const waveMsgs = contactWaves[w];
            const buckets: Record<string, unknown>[][] = instances.map(() => []);
            waveMsgs.forEach((msg, idx) => { buckets[idx % instances.length].push(msg); });
            await Promise.allSettled(
              instances.map((inst, idx) => {
                if (buckets[idx].length === 0) return Promise.resolve();
                return sendWave(inst, buckets[idx], w);
              })
            );
          }
          toast.success(`Round-robin dividido! ${numberList.length} contatos, ${parts.length} partes em ${instances.length} instâncias.`);
        }
        // Redirect to campaigns tab and reload folders
        setActiveTab("campaigns");
        setTimeout(() => { const el = document.querySelector('[data-dialog-body]'); el?.scrollTo({ top: 0, behavior: "smooth" }); handleListFolders(); }, 500);
        setSending(false);
        return;
      } else {
        // Standard simple send (no dynamic fields, no anti-ban button, no split)
        let bodyText = text;
        if (antiBanEnabled) {
          bodyText = applyAntiBan(bodyText, addInvisibleChars, addRandomSpacing);
        }

        if (instances.length === 1) {
          const body = buildSimpleBody(numberList);
          if (antiBanEnabled) body.text = bodyText;
          const res = await fetch(`${getBaseUrlFor(instances[0])}/sender/simple`, {
            method: "POST", headers: getHeadersFor(instances[0]), body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
          toast.success(`Campanha criada! ${numberList.length} número(s) na fila.`);
        } else {
          const buckets: string[][] = instances.map(() => []);
          numberList.forEach((num, idx) => { buckets[idx % instances.length].push(num); });

          const results = await Promise.allSettled(
            instances.map((inst, idx) => {
              if (buckets[idx].length === 0) return Promise.resolve();
              const body = buildSimpleBody(buckets[idx]);
              body.folder = `${folder || "Campanha Bridge"} (${inst.instance_name})`;
              if (antiBanEnabled) body.text = bodyText;
              return fetch(`${getBaseUrlFor(inst)}/sender/simple`, {
                method: "POST", headers: getHeadersFor(inst), body: JSON.stringify(body),
              }).then(async (res) => { if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`); });
            })
          );
          const succeeded = results.filter((r) => r.status === "fulfilled").length;
          const failed = results.filter((r) => r.status === "rejected").length;
          if (failed > 0) toast.warning(`${succeeded} instância(s) OK, ${failed} falharam.`);
          else toast.success(`Round-robin! ${numberList.length} números em ${instances.length} instâncias.`);
        }
      }
      // Save phone→name mapping for history display
      if (csvContacts.length > 0) {
        try {
          const stored: Record<string, string> = JSON.parse(localStorage.getItem("campaign_phone_names") || "{}");
          csvContacts.forEach((c) => {
            const phone = c.phone.replace(/\D/g, "");
            const cName = c.firstName || c.fullName || "";
            if (phone && cName) stored[phone] = cName;
          });
          localStorage.setItem("campaign_phone_names", JSON.stringify(stored));
        } catch { /* ignore */ }
      }
      // Redirect to campaigns tab and reload folders
      setActiveTab("campaigns");
      setTimeout(() => { const el = document.querySelector('[data-dialog-body]'); el?.scrollTo({ top: 0, behavior: "smooth" }); handleListFolders(); }, 500);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally { setSending(false); }
  };

  // ─── Advanced send (with round-robin support) ───
  const handleSendAdvanced = async () => {
    const validMessages = advMessages.filter((m) => m.number.trim());
    if (validMessages.length === 0) { toast.error("Adicione pelo menos uma mensagem com número"); return; }

    const buildAdvMsg = (m: AdvancedMessage) => {
      const clean = m.number.replace(/\D/g, "");
      const obj: Record<string, unknown> = {
        number: clean.includes("@") ? m.number.trim() : clean,
        type: m.type,
      };
      let msgText = m.text || "";
      if (antiBanEnabled) msgText = applyAntiBan(msgText, addInvisibleChars, addRandomSpacing);
      if (msgText) obj.text = msgText;
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
    };

    const instances = getRoundRobinInstances();
    setSending(true);

    try {
      if (instances.length === 1) {
        const messages = validMessages.map(buildAdvMsg);
        const body: Record<string, unknown> = {
          delayMin: parseInt(advDelayMin) || 3,
          delayMax: parseInt(advDelayMax) || 6,
          info: advInfo || "Envio avançado Bridge",
          scheduled_for: advScheduleEnabled && advScheduledFor ? advScheduledFor.getTime() : 1,
          ...buildScheduleParams(advScheduleEnabled, advScheduledFor, advScheduleDays, advScheduleTimeRestrict, advScheduleTimeStart, advScheduleTimeEnd),
          messages,
        };
        const res = await fetch(`${getBaseUrlFor(instances[0])}/sender/advanced`, {
          method: "POST", headers: getHeadersFor(instances[0]), body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
        toast.success(`Envio avançado criado! ${messages.length} mensagem(ns) na fila.`);
      } else {
        const buckets: AdvancedMessage[][] = instances.map(() => []);
        validMessages.forEach((msg, idx) => { buckets[idx % instances.length].push(msg); });

        const results = await Promise.allSettled(
          instances.map((inst, idx) => {
            if (buckets[idx].length === 0) return Promise.resolve();
            const messages = buckets[idx].map(buildAdvMsg);
            const body: Record<string, unknown> = {
              delayMin: parseInt(advDelayMin) || 3,
              delayMax: parseInt(advDelayMax) || 6,
              info: `${advInfo || "Envio avançado Bridge"} (${inst.instance_name})`,
              scheduled_for: advScheduleEnabled && advScheduledFor ? advScheduledFor.getTime() : 1,
              ...buildScheduleParams(advScheduleEnabled, advScheduledFor, advScheduleDays, advScheduleTimeRestrict, advScheduleTimeStart, advScheduleTimeEnd),
              messages,
            };
            return fetch(`${getBaseUrlFor(inst)}/sender/advanced`, {
              method: "POST", headers: getHeadersFor(inst), body: JSON.stringify(body),
            }).then(async (res) => { if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`); });
          })
        );
        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) toast.warning(`${succeeded} instância(s) OK, ${failed} falharam.`);
        else toast.success(`Round-robin avançado! ${validMessages.length} msgs em ${instances.length} instâncias.`);
      }
      // Save phone→name mapping for history display (advanced mode)
      if (csvContacts.length > 0) {
        try {
          const stored: Record<string, string> = JSON.parse(localStorage.getItem("campaign_phone_names") || "{}");
          csvContacts.forEach((c) => {
            const phone = c.phone.replace(/\D/g, "");
            const cName = c.firstName || c.fullName || "";
            if (phone && cName) stored[phone] = cName;
          });
          localStorage.setItem("campaign_phone_names", JSON.stringify(stored));
        } catch { /* ignore */ }
      }
      // Redirect to campaigns tab and reload folders
      setActiveTab("campaigns");
      setTimeout(() => { const el = document.querySelector('[data-dialog-body]'); el?.scrollTo({ top: 0, behavior: "smooth" }); handleListFolders(); }, 500);
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
      case "scheduled": return "border-yellow-500/50 text-yellow-500 bg-yellow-500/10";
      case "sending": return "border-blue-500/50 text-blue-500 bg-blue-500/10";
      case "paused": return "border-orange-500/50 text-orange-500 bg-orange-500/10";
      case "done": return "border-green-500/50 text-green-500 bg-green-500/10";
      case "deleting": return "border-destructive/50 text-destructive bg-destructive/10";
      case "sent": return "border-green-500/50 text-green-500 bg-green-500/10";
      case "delivered": return "border-emerald-500/50 text-emerald-400 bg-emerald-500/10";
      case "read": return "border-sky-500/50 text-sky-400 bg-sky-500/10";
      case "failed": return "border-destructive/50 text-destructive bg-destructive/10";
      case "error": return "border-destructive/50 text-destructive bg-destructive/10";
      case "pending": return "border-amber-500/50 text-amber-500 bg-amber-500/10";
      case "queued": return "border-indigo-500/50 text-indigo-400 bg-indigo-500/10";
      default: return "border-muted-foreground/50 text-muted-foreground";
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "scheduled": return "Agendada";
      case "sending": return "Enviando";
      case "paused": return "Pausada";
      case "done": return "Concluída";
      case "deleting": return "Deletando";
      case "sent": return "Enviada";
      case "delivered": return "Entregue";
      case "read": return "Lida";
      case "failed": return "Falhou";
      case "error": return "Erro";
      case "pending": return "Pendente";
      case "queued": return "Na Fila";
      default: return status || "—";
    }
  };

  // ─── Shared UI Components ───
  const renderCsvUpload = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          Números (um por linha, vírgula, ou CSV)
        </Label>
        <div className="flex items-center gap-2">
          <input ref={csvInputRef} type="file" accept=".csv,.txt" onChange={handleCsvUpload} className="hidden" />
          <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()} className="border-border h-7 text-xs">
            <Upload className="h-3 w-3 mr-1" /> Importar CSV
          </Button>
        </div>
      </div>
      <Textarea
        placeholder={"5511999999999: João Silva\n5521888888888: Maria\n\nOu só números, vírgula, ou CSV (phone,nome,sobrenome)"}
      value={numbers}
      onChange={(e) => {
        const val = e.target.value;
        setNumbers(val);
        // Auto-detect "phone: name" format
        const inline = parseInlineContacts(val);
        if (inline && inline.length > 0) {
          setCsvContacts(inline);
          setCsvFileName(`${inline.length} contato(s) inline`);
        } else if (csvFileName.includes("inline")) {
          setCsvContacts([]);
          setCsvFileName("");
        }
      }}
        className="bg-secondary border-border min-h-[80px]"
      />
      {csvContacts.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">
            📄 {csvFileName} — {csvContacts.length} contatos
          </Badge>
          {csvContacts.some((c) => c.firstName || c.fullName) && (
            <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-500">
              ✓ Campos dinâmicos disponíveis
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="h-5 text-xs text-destructive" onClick={() => { setCsvContacts([]); setCsvFileName(""); }}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );

  const renderDynamicFields = (textareaId: string) => (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[10px] text-muted-foreground mr-1">Campos dinâmicos:</span>
      {DYNAMIC_FIELDS.map((f) => (
        <Button
          key={f.tag}
          variant="outline"
          size="sm"
          className="h-5 text-[10px] px-1.5 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => insertDynamicField(f.tag, textareaId)}
        >
          {f.label}
        </Button>
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px] text-xs">
          Importe um CSV com colunas "nome" e "sobrenome" para usar campos dinâmicos. Cada mensagem será personalizada.
        </TooltipContent>
      </Tooltip>
    </div>
  );

  const renderAntiBan = () => (
    <div className="space-y-3 p-3 rounded-lg border border-border bg-secondary/30">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 cursor-pointer text-sm">
          <ShieldCheck className="h-4 w-4 text-green-500" />
          Proteção Anti-Ban
        </Label>
        <Switch checked={antiBanEnabled} onCheckedChange={setAntiBanEnabled} />
      </div>
      {antiBanEnabled && (
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id="invisible-chars"
                checked={addInvisibleChars}
                onCheckedChange={(v) => setAddInvisibleChars(!!v)}
              />
              <label htmlFor="invisible-chars" className="text-xs cursor-pointer">
                Caracteres invisíveis (torna cada mensagem única)
              </label>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id="random-spacing"
                checked={addRandomSpacing}
                onCheckedChange={(v) => setAddRandomSpacing(!!v)}
              />
              <label htmlFor="random-spacing" className="text-xs cursor-pointer">
                Espaçamento aleatório
              </label>
            </div>
          </div>

          {/* Variações com IA */}
          <div className="space-y-2 p-3 rounded-lg border border-border bg-background/50">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 cursor-pointer text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                Variações com IA
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={2} max={20} value={variationCount}
                  onChange={(e) => setVariationCount(parseInt(e.target.value) || 5)}
                  className="bg-secondary border-border w-14 h-7 text-xs text-center"
                />
                <Button
                  variant="outline" size="sm"
                  onClick={handleGenerateVariations}
                  disabled={generatingVariations || !text.trim()}
                  className="border-primary/30 text-primary hover:bg-primary/10 h-7 text-xs"
                >
                  {generatingVariations ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  Gerar
                </Button>
              </div>
            </div>
            {aiVariations.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    {selectedVariationIndexes.length} de {aiVariations.length} variações selecionadas
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost" size="sm" className="h-5 text-[10px]"
                      onClick={() => setSelectedVariationIndexes(aiVariations.map((_, i) => i))}
                    >
                      Todas
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-5 text-[10px]"
                      onClick={() => setSelectedVariationIndexes([])}
                    >
                      Nenhuma
                    </Button>
                    <Label className="text-xs cursor-pointer">Usar no envio</Label>
                    <Switch checked={useVariations} onCheckedChange={setUseVariations} />
                  </div>
                </div>
                <div className="max-h-[200px] overflow-y-auto space-y-1.5">
                  {aiVariations.map((v, i) => {
                    const isSelected = selectedVariationIndexes.includes(i);
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors",
                          isSelected ? "border-primary/50 bg-primary/5" : "border-border bg-transparent hover:bg-muted/30"
                        )}
                        onClick={() => {
                          setSelectedVariationIndexes((prev) =>
                            prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((a, b) => a - b)
                          );
                        }}
                      >
                        <Checkbox
                          checked={isSelected}
                          className="mt-0.5 shrink-0"
                          onCheckedChange={() => {
                            setSelectedVariationIndexes((prev) =>
                              prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((a, b) => a - b)
                            );
                          }}
                        />
                        <Badge variant="outline" className="shrink-0 text-[9px] mt-0.5">{i + 1}</Badge>
                        <p className="text-xs text-muted-foreground leading-relaxed flex-1">{v}</p>
                        <Button
                          variant="ghost" size="sm" className="h-5 text-[10px] shrink-0"
                          onClick={(e) => { e.stopPropagation(); setText(v); }}
                        >
                          Usar
                        </Button>
                      </div>
                    );
                  })}
                </div>
                {useVariations && selectedVariationIndexes.length > 0 && (
                  <p className="text-[10px] text-primary">
                    ✨ Cada contato receberá uma das {selectedVariationIndexes.length} variações selecionadas (rotação automática)
                  </p>
                )}
                {useVariations && selectedVariationIndexes.length === 0 && (
                  <p className="text-[10px] text-destructive">
                    ⚠️ Selecione pelo menos uma variação para usar no envio
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Dividir mensagem moved to main form area, above Preview de Link */}

          <div className="p-2 rounded bg-muted/50 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground">💡 Dicas Anti-Ban:</p>
            <ul className="text-[10px] text-muted-foreground space-y-0.5 list-disc pl-3">
              <li>Use delays de pelo menos <strong>15-30 segundos</strong> entre mensagens</li>
              <li>Ative <strong>variações com IA</strong> para cada mensagem ser única</li>
              <li>Use <strong>campos dinâmicos</strong> (nome do contato) para personalizar</li>
              <li>Evite enviar mais de <strong>200-300 mensagens/dia</strong> por número</li>
              <li>Distribua entre <strong>múltiplas instâncias</strong> com Round-Robin</li>
              <li>Evite links encurtados (bit.ly, etc.) — use links completos</li>
              <li>Aqueça números novos: comece com poucos envios e aumente gradualmente</li>
            </ul>
          </div>

          {/* Botão Anti-Ban */}
          <div className="space-y-2 p-3 rounded-lg border border-border bg-background/50">
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Shield className="h-4 w-4 text-primary" />
                  Botão Anti-Ban
                </Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">Envia botões de resposta para reduzir risco de banimento</p>
              </div>
              <Switch checked={antiBanButton} onCheckedChange={setAntiBanButton} />
            </div>
            {antiBanButton && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Título (destaque)</Label>
                    <Input
                      value={antiBanBtnTitle}
                      onChange={(e) => setAntiBanBtnTitle(e.target.value)}
                      className="bg-secondary border-border h-8 text-xs"
                      placeholder="Comunicação Oficial"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Rodapé</Label>
                    <Input
                      value={antiBanBtnFooter}
                      onChange={(e) => setAntiBanBtnFooter(e.target.value)}
                      className="bg-secondary border-border h-8 text-xs"
                      placeholder="Responda para confirmar"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MessageSquare className="h-3 w-3" /> Mensagem Principal
                  </Label>
                  <Input
                    value={antiBanBtnMessage}
                    onChange={(e) => setAntiBanBtnMessage(e.target.value)}
                    className="bg-secondary border-border h-8 text-xs"
                    placeholder="Deseja continuar recebendo nossas mensagens?"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Botões de Resposta</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Opção 1 (positiva)</Label>
                      <Input
                        value={antiBanBtnOption1}
                        onChange={(e) => setAntiBanBtnOption1(e.target.value)}
                        className="bg-secondary border-border h-8 text-xs"
                        placeholder="Sim, quero receber"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Opção 2 (negativa)</Label>
                      <Input
                        value={antiBanBtnOption2}
                        onChange={(e) => setAntiBanBtnOption2(e.target.value)}
                        className="bg-secondary border-border h-8 text-xs"
                        placeholder="Não, obrigado"
                      />
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5 text-xs text-primary">
                    <Eye className="h-3 w-3" /> Preview da mensagem:
                  </Label>
                  <div className="p-3 rounded-lg border border-primary/30 bg-background space-y-2">
                    <p className="text-sm font-bold">{antiBanBtnTitle || "Título"}</p>
                    <p className="text-xs text-muted-foreground">{antiBanBtnMessage || "Mensagem..."}</p>
                    <div className="flex gap-2 flex-wrap">
                      {antiBanBtnOption1 && (
                        <span className="text-[10px] px-3 py-1 rounded-full border border-primary/50 text-primary">{antiBanBtnOption1}</span>
                      )}
                      {antiBanBtnOption2 && (
                        <span className="text-[10px] px-3 py-1 rounded-full border border-primary/50 text-primary">{antiBanBtnOption2}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">{antiBanBtnFooter || "Rodapé"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderRoundRobin = (prefix: string) => (
    <>
      {siblingInstances.length > 0 && (
        <div className="space-y-3 p-3 rounded-lg border border-border bg-secondary/30">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 cursor-pointer">
              <RefreshCw className="h-4 w-4 text-primary" />
              Round-Robin (multi-instância)
            </Label>
            <Switch checked={useRoundRobin} onCheckedChange={setUseRoundRobin} />
          </div>
          {useRoundRobin && (
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-xs text-muted-foreground">Selecione instâncias extras:</Label>
              {siblingInstances.map((inst) => (
                <div key={inst.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`rr-${prefix}-${inst.id}`}
                    checked={selectedInstanceIds.includes(inst.id)}
                    onCheckedChange={() => toggleInstanceSelection(inst.id)}
                  />
                  <label htmlFor={`rr-${prefix}-${inst.id}`} className="text-sm cursor-pointer flex items-center gap-2">
                    {inst.instance_name}
                    {inst.phone && <span className="text-xs text-muted-foreground">({inst.phone})</span>}
                  </label>
                </div>
              ))}
              {selectedInstanceIds.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  📊 Distribuição entre {selectedInstanceIds.length + 1} instâncias
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-card-foreground flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Mensagem em massa
          </DialogTitle>
          <DialogDescription>
            Crie campanhas de disparo para a instância <strong>{instance.instance_name}</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setTimeout(() => { const el = document.querySelector('[data-dialog-body]'); el?.scrollTo({ top: 0, behavior: "smooth" }); }, 50); }} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="simple" className="flex-1">
              <Send className="h-4 w-4 mr-2" />Simples
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex-1">
              <Layers className="h-4 w-4 mr-2" />Avançado
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="flex-1">
              <ListChecks className="h-4 w-4 mr-2" />Campanhas
            </TabsTrigger>
          </TabsList>

          {/* ════════ SIMPLE TAB ════════ */}
          <TabsContent value="simple" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nome da Campanha</Label>
              <Input placeholder="Ex: Campanha Janeiro" value={folder} onChange={(e) => setFolder(e.target.value)} className="bg-secondary border-border" />
            </div>

            {/* CSV Upload + Numbers */}
            {renderCsvUpload()}

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
                {renderDynamicFields("simple-text")}
                <Textarea
                  id="simple-text"
                  placeholder="Digite sua mensagem... Use {{primeiro_nome}} para personalizar"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="bg-secondary border-border min-h-[100px]"
                />
                {/* Split preview indicator */}
                {splitMessages && text && splitMessageByTripleBreak(text).length > 1 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[11px] font-medium text-primary flex items-center gap-1">
                      ✂️ Mensagem será dividida em {splitMessageByTripleBreak(text).length} partes
                    </p>
                    <div className="space-y-1">
                      {splitMessageByTripleBreak(text).map((part, i) => (
                        <div key={i} className="text-[10px] bg-secondary rounded px-2 py-1 border border-border">
                          <span className="font-semibold text-muted-foreground">Parte {i + 1}:</span>{" "}
                          <span className="text-foreground">{part.length > 80 ? part.slice(0, 80) + "…" : part}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Dividir mensagem */}
            <div className="space-y-2 p-3 rounded-lg border border-border bg-secondary/50">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Scissors className="h-4 w-4 text-primary" />
                  Dividir mensagem
                </Label>
                <Switch checked={splitMessages} onCheckedChange={setSplitMessages} />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Use 3 quebras de linha (Enter 3x) no texto para separar em mensagens diferentes.
              </p>
              {splitMessages && (
                <div className="pt-2 border-t border-border">
                  <div className="space-y-1 max-w-[180px]">
                    <Label className="text-xs text-muted-foreground">Delay entre partes (s)</Label>
                    <Input
                      type="number" min={0} max={30}
                      value={splitDelay}
                      onChange={(e) => setSplitDelay(e.target.value)}
                      className="bg-secondary border-border h-8 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

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

            {renderScheduleSection(
              scheduleEnabled, setScheduleEnabled,
              scheduledFor, setScheduledFor,
              scheduleDays, setScheduleDays,
              scheduleTimeRestrict, setScheduleTimeRestrict,
              scheduleTimeStart, setScheduleTimeStart,
              scheduleTimeEnd, setScheduleTimeEnd,
            )}


            {/* Anti-Ban */}
            {renderAntiBan()}

            {/* Round-Robin */}
            {renderRoundRobin("simple")}

            <Button onClick={handleSendSimple} disabled={sending} className="w-full bg-primary hover:bg-primary/90">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {needsPerContactMessages() ? "Criar Campanha Personalizada" :
                useRoundRobin && selectedInstanceIds.length > 0 ? "Criar Campanha Round-Robin" : "Criar Campanha Simples"}
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
            {renderScheduleSection(
              advScheduleEnabled, setAdvScheduleEnabled,
              advScheduledFor, setAdvScheduledFor,
              advScheduleDays, setAdvScheduleDays,
              advScheduleTimeRestrict, setAdvScheduleTimeRestrict,
              advScheduleTimeStart, setAdvScheduleTimeStart,
              advScheduleTimeEnd, setAdvScheduleTimeEnd,
            )}

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

            {/* Anti-Ban */}
            {renderAntiBan()}

            {/* Round-Robin */}
            {renderRoundRobin("adv")}

            <Button onClick={handleSendAdvanced} disabled={sending} className="w-full bg-primary hover:bg-primary/90">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Layers className="h-4 w-4 mr-2" />}
              {useRoundRobin && selectedInstanceIds.length > 0 ? "Criar Envio Round-Robin" : "Criar Envio Avançado"}
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
                    <SelectTrigger className="bg-secondary border-border h-8 w-[130px] text-xs"><SelectValue placeholder="Todos status" /></SelectTrigger>
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
                <>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar campanha..."
                    value={folderSearch}
                    onChange={(e) => setFolderSearch(e.target.value)}
                    className="pl-8 h-8 text-xs bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {folders.filter((f) => {
                    // Hide split continuation campaigns (marked with ⏩)
                    const info = String(f.info || f.folder_name || f.name || "");
                    if (info.includes("⏩")) return false;
                    if (!folderSearch) return true;
                    const q = folderSearch.toLowerCase();
                    const searchable = [f.folder_name, f.name, f.info, f.folder_id, f.id].filter(Boolean).join(" ").toLowerCase();
                    return searchable.includes(q);
                  }).map((f, idx) => {
                    const fId = f.folder_id || f.id || `folder-${idx}`;
                    const isExpanded = expandedFolder === fId;
                    return (
                      <Card key={idx} className="bg-secondary/30 border-border/50">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="outline" className={cn("text-[10px] shrink-0", getStatusColor(f.status))}>
                                {getStatusLabel(f.status)}
                              </Badge>
                              <span className="text-xs font-medium truncate">{f.info || fId}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCampaignFolderId(fId)} title="Usar ID para controle">
                                <Search className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={async () => {
                                setFullscreenCampaign(f);
                                setFsPage(1);
                                setLoadingFullscreen(true);
                                setFullscreenMessages([]);
                                try {
                                  const base = getBaseUrl();
                                  const resp = await fetch(`${base}/sender/listmessages`, {
                                    method: "POST",
                                    headers: getHeaders(),
                                    body: JSON.stringify({ folder_id: fId, page: 1, pageSize: 1000 }),
                                  });
                                  if (!resp.ok) throw new Error(`Erro ${resp.status}`);
                                  const data = await resp.json();
                                  const mainList: CampaignMessage[] = normalizeMessages(
                                    Array.isArray(data) ? data : data?.messages || data?.data || data?.items || data?.results || []
                                  );

                                  // Fetch continuation waves (⏩)
                                  const mainInfo = String(f.info || f.folder_name || f.name || "");
                                  const contFolders = folders.filter((cf) => {
                                    const info = String(cf.info || cf.folder_name || cf.name || "");
                                    return info.includes("⏩") && mainInfo && info.startsWith(mainInfo.split(" ⏩")[0]);
                                  });
                                  const contMessages: CampaignMessage[] = [];
                                  if (contFolders.length > 0) {
                                    const contResults = await Promise.allSettled(
                                      contFolders.map(async (cf) => {
                                        const cfId = cf.folder_id || cf.id;
                                        const cfRes = await fetch(`${base}/sender/listmessages`, {
                                          method: "POST", headers: getHeaders(),
                                          body: JSON.stringify({ folder_id: cfId, page: 1, pageSize: 1000 }),
                                        });
                                        if (!cfRes.ok) return [];
                                        const cfData = await cfRes.json();
                                        return normalizeMessages(Array.isArray(cfData) ? cfData : cfData?.messages || cfData?.data || []);
                                      })
                                    );
                                    for (const r of contResults) if (r.status === "fulfilled") contMessages.push(...r.value);
                                  }

                                  // Merge: main first, then continuation
                                  const isBtn = (msg: CampaignMessage) => {
                                    const t = String(msg.type || "").toLowerCase();
                                    if (t === "button") return true;
                                    try {
                                      const raw = (msg as any).send_payload || (msg as any).sendPayload;
                                      if (raw) { const sp = typeof raw === "string" ? JSON.parse(raw) : raw; if (sp?.type === "button" || sp?.buttonText || sp?.choices) return true; }
                                    } catch {}
                                    return false;
                                  };
                                  const merged: CampaignMessage[] = [];
                                  const byNum: Record<string, CampaignMessage> = {};
                                  for (const msg of mainList) {
                                    if (isBtn(msg)) continue;
                                    const num = String(msg.number || (msg as any).chatid || "");
                                    merged.push(msg);
                                    if (num) byNum[num] = msg;
                                  }
                                  for (const msg of contMessages) {
                                    if (isBtn(msg)) continue;
                                    const num = String(msg.number || (msg as any).chatid || "");
                                    if (num && byNum[num]) {
                                      if (msg.text) byNum[num].text = (byNum[num].text || "") + "\n\n" + msg.text;
                                    } else {
                                      merged.push(msg);
                                      if (num) byNum[num] = msg;
                                    }
                                  }
                                  setFullscreenMessages(merged);
                                } catch { toast.error("Erro ao carregar mensagens"); }
                                setLoadingFullscreen(false);
                              }} title="Expandir campanha">
                                <Maximize2 className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                setMsgFolderId(fId);
                                if (isExpanded) { setExpandedFolder(null); setCampaignMessages([]); }
                                else handleListMessages(fId);
                              }}>
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
                          {isExpanded && campaignMessages.length > 0 && (
                            <div className="mt-2 rounded border border-border overflow-hidden">
                              <Table>
                                <TableHeader>
                                    <TableRow className="h-7">
                                    <TableHead className="text-[10px] px-2 py-1">Número</TableHead>
                                    <TableHead className="text-[10px] px-2 py-1">Nome</TableHead>
                                    <TableHead className="text-[10px] px-2 py-1">Status</TableHead>
                                    <TableHead className="text-[10px] px-2 py-1">Mensagem</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {campaignMessages.map((cm, mi) => (
                              <TableRow key={mi} className="h-7">
                                      <TableCell className="text-[10px] px-2 py-1 font-mono whitespace-nowrap">{cm.number || "—"}</TableCell>
                                      <TableCell className="text-[10px] px-2 py-1 max-w-[100px] truncate">{(cm as any).name || "—"}</TableCell>
                                      <TableCell className="text-[10px] px-2 py-1">
                                        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", getStatusColor(cm.status))}>
                                          {getStatusLabel(cm.status)}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-[10px] px-2 py-1 max-w-[200px] truncate" title={cm.text || ""}>{cm.text || "—"}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              {/* Pagination */}
                              <div className="flex items-center justify-between p-2 border-t border-border">
                                <span className="text-[10px] text-muted-foreground">{campaignMessages.length} mensagem(ns)</span>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" disabled={msgPage <= 1}
                                    onClick={() => { setMsgPage((p) => Math.max(1, p - 1)); handleListMessages(); }}>
                                    Anterior
                                  </Button>
                                  <span className="text-[10px] text-muted-foreground px-1">Pág {msgPage}</span>
                                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" disabled={campaignMessages.length < msgPageSize}
                                    onClick={() => { setMsgPage((p) => p + 1); handleListMessages(); }}>
                                    Próxima
                                  </Button>
                                </div>
                              </div>
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
                </>
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
                <Button variant={campaignAction === "stop" ? "default" : "outline"} onClick={() => setCampaignAction("stop")}
                  className={cn("border-border text-xs", campaignAction === "stop" && "bg-yellow-600 hover:bg-yellow-700 text-white")} size="sm">
                  <Pause className="h-3.5 w-3.5 mr-1" /> Pausar
                </Button>
                <Button variant={campaignAction === "continue" ? "default" : "outline"} onClick={() => setCampaignAction("continue")}
                  className={cn("border-border text-xs", campaignAction === "continue" && "bg-green-600 hover:bg-green-700 text-white")} size="sm">
                  <Play className="h-3.5 w-3.5 mr-1" /> Continuar
                </Button>
                <Button variant={campaignAction === "delete" ? "default" : "outline"} onClick={() => setCampaignAction("delete")}
                  className={cn("border-border text-xs", campaignAction === "delete" && "bg-destructive hover:bg-destructive/90 text-white")} size="sm">
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
              <Card className="bg-secondary/30 border-border/50">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-card-foreground">Limpar Enviadas</p>
                      <p className="text-[10px] text-muted-foreground">Remove mensagens já enviadas mais antigas que o período informado.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input type="number" placeholder="168" value={clearHours} onChange={(e) => setClearHours(e.target.value)} className="bg-secondary border-border w-24 h-8 text-xs" />
                    <span className="text-[10px] text-muted-foreground">horas</span>
                    <Button variant="outline" size="sm" onClick={handleClearDone} disabled={clearingDone} className="border-border ml-auto h-8 text-xs">
                      {clearingDone ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
                      Limpar
                    </Button>
                  </div>
                </CardContent>
              </Card>
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
                      Esta ação é <strong>irreversível</strong>. Todas as mensagens da fila serão removidas.
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
        </DialogBody>
      </DialogContent>
    </Dialog>
  {/* ── Fullscreen Campaign Dialog ── */}
  <Dialog open={!!fullscreenCampaign} onOpenChange={(o) => { if (!o) setFullscreenCampaign(null); }}>
    <DialogContent className="bg-card border-border max-w-[95vw] max-h-[95vh]">
      <DialogHeader>
        <DialogTitle className="text-card-foreground flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          Campanha: {fullscreenCampaign?.info || fullscreenCampaign?.folder_id || fullscreenCampaign?.id || ""}
        </DialogTitle>
        <DialogDescription>
          <div className="flex gap-3 text-xs mt-1">
            {fullscreenCampaign?.total != null && <span>Total: {fullscreenCampaign.total}</span>}
            {fullscreenCampaign?.sent != null && <span>Enviadas: {fullscreenCampaign.sent}</span>}
            {fullscreenCampaign?.failed != null && <span>Falhas: {fullscreenCampaign.failed}</span>}
            {fullscreenCampaign?.scheduled != null && <span>Agendadas: {fullscreenCampaign.scheduled}</span>}
            <Badge variant="outline" className={cn("text-[10px]", getStatusColor(fullscreenCampaign?.status))}>{getStatusLabel(fullscreenCampaign?.status)}</Badge>
          </div>
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {loadingFullscreen ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : fullscreenMessages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Nenhuma mensagem encontrada</p>
        ) : (
          <div className="rounded border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="h-8">
                  <TableHead className="text-xs px-3 py-1">#</TableHead>
                  <TableHead className="text-xs px-3 py-1">Número</TableHead>
                  <TableHead className="text-xs px-3 py-1">Nome</TableHead>
                  <TableHead className="text-xs px-3 py-1">Status</TableHead>
                  <TableHead className="text-xs px-3 py-1">Mensagem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fullscreenMessages.map((cm, mi) => (
                  <TableRow key={mi} className="h-8">
                    <TableCell className="text-xs px-3 py-1 text-muted-foreground">{mi + 1}</TableCell>
                    <TableCell className="text-xs px-3 py-1 font-mono whitespace-nowrap">{cm.number || "—"}</TableCell>
                    <TableCell className="text-xs px-3 py-1 max-w-[150px] truncate">{(cm as any).name || "—"}</TableCell>
                    <TableCell className="text-xs px-3 py-1">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", getStatusColor(cm.status))}>
                        {getStatusLabel(cm.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs px-3 py-1 max-w-[400px] truncate" title={cm.text || ""}>{cm.text || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between p-3 border-t border-border">
              <span className="text-xs text-muted-foreground">{fullscreenMessages.length} mensagem(ns)</span>
            </div>
          </div>
        )}
      </DialogBody>
    </DialogContent>
  </Dialog>
  </>
  );
}
