import { useState } from "react";
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
import { Instance } from "@/hooks/useInstances";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner";
import { Loader2, Send, Clock, Plus, Trash2, Layers } from "lucide-react";
import { getBaseUrlForInstance } from "@/hooks/instances/instanceApi";
import { Card, CardContent } from "@/components/ui/card";

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
  const [scheduledFor, setScheduledFor] = useState("");
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
  const [advScheduledFor, setAdvScheduledFor] = useState("");
  const [advMessages, setAdvMessages] = useState<AdvancedMessage[]>([emptyAdvancedMsg()]);

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

    const baseUrl = getBaseUrlForInstance(instance, settings?.uazapi_base_url);
    const body: Record<string, unknown> = {
      numbers: numberList,
      type: messageType,
      folder: folder || "Campanha Bridge",
      delayMin: parseInt(delayMin) || 10,
      delayMax: parseInt(delayMax) || 30,
      scheduled_for: scheduledFor ? new Date(scheduledFor).getTime() : 0,
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
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", token: instance.uazapi_instance_token },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      toast.success(`Campanha simples criada! ${numberList.length} número(s) na fila.`);
      onOpenChange(false);
    } catch (err: any) {
      console.error("Erro ao criar campanha:", err);
      toast.error(`Erro: ${err.message}`);
    } finally { setSending(false); }
  };

  // ─── Advanced send ───
  const handleSendAdvanced = async () => {
    const validMessages = advMessages.filter((m) => m.number.trim());
    if (validMessages.length === 0) { toast.error("Adicione pelo menos uma mensagem com número"); return; }

    const baseUrl = getBaseUrlForInstance(instance, settings?.uazapi_base_url);
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
      scheduled_for: advScheduledFor ? new Date(advScheduledFor).getTime() : 1,
      messages,
    };

    setSending(true);
    try {
      const res = await fetch(`${baseUrl}/sender/advanced`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", token: instance.uazapi_instance_token },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      toast.success(`Envio avançado criado! ${messages.length} mensagem(ns) na fila.`);
      onOpenChange(false);
    } catch (err: any) {
      console.error("Erro ao criar envio avançado:", err);
      toast.error(`Erro: ${err.message}`);
    } finally { setSending(false); }
  };

  const showMediaField = ["image", "video", "audio", "document"].includes(messageType);
  const showContactFields = messageType === "contact";
  const showLocationFields = messageType === "location";
  const showChoiceFields = ["list", "button", "poll", "carousel"].includes(messageType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh] overflow-y-auto">
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
              Disparo Simples
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex-1">
              <Layers className="h-4 w-4 mr-2" />
              Disparo Avançado
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
              <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="bg-secondary border-border" />
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
              <Input type="datetime-local" value={advScheduledFor} onChange={(e) => setAdvScheduledFor(e.target.value)} className="bg-secondary border-border" />
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
                const showMsgMedia = ["image", "video", "audio", "document"].includes(msg.type);
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
