import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Instance } from "@/hooks/useInstances";

interface UazapiWebhook {
  id: string;
  url: string;
  enabled: boolean;
  events: string[];
  addUrlEvents: boolean;
  addUrlTypesMessages: boolean;
  excludeMessages: string;
}

const ALL_EVENTS = ["messages", "messages_update", "chats", "connection", "qrcode", "history", "call", "contacts", "presence"] as const;

interface WebhookConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: Instance;
  onSave: (params: {
    webhookUrl: string;
    ignoreGroups: boolean;
    webhookEvents: string[];
    createNew: boolean;
  }) => void;
  isSaving: boolean;
  ignoreGroups: boolean;
  onIgnoreGroupsChange: (v: boolean) => void;
}

export function WebhookConfigDialog({
  open,
  onOpenChange,
  instance,
  onSave,
  isSaving,
  ignoreGroups,
  onIgnoreGroupsChange,
}: WebhookConfigDialogProps) {
  const [webhooks, setWebhooks] = useState<UazapiWebhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("new");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["messages"]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Fetch webhooks when dialog opens
  useEffect(() => {
    if (open) {
      fetchWebhooks();
    }
  }, [open]);

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-webhooks", {
        body: { instance_id: instance.id },
      });
      if (error) throw error;
      const fetched = data?.webhooks || [];
      setWebhooks(fetched);
      // If there are existing webhooks, select the first one
      if (fetched.length > 0) {
        setActiveTab(fetched[0].id);
        setWebhookUrl(fetched[0].url);
        setWebhookEvents(fetched[0].events?.length > 0 ? fetched[0].events : ["messages"]);
      } else {
        setActiveTab("new");
        setWebhookUrl("");
        setWebhookEvents(["messages"]);
      }
    } catch (err: any) {
      console.error("Failed to fetch webhooks:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId === "new") {
      setWebhookUrl("");
      setWebhookEvents(["messages"]);
    } else {
      const wh = webhooks.find((w) => w.id === tabId);
      if (wh) {
        setWebhookUrl(wh.url);
        setWebhookEvents(wh.events?.length > 0 ? wh.events : ["messages"]);
      }
    }
  };

  const toggleEvent = (event: string) => {
    setWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleSave = () => {
    const isNew = activeTab === "new";
    onSave({
      webhookUrl,
      ignoreGroups,
      webhookEvents,
      createNew: isNew,
    });
  };

  const handleDelete = async (webhookId: string) => {
    setDeletingId(webhookId);
    try {
      const { data } = await supabase.functions.invoke("delete-webhook", {
        body: { instance_id: instance.id, webhook_id: webhookId },
      });
      if (data?.error) throw new Error(data.error);
      toast.success("Webhook removido!");
      await fetchWebhooks();
    } catch (err: any) {
      toast.error("Erro ao remover webhook: " + (err.message || ""));
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (webhookId: string, currentEnabled: boolean) => {
    setTogglingId(webhookId);
    try {
      const { data } = await supabase.functions.invoke("toggle-webhook", {
        body: { instance_id: instance.id, webhook_id: webhookId, enabled: !currentEnabled },
      });
      if (data?.error) throw new Error(data.error);
      toast.success(!currentEnabled ? "Webhook habilitado!" : "Webhook desabilitado!");
      await fetchWebhooks();
    } catch (err: any) {
      toast.error("Erro ao alterar webhook: " + (err.message || ""));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">Configurar Webhooks</DialogTitle>
          <DialogDescription>
            Gerencie os webhooks configurados na UAZAPI
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-secondary/50 p-1">
              {webhooks.map((wh, idx) => (
                <TabsTrigger
                  key={wh.id}
                  value={wh.id}
                  className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Webhook {idx + 1}
                </TabsTrigger>
              ))}
              <TabsTrigger
                value="new"
                className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Plus className="h-3 w-3 mr-1" />
                Novo
              </TabsTrigger>
            </TabsList>

            {/* Existing webhook tabs */}
            {webhooks.map((wh) => (
              <TabsContent key={wh.id} value={wh.id} className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground font-mono">
                    ID: {wh.id}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {wh.enabled ? "Ativo" : "Inativo"}
                      </span>
                      <Switch
                        checked={wh.enabled}
                        onCheckedChange={() => handleToggle(wh.id, wh.enabled)}
                        disabled={togglingId === wh.id}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7"
                      onClick={() => handleDelete(wh.id)}
                      disabled={deletingId === wh.id}
                    >
                      {deletingId === wh.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <WebhookForm
                  webhookUrl={webhookUrl}
                  onWebhookUrlChange={setWebhookUrl}
                  webhookEvents={webhookEvents}
                  onToggleEvent={toggleEvent}
                  ignoreGroups={ignoreGroups}
                  onIgnoreGroupsChange={onIgnoreGroupsChange}
                />

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Salvar
                  </Button>
                </div>
              </TabsContent>
            ))}

            {/* New webhook tab */}
            <TabsContent value="new" className="space-y-4 mt-4">
              <WebhookForm
                webhookUrl={webhookUrl}
                onWebhookUrlChange={setWebhookUrl}
                webhookEvents={webhookEvents}
                onToggleEvent={toggleEvent}
                ignoreGroups={ignoreGroups}
                onIgnoreGroupsChange={onIgnoreGroupsChange}
              />

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Plus className="h-4 w-4 mr-1" />
                  Criar Webhook
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Reusable form for both existing and new webhook
function WebhookForm({
  webhookUrl,
  onWebhookUrlChange,
  webhookEvents,
  onToggleEvent,
  ignoreGroups,
  onIgnoreGroupsChange,
}: {
  webhookUrl: string;
  onWebhookUrlChange: (url: string) => void;
  webhookEvents: string[];
  onToggleEvent: (event: string) => void;
  ignoreGroups: boolean;
  onIgnoreGroupsChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="webhook-url">URL do Webhook</Label>
        <Input
          id="webhook-url"
          value={webhookUrl}
          onChange={(e) => onWebhookUrlChange(e.target.value)}
          placeholder="https://seu-webhook.com/endpoint"
          className="bg-secondary border-border"
        />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="ignore-groups">Ignorar mensagens de grupos</Label>
        <Switch
          id="ignore-groups"
          checked={ignoreGroups}
          onCheckedChange={onIgnoreGroupsChange}
        />
      </div>
      <div className="space-y-2">
        <Label>Escutar Eventos</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_EVENTS.map((event) => (
            <button
              key={event}
              type="button"
              onClick={() => onToggleEvent(event)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                webhookEvents.includes(event)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {event}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Selecione os tipos de eventos que deseja receber no webhook
        </p>
      </div>
    </div>
  );
}
