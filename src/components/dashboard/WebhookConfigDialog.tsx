import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  excludeMessages: string[] | string;
}

const ALL_EVENTS = ["messages", "messages_update", "chats", "connection", "qrcode", "history", "call", "contacts", "presence", "groups", "labels", "chat_labels", "blocks", "leads", "sender"] as const;
const EXCLUDE_OPTIONS = ["wasSentByApi", "wasNotSentByApi", "fromMeYes", "fromMeNo", "isGroupYes", "isGroupNo"] as const;

interface WebhookConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: Instance;
  onSave: (params: {
    webhookUrl: string;
    ignoreGroups: boolean;
    webhookEvents: string[];
    createNew: boolean;
    enabled: boolean;
    webhookId?: string;
    excludeMessages?: string;
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
  const [webhookEnabled, setWebhookEnabled] = useState(true);

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
        setWebhookEnabled(fetched[0].enabled !== false);
        setExcludeMessages(fetched[0].excludeMessages ? (Array.isArray(fetched[0].excludeMessages) ? fetched[0].excludeMessages : fetched[0].excludeMessages.split(",").filter(Boolean)) : []);
      } else {
        setActiveTab("new");
        setWebhookUrl("");
        setWebhookEvents(["messages"]);
        setWebhookEnabled(true);
        setExcludeMessages([]);
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
      setWebhookEnabled(true);
      setExcludeMessages([]);
    } else {
      const wh = webhooks.find((w) => w.id === tabId);
      if (wh) {
        setWebhookUrl(wh.url);
        setWebhookEvents(wh.events?.length > 0 ? wh.events : ["messages"]);
        setWebhookEnabled(wh.enabled !== false);
        setExcludeMessages(wh.excludeMessages ? (Array.isArray(wh.excludeMessages) ? wh.excludeMessages : wh.excludeMessages.split(",").filter(Boolean)) : []);
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
      enabled: webhookEnabled,
      webhookId: isNew ? undefined : activeTab,
      excludeMessages: excludeMessages.length > 0 ? excludeMessages.join(",") : undefined,
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
  const [excludeMessages, setExcludeMessages] = useState<string[]>([]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar Webhooks</DialogTitle>
          <DialogDescription>
            Gerencie os webhooks configurados na UAZAPI
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
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
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${wh.enabled ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                        {wh.enabled ? "Ativo" : "Inativo"}
                      </span>
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
                    enabled={webhookEnabled}
                    onEnabledChange={setWebhookEnabled}
                    excludeMessages={excludeMessages}
                    onExcludeMessagesChange={setExcludeMessages}
                  />
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
                  enabled={webhookEnabled}
                  onEnabledChange={setWebhookEnabled}
                  excludeMessages={excludeMessages}
                  onExcludeMessagesChange={setExcludeMessages}
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || loading}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {activeTab === "new" ? (
              <>
                <Plus className="h-4 w-4 mr-1" />
                Criar Webhook
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </DialogFooter>
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
  enabled,
  onEnabledChange,
  excludeMessages,
  onExcludeMessagesChange,
}: {
  webhookUrl: string;
  onWebhookUrlChange: (url: string) => void;
  webhookEvents: string[];
  onToggleEvent: (event: string) => void;
  ignoreGroups: boolean;
  onIgnoreGroupsChange: (v: boolean) => void;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  excludeMessages: string[];
  onExcludeMessagesChange: (v: string[]) => void;
}) {
  const MUTUALLY_EXCLUSIVE: Record<string, string> = {
    wasSentByApi: "wasNotSentByApi",
    wasNotSentByApi: "wasSentByApi",
    fromMeYes: "fromMeNo",
    fromMeNo: "fromMeYes",
    isGroupYes: "isGroupNo",
    isGroupNo: "isGroupYes",
  };

  const toggleExclude = (option: string) => {
    if (excludeMessages.includes(option)) {
      onExcludeMessagesChange(excludeMessages.filter((e) => e !== option));
    } else {
      const opposite = MUTUALLY_EXCLUSIVE[option];
      const filtered = opposite ? excludeMessages.filter((e) => e !== opposite) : excludeMessages;
      onExcludeMessagesChange([...filtered, option]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="webhook-enabled">Webhook Habilitado</Label>
        <Switch
          id="webhook-enabled"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>
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
      <Collapsible>
        <CollapsibleTrigger className="flex items-center justify-between w-full group">
          <Label className="cursor-pointer">Escutar Eventos</Label>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
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
        </CollapsibleContent>
      </Collapsible>
      <Collapsible>
        <CollapsibleTrigger className="flex items-center justify-between w-full group">
          <Label className="cursor-pointer">Excluir dos eventos escutados</Label>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <div className="flex flex-wrap gap-2">
            {EXCLUDE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => toggleExclude(option)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  excludeMessages.includes(option)
                    ? "bg-destructive text-destructive-foreground border-destructive"
                    : "bg-secondary text-muted-foreground border-border hover:border-destructive/50"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Selecione os tipos de mensagens que deseja excluir do webhook
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
