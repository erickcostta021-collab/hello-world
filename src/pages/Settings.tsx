import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/hooks/useAuth";
import { useAccountStatus } from "@/hooks/useAccountStatus";
import { CANONICAL_APP_ORIGIN, getOAuthRedirectUri } from "@/lib/canonicalOrigin";
import { supabase } from "@/integrations/supabase/client";
import { Save, Loader2, Eye, EyeOff, Info, CheckCircle2, Wand2, Copy, Check, Lock, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RegisteredUsersPanel } from "@/components/settings/RegisteredUsersPanel";
import { ChangePasswordDialog } from "@/components/settings/ChangePasswordDialog";
import { CdnScriptsPanel } from "@/components/settings/CdnScriptsPanel";

const ADMIN_EMAILS = ["erickcostta021@gmail.com", "erickcostta.br@gmail.com"];

export default function Settings() {
  const { settings, isLoading, updateSettings, applyGlobalWebhook, getOAuthUrl } = useSettings();
  const { user } = useAuth();
  const { accountMode } = useAccountStatus();
  const location = useLocation();
  const isAdmin = ADMIN_EMAILS.includes(user?.email || "");
  const isManagedMode = accountMode === "instances" && !isAdmin;
  const [showTokens, setShowTokens] = useState(false);
  const [copiedTrackId, setCopiedTrackId] = useState(false);
  const [showTrackId, setShowTrackId] = useState(false);
  const [isRegeneratingTrackId, setIsRegeneratingTrackId] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  // For non-admins, fetch the admin's webhook URL to display
  const { data: adminWebhookUrl } = useQuery({
    queryKey: ["admin-webhook-url"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_admin_webhook_url");
      return data as string | null;
    },
    enabled: !isAdmin,
  });

  // Open password dialog if navigated with state
  useEffect(() => {
    if (location.state?.openPasswordChange) {
      setPasswordDialogOpen(true);
      // Clear the state so it doesn't reopen on re-render
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);
  
  const [formData, setFormData] = useState({
    ghl_agency_token: "",
    ghl_client_id: "",
    ghl_client_secret: "",
    ghl_conversation_provider_id: "",
    uazapi_admin_token: "",
    uazapi_base_url: "",
    global_webhook_url: "",
    queue_enabled: true,
    queue_batch_ms: 1000,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        ghl_agency_token: settings.ghl_agency_token || "",
        ghl_client_id: settings.ghl_client_id || "",
        ghl_client_secret: settings.ghl_client_secret || "",
        ghl_conversation_provider_id: settings.ghl_conversation_provider_id || "",
        uazapi_admin_token: settings.uazapi_admin_token || "",
        uazapi_base_url: settings.uazapi_base_url || "",
        global_webhook_url: settings.global_webhook_url || "",
        queue_enabled: (settings as any).queue_enabled ?? true,
        queue_batch_ms: (settings as any).queue_batch_ms ?? 1000,
      });
    }
  }, [settings]);

  const handleSave = async () => {
    // Save settings first
    await new Promise<void>((resolve, reject) => {
      updateSettings.mutate(formData, {
        onSuccess: () => resolve(),
        onError: (err) => reject(err),
      });
    });

    // If admin changed the global webhook URL, propagate to all users
    if (isAdmin && formData.global_webhook_url) {
      try {
        await supabase.rpc("propagate_global_webhook", { p_webhook_url: formData.global_webhook_url });
        toast.success("Webhook propagado para todos os usuários!");
      } catch (err) {
        console.error("Error propagating webhook:", err);
      }
    }

    // If global webhook URL is set, apply it to all instances
    if (formData.global_webhook_url) {
      applyGlobalWebhook.mutate(formData.global_webhook_url);
    }
  };


  const oauthUrl = getOAuthUrl();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const redirectUri = getOAuthRedirectUri();
  const inboundWebhookUrl = `https://webhooks.bridgeapi.chat/webhook-inbound`;
  const outboundWebhookUrl = `https://webhooks.bridgeapi.chat/webhook-outbound`;
  const isPreviewDomain = window.location.origin !== CANONICAL_APP_ORIGIN;

  const isWrongWebhookConfigured =
    !!formData.global_webhook_url &&
    /webhook\.dev\.atllassa\.com/i.test(formData.global_webhook_url);

  // Set default webhook URL if not set
  useEffect(() => {
    if (settings && !formData.global_webhook_url && inboundWebhookUrl) {
      setFormData(prev => ({ ...prev, global_webhook_url: inboundWebhookUrl }));
    }
  }, [settings, inboundWebhookUrl]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">
            Configure OAuth, tokens de API e preferências
          </p>
        </div>

        <Tabs defaultValue={isAdmin ? "oauth" : "integrations"} className="w-full">
          <TabsList className={`grid w-full ${isAdmin ? "grid-cols-4" : "grid-cols-1"}`}>
            {isAdmin && <TabsTrigger value="oauth">OAuth GHL</TabsTrigger>}
            <TabsTrigger value="integrations">Integrações</TabsTrigger>
            {isAdmin && <TabsTrigger value="users">Usuários</TabsTrigger>}
            {isAdmin && <TabsTrigger value="cdn">CDN</TabsTrigger>}
          </TabsList>

          {isAdmin && (
          <TabsContent value="oauth" className="space-y-6 mt-6">
            {/* OAuth Configuration */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-card-foreground">Credenciais OAuth 2.0</CardTitle>
                <CardDescription>
                  Configure sua app do GHL Marketplace para OAuth automático
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <strong>Redirect URI:</strong> Use este URL ao configurar sua app no GHL Marketplace:
                    <code className="block mt-1 p-2 bg-secondary rounded text-xs break-all">
                      {redirectUri}
                    </code>
                    {isPreviewDomain && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Você está no <strong>Preview</strong>. Não copie o domínio do preview para o Marketplace.
                        Use sempre o domínio publicado acima.
                      </p>
                    )}
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="ghl-client-id">Client ID</Label>
                  <Input
                    id="ghl-client-id"
                    type={showTokens ? "text" : "password"}
                    value={formData.ghl_client_id}
                    onChange={(e) => setFormData({ ...formData, ghl_client_id: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ghl-client-secret">Client Secret</Label>
                  <Input
                    id="ghl-client-secret"
                    type={showTokens ? "text" : "password"}
                    value={formData.ghl_client_secret}
                    onChange={(e) => setFormData({ ...formData, ghl_client_secret: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ghl-provider-id">Conversation Provider ID (opcional)</Label>
                  <Input
                    id="ghl-provider-id"
                    type="text"
                    value={formData.ghl_conversation_provider_id}
                    onChange={(e) => setFormData({ ...formData, ghl_conversation_provider_id: e.target.value })}
                    placeholder="ID do provedor de conversas"
                    className="bg-secondary border-border"
                  />
                  <p className="text-xs text-muted-foreground">
                    Necessário apenas se sua app usa Custom Conversation Provider
                  </p>
                </div>

              </CardContent>
            </Card>

            {/* Webhooks Info */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-card-foreground">URLs de Webhook</CardTitle>
                <CardDescription>
                  Configure estes webhooks no GHL para mensagens bidirecionais
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Webhook Inbound (UAZAPI → GHL)
                  </Label>
                  <code className="block p-2 bg-secondary rounded text-xs break-all">
                    {inboundWebhookUrl}
                  </code>
                  <p className="text-xs text-muted-foreground">
                    Configure como Webhook Global da UAZAPI
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Webhook Outbound (GHL → WhatsApp)
                  </Label>
                  <code className="block p-2 bg-secondary rounded text-xs break-all">
                    {outboundWebhookUrl}
                  </code>
                  <p className="text-xs text-muted-foreground">
                    Configure nas Workflows do GHL para enviar mensagens
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          )}

          <TabsContent value="integrations" className="space-y-6 mt-6">
            {/* GHL Settings - Always visible for all users */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-card-foreground">GoHighLevel (GHL)</CardTitle>
                <CardDescription>
                  Token de agência para sincronizar subcontas (Opcional)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ghl-token">Token de Agência</Label>
                  <div className="relative">
                    <Input
                      id="ghl-token"
                      type={showTokens ? "text" : "password"}
                      value={formData.ghl_agency_token}
                      onChange={(e) => setFormData({ ...formData, ghl_agency_token: e.target.value })}
                      placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="bg-secondary border-border pr-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Encontre seu token em: GHL → Conta nível agência → Configurações → Integrações Privado
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* UAZAPI Settings - Hidden for managed mode users */}
            {!isManagedMode && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-card-foreground">UAZAPI</CardTitle>
                <CardDescription>
                  Configurações para criar e gerenciar instâncias WhatsApp
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isWrongWebhookConfigured && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      Detectei que o <strong>Webhook Global</strong> está apontando para um endpoint de outro fluxo.
                      Para evitar loop infinito, use apenas o webhook do sistema abaixo.
                      <div className="mt-3 flex flex-col gap-2">
                        <code className="block p-2 bg-secondary rounded text-xs break-all">
                          {inboundWebhookUrl}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-border w-fit"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, global_webhook_url: inboundWebhookUrl }));
                            toast.success("Webhook do sistema selecionado. Clique em 'Salvar Configurações' para aplicar.");
                          }}
                        >
                          <Wand2 className="h-4 w-4 mr-2" />
                          Usar webhook do sistema
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="uazapi-url">URL Base da API</Label>
                  <Input
                    id="uazapi-url"
                    type="text"
                    value={formData.uazapi_base_url}
                    onChange={(e) => setFormData({ ...formData, uazapi_base_url: e.target.value })}
                    placeholder="https://seu-servidor.uazapi.com"
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uazapi-token">Token Admin</Label>
                  <Input
                    id="uazapi-token"
                    type={showTokens ? "text" : "password"}
                    value={formData.uazapi_admin_token}
                    onChange={(e) => setFormData({ ...formData, uazapi_admin_token: e.target.value })}
                    placeholder="Seu token admin da UAZAPI"
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webhook-url" className="flex items-center gap-2">
                    Webhook URL Global (UAZAPI)
                    {!isAdmin && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="webhook-url"
                      type="text"
                      value={isAdmin ? formData.global_webhook_url : (adminWebhookUrl || formData.global_webhook_url)}
                      onChange={(e) => isAdmin && setFormData({ ...formData, global_webhook_url: e.target.value })}
                      readOnly={!isAdmin}
                      placeholder="https://seu-webhook.com/endpoint"
                      className={`bg-secondary border-border ${!isAdmin ? "cursor-default opacity-75" : ""}`}
                    />
                    {!isAdmin && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="border-border shrink-0"
                        onClick={() => {
                          const url = adminWebhookUrl || formData.global_webhook_url;
                          if (url) {
                            navigator.clipboard.writeText(url);
                            toast.success("Webhook URL copiado!");
                          }
                        }}
                        disabled={!(adminWebhookUrl || formData.global_webhook_url)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isAdmin
                      ? "Ao salvar, este webhook será propagado para todos os usuários automaticamente."
                      : "URL do webhook global configurado automaticamente."}
                  </p>
                </div>
              </CardContent>
            </Card>
            )}

            {isAdmin && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-card-foreground">Fila de Mensagens (Anti-Rajada)</CardTitle>
                <CardDescription>
                  Controla o acúmulo de mensagens rápidas para envio na ordem correta ao GHL
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Fila ativada</Label>
                    <p className="text-xs text-muted-foreground">
                      Quando ativada, mensagens em rajada são ordenadas antes do envio
                    </p>
                  </div>
                  <Switch
                    checked={formData.queue_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, queue_enabled: checked })}
                  />
                </div>

                {formData.queue_enabled && (
                  <div className="space-y-2">
                    <Label htmlFor="queue-batch-ms">Janela de acúmulo (ms)</Label>
                    <Input
                      id="queue-batch-ms"
                      type="number"
                      min={100}
                      max={5000}
                      step={100}
                      value={formData.queue_batch_ms}
                      onChange={(e) => setFormData({ ...formData, queue_batch_ms: parseInt(e.target.value) || 1000 })}
                      className="bg-secondary border-border w-32"
                    />
                    <p className="text-xs text-muted-foreground">
                      Tempo de espera para acumular mensagens rápidas antes de ordenar. Padrão: 1000ms. Recomendado: 500-1000ms.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
            )}

            {/* Track ID - Installation Identifier */}
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="text-card-foreground">Track ID</CardTitle>
                  <CardDescription>
                    Identificador único usado para evitar loops de mensagens no webhook.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  Sistema
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    type={showTrackId ? "text" : "password"}
                    value={settings?.track_id || ""}
                    placeholder="Gerando..."
                    className="bg-secondary border-border font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setShowTrackId(!showTrackId)}
                  >
                    {showTrackId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => {
                      if (settings?.track_id) {
                        navigator.clipboard.writeText(settings.track_id);
                        setCopiedTrackId(true);
                        toast.success("Track ID copiado!");
                        setTimeout(() => setCopiedTrackId(false), 2000);
                      }
                    }}
                    disabled={!settings?.track_id}
                  >
                    {copiedTrackId ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-border gap-1.5"
                    disabled={isRegeneratingTrackId}
                    onClick={async () => {
                      if (!user) return;
                      setIsRegeneratingTrackId(true);
                      try {
                        const newTrackId = crypto.randomUUID();
                        await updateSettings.mutateAsync({ track_id: newTrackId } as any);
                        toast.success("Track ID regenerado com sucesso!");
                      } catch {
                        toast.error("Erro ao regenerar Track ID");
                      } finally {
                        setIsRegeneratingTrackId(false);
                      }
                    }}
                  >
                    {isRegeneratingTrackId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Regenerar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="users" className="space-y-6 mt-6">
              <RegisteredUsersPanel />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="cdn" className="space-y-6 mt-6">
              <CdnScriptsPanel />
            </TabsContent>
          )}
        </Tabs>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setShowTokens(!showTokens)}
            className="border-border"
          >
            {showTokens ? (
              <>
                <EyeOff className="h-4 w-4 mr-2" />
                Ocultar Tokens
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                Mostrar Tokens
              </>
            )}
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateSettings.isPending || applyGlobalWebhook.isPending}
            className="bg-primary hover:bg-primary/90"
          >
            {(updateSettings.isPending || applyGlobalWebhook.isPending) ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Configurações
          </Button>
        </div>
      </div>

      <ChangePasswordDialog 
        open={passwordDialogOpen} 
        onOpenChange={setPasswordDialogOpen} 
      />
    </DashboardLayout>
  );
}
