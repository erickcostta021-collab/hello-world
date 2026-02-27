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
import { Loader2, Send, Clock, Plus, Trash2 } from "lucide-react";
import { getBaseUrlForInstance } from "@/hooks/instances/instanceApi";

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

export function ManageMessagesDialog({ open, onOpenChange, instance }: ManageMessagesDialogProps) {
  const { settings } = useSettings();
  const [sending, setSending] = useState(false);

  // Campaign fields
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

  // Button/List/Poll fields
  const [footerText, setFooterText] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [choices, setChoices] = useState<string[]>([""]);

  // Contact fields
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactOrg, setContactOrg] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Location fields
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");

  const handleAddChoice = () => setChoices([...choices, ""]);
  const handleRemoveChoice = (index: number) => setChoices(choices.filter((_, i) => i !== index));
  const handleChoiceChange = (index: number, value: string) => {
    const updated = [...choices];
    updated[index] = value;
    setChoices(updated);
  };

  const handleSend = async () => {
    const numberList = numbers
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const clean = n.replace(/\D/g, "");
        return clean.includes("@") ? n.trim() : `${clean}@s.whatsapp.net`;
      });

    if (numberList.length === 0) {
      toast.error("Adicione pelo menos um número");
      return;
    }

    if (messageType === "text" && !text.trim()) {
      toast.error("Digite a mensagem");
      return;
    }

    const baseUrl = getBaseUrlForInstance(instance, settings?.uazapi_base_url);

    const body: Record<string, unknown> = {
      numbers: numberList,
      type: messageType,
      folder: folder || "Campanha Bridge",
      delayMin: parseInt(delayMin) || 10,
      delayMax: parseInt(delayMax) || 30,
      scheduled_for: scheduledFor ? new Date(scheduledFor).getTime() : 0,
    };

    // Text
    if (text) body.text = text;
    if (linkPreview) body.linkPreview = true;

    // Media
    if (fileUrl) body.file = fileUrl;
    if (docName) body.docName = docName;

    // Contact
    if (messageType === "contact") {
      body.fullName = contactName;
      body.phoneNumber = contactPhone;
      body.organization = contactOrg;
      body.email = contactEmail;
    }

    // Location
    if (messageType === "location") {
      body.latitude = parseFloat(latitude) || 0;
      body.longitude = parseFloat(longitude) || 0;
      body.name = locationName;
      body.address = locationAddress;
    }

    // List/Button/Poll
    if (["list", "button", "poll", "carousel"].includes(messageType)) {
      if (footerText) body.footerText = footerText;
      if (buttonText) body.buttonText = buttonText;
      const filteredChoices = choices.filter(Boolean);
      if (filteredChoices.length > 0) body.choices = filteredChoices;
    }

    setSending(true);
    try {
      const res = await fetch(`${baseUrl}/sender/simple`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          token: instance.uazapi_instance_token,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.text();
        throw new Error(errData || `Erro ${res.status}`);
      }

      toast.success(`Campanha criada! ${numberList.length} número(s) na fila.`);
      onOpenChange(false);
    } catch (err: any) {
      console.error("Erro ao criar campanha:", err);
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSending(false);
    }
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

        <Tabs defaultValue="campaign" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="campaign" className="flex-1">
              <Send className="h-4 w-4 mr-2" />
              Novo Disparo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="campaign" className="space-y-4 mt-4">
            {/* Campaign Name */}
            <div className="space-y-2">
              <Label>Nome da Campanha</Label>
              <Input
                placeholder="Ex: Campanha Janeiro"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>

            {/* Numbers */}
            <div className="space-y-2">
              <Label>Números (um por linha ou separados por vírgula)</Label>
              <Textarea
                placeholder={"5511999999999\n5511888888888"}
                value={numbers}
                onChange={(e) => setNumbers(e.target.value)}
                className="bg-secondary border-border min-h-[80px]"
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label>Tipo de Mensagem</Label>
              <Select value={messageType} onValueChange={setMessageType}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESSAGE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Text */}
            {(messageType === "text" || showMediaField || showChoiceFields) && (
              <div className="space-y-2">
                <Label>Texto da Mensagem</Label>
                <Textarea
                  placeholder="Digite sua mensagem..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="bg-secondary border-border min-h-[100px]"
                />
              </div>
            )}

            {/* Link Preview */}
            {messageType === "text" && (
              <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg border border-border">
                <Label className="cursor-pointer">Preview de Link</Label>
                <Switch checked={linkPreview} onCheckedChange={setLinkPreview} />
              </div>
            )}

            {/* Media URL */}
            {showMediaField && (
              <div className="space-y-2">
                <Label>URL do Arquivo</Label>
                <Input
                  placeholder="https://exemplo.com/arquivo.jpg"
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  className="bg-secondary border-border"
                />
                {messageType === "document" && (
                  <div className="space-y-2">
                    <Label>Nome do Documento</Label>
                    <Input
                      placeholder="documento.pdf"
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      className="bg-secondary border-border"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Contact Fields */}
            {showContactFields && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nome Completo</Label>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label>Organização</Label>
                  <Input value={contactOrg} onChange={(e) => setContactOrg(e.target.value)} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="bg-secondary border-border" />
                </div>
              </div>
            )}

            {/* Location Fields */}
            {showLocationFields && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Latitude</Label>
                  <Input value={latitude} onChange={(e) => setLatitude(e.target.value)} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label>Longitude</Label>
                  <Input value={longitude} onChange={(e) => setLongitude(e.target.value)} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label>Nome do Local</Label>
                  <Input value={locationName} onChange={(e) => setLocationName(e.target.value)} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Input value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} className="bg-secondary border-border" />
                </div>
              </div>
            )}

            {/* Choices (List/Button/Poll) */}
            {showChoiceFields && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Texto do Rodapé</Label>
                    <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} className="bg-secondary border-border" placeholder="Rodapé" />
                  </div>
                  <div className="space-y-2">
                    <Label>Texto do Botão</Label>
                    <Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} className="bg-secondary border-border" placeholder="Ver opções" />
                  </div>
                </div>
                <Label>Opções</Label>
                {choices.map((choice, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={choice}
                      onChange={(e) => handleChoiceChange(i, e.target.value)}
                      placeholder={`Opção ${i + 1}`}
                      className="bg-secondary border-border"
                    />
                    {choices.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveChoice(i)} className="shrink-0 text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={handleAddChoice} className="border-border">
                  <Plus className="h-4 w-4 mr-1" /> Adicionar Opção
                </Button>
              </div>
            )}

            {/* Delay Settings */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Delay Mínimo (seg)</Label>
                <Input
                  type="number"
                  value={delayMin}
                  onChange={(e) => setDelayMin(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Delay Máximo (seg)</Label>
                <Input
                  type="number"
                  value={delayMax}
                  onChange={(e) => setDelayMax(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
            </div>

            {/* Schedule */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Agendar (opcional)
              </Label>
              <Input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>

            {/* Send Button */}
            <Button
              onClick={handleSend}
              disabled={sending}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Criar Campanha
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
