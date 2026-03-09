import { useState, useEffect, useRef, memo } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Smartphone, 
  QrCode, 
  Trash2, 
  Settings2, 
  Loader2, 
  Wifi, 
  WifiOff, 
  RefreshCw,
  MoreVertical,
  Unlink,
  Power,
  Copy,
  Phone,
  UserPlus,
  User,
  RotateCcw,
  MessageSquare,
  Users,
  Eye,
  EyeOff,
  Link2
} from "lucide-react";
import { Instance, useInstances } from "@/hooks/useInstances";
import { checkServerHealth } from "@/hooks/instances/instanceApi";
import { useGHLUsers, GHLUser } from "@/hooks/useGHLUsers";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner";
import { lazy, Suspense } from "react";
import { Loader2 as LazyLoader } from "lucide-react";
import type { EmbedVisibleOptions } from "./ConfigureEmbedTabsDialog";

// Lazy-load heavy dialog components for smaller initial bundle
const AssignGHLUserDialog = lazy(() => import("./AssignGHLUserDialog").then(m => ({ default: m.AssignGHLUserDialog })));
const WebhookConfigDialog = lazy(() => import("./WebhookConfigDialog").then(m => ({ default: m.WebhookConfigDialog })));
const ManageMessagesDialog = lazy(() => import("./ManageMessagesDialog").then(m => ({ default: m.ManageMessagesDialog })));
const GroupManagerDialog = lazy(() => import("./GroupManagerDialog").then(m => ({ default: m.GroupManagerDialog })));
const ConfigureEmbedTabsDialog = lazy(() => import("./ConfigureEmbedTabsDialog").then(m => ({ default: m.ConfigureEmbedTabsDialog })));
const LinkToSubaccountDialog = lazy(() => import("./LinkToSubaccountDialog").then(m => ({ default: m.LinkToSubaccountDialog })));

const DialogFallback = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
    <LazyLoader className="h-6 w-6 animate-spin text-primary" />
  </div>
);
import { supabase } from "@/integrations/supabase/client";

interface InstanceCardProps {
  instance: Instance;
  allInstances?: Instance[];
}

export const InstanceCard = memo(function InstanceCard({ instance, allInstances }: InstanceCardProps) {
  const { 
    deleteInstance, 
    getQRCode, 
    updateInstanceWebhook, 
    syncInstanceStatus,
    connectInstance,
    disconnectInstance,
    updateInstanceGHLUser,
    updateInstanceOfficialApi,
    reconfigureWebhook,
    unlinkInstance
  } = useInstances();
  const { fetchLocationUsers } = useGHLUsers();
  const { settings } = useSettings();
  
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loadingQR, setLoadingQR] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteFromUazapi, setDeleteFromUazapi] = useState(false);
  const [ignoreGroups, setIgnoreGroups] = useState(instance.ignore_groups || false);
  const [syncing, setSyncing] = useState(false);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(instance.phone || null);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(instance.profile_pic_url || null);
  const profilePicRef = useRef(profilePicUrl);
  const [assignUserDialogOpen, setAssignUserDialogOpen] = useState(false);
  const [ghlUserName, setGhlUserName] = useState<string | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [messagesDialogOpen, setMessagesDialogOpen] = useState(false);
  const [groupManagerDialogOpen, setGroupManagerDialogOpen] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [localStatus, setLocalStatus] = useState<"connected" | "connecting" | "disconnected" | null>(null);
  const [embedTabsDialogOpen, setEmbedTabsDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [embedVisibleOptions, setEmbedVisibleOptions] = useState<EmbedVisibleOptions | null>(
    (instance as any).embed_visible_options || null
  );
  const [subaccount, setSubaccount] = useState<{
    id: string;
    location_id: string;
    ghl_access_token: string | null;
    ghl_token_expires_at: string | null;
    user_id: string;
  } | null>(null);

  // Fetch subaccount data for GHL user assignment
  useEffect(() => {
    const fetchSubaccount = async () => {
      const { data } = await supabase
        .from("ghl_subaccounts")
        .select("id, location_id, ghl_access_token, ghl_token_expires_at, user_id")
        .eq("id", instance.subaccount_id)
        .single();
      
      if (data) {
        setSubaccount(data);
        
        // Fetch GHL user name if assigned (using OAuth token)
        if (instance.ghl_user_id && data.ghl_access_token) {
          try {
            const users = await fetchLocationUsers(data.location_id, data.ghl_access_token, {
              subaccountUserId: data.user_id,
              tokenExpiresAt: data.ghl_token_expires_at,
            });
            const user = users.find(u => u.id === instance.ghl_user_id);
            if (user) {
              setGhlUserName(user.name);
            }
          } catch (error) {
            console.error("Failed to fetch GHL user name:", error);
          }
        }
      }
    };
    fetchSubaccount();
  }, [instance.subaccount_id, instance.ghl_user_id]);

  // Sync local state when prop changes from React Query refetch
  useEffect(() => {
    setLocalStatus(null);
  }, [instance.instance_status]);

  useEffect(() => {
    if (instance.profile_pic_url && instance.profile_pic_url !== profilePicUrl) {
      setProfilePicUrl(instance.profile_pic_url);
    }
  }, [instance.profile_pic_url]);

  useEffect(() => {
    if (instance.phone && instance.phone !== connectedPhone) {
      setConnectedPhone(instance.phone);
    }
  }, [instance.phone]);

  // Fetch phone number and profile pic on mount
  useEffect(() => {
    if (!connectedPhone || !profilePicUrl) {
      syncInstanceStatus.mutateAsync(instance).then((result) => {
        if (result?.phone) {
          setConnectedPhone(result.phone);
        }
        if (result?.profilePicUrl) {
          setProfilePicUrl(result.profilePicUrl);
        }
      }).catch(() => {});
    }
  }, []);

  // Auto-refresh status when QR dialog is open
  useEffect(() => {
    if (!qrDialogOpen) return;

    const interval = setInterval(async () => {
      try {
        const result = await syncInstanceStatus.mutateAsync(instance);
        if (result?.status === "connected") {
          if (result?.phone) setConnectedPhone(result.phone);
          if (result?.profilePicUrl) setProfilePicUrl(result.profilePicUrl);
          setLocalStatus("connected");
          setQrDialogOpen(false);
          toast.success("WhatsApp conectado com sucesso!");
        }
      } catch {
        // Ignore errors during auto-refresh
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [qrDialogOpen]);

  // After connection, retry fetching profile pic if missing
  useEffect(() => {
    profilePicRef.current = profilePicUrl;
  }, [profilePicUrl]);

  useEffect(() => {
    if (localStatus !== "connected" || profilePicUrl) return;

    let cancelled = false;
    const retryDelays = [2000, 5000, 10000, 20000];

    const retries = retryDelays.map((delay) =>
      setTimeout(async () => {
        if (cancelled || profilePicRef.current) return;
        try {
          const result = await syncInstanceStatus.mutateAsync(instance);
          if (result?.profilePicUrl) {
            setProfilePicUrl(result.profilePicUrl);
            profilePicRef.current = result.profilePicUrl;
          }
          if (result?.phone) setConnectedPhone(result.phone);
        } catch {}
      }, delay)
    );

    return () => {
      cancelled = true;
      retries.forEach(clearTimeout);
    };
  }, [localStatus]);

  const handleConnect = async () => {
    setLoadingQR(true);
    try {
      // First check real status from UAZAPI
      const statusResult = await syncInstanceStatus.mutateAsync(instance);
      
      // If truly connected on UAZAPI, update local state and inform user
      if (statusResult?.status === "connected") {
        if (statusResult?.phone) {
          setConnectedPhone(statusResult.phone);
        }
        if (statusResult?.profilePicUrl) {
          setProfilePicUrl(statusResult.profilePicUrl);
        }
        setLocalStatus("connected");
        toast.success("Esta instância já está conectada!");
        setLoadingQR(false);
        return;
      }
      
      // If status is disconnected, clear cached phone/pic locally
      if (statusResult?.status === "disconnected") {
        setConnectedPhone(null);
        setProfilePicUrl(null);
        setLocalStatus("disconnected");
      }
      
      // Connect and get QR code in one call
      const qr = await connectInstance(instance);
      if (qr) {
        setQrCode(qr);
        setQrDialogOpen(true);
      } else {
        // Fallback: try getQRCode if connect didn't return QR
        const qrFallback = await getQRCode(instance);
        if (qrFallback) {
          setQrCode(qrFallback);
          setQrDialogOpen(true);
        } else {
          throw new Error("QR Code não disponível. Verifique se a instância existe na UAZAPI.");
        }
      }
    } catch (error: any) {
      const errorMsg = error.message || "Erro ao conectar";
      if (errorMsg.includes("Maximum number of instances") || errorMsg.includes("limite")) {
        toast.error("Limite de instâncias atingido na UAZAPI");
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setLoadingQR(false);
    }
  };

  // Force regenerate QR Code without checking status - used by "Gerar Novo QR Code" button
  const handleRegenerateQR = async () => {
    setLoadingQR(true);
    setQrCode(null); // Clear current QR to show loading
    try {
      const qr = await connectInstance(instance);
      if (qr) {
        setQrCode(qr);
      } else {
        // Fallback: try getQRCode if connect didn't return QR
        const qrFallback = await getQRCode(instance);
        if (qrFallback) {
          setQrCode(qrFallback);
        } else {
          toast.error("QR Code não disponível");
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao gerar novo QR Code");
    } finally {
      setLoadingQR(false);
    }
  };

  const handleSyncStatus = async () => {
    setSyncing(true);
    try {
      // Check server health on demand
      checkServerHealth(instance, settings?.uazapi_base_url).then(setServerOnline).catch(() => setServerOnline(false));
      
      const result = await syncInstanceStatus.mutateAsync(instance);
      if (result?.phone) {
        setConnectedPhone(result.phone);
      }
      if (result?.profilePicUrl) {
        setProfilePicUrl(result.profilePicUrl);
      }
      setLocalStatus(result.status);
      toast.success("Status atualizado!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveWebhook = ({ webhookUrl, ignoreGroups: ig, webhookEvents, createNew, enabled, webhookId, excludeMessages }: { webhookUrl: string; ignoreGroups: boolean; webhookEvents: string[]; createNew: boolean; enabled: boolean; webhookId?: string; excludeMessages?: string }) => {
    updateInstanceWebhook.mutate({
      instance,
      webhookUrl,
      ignoreGroups: ig,
      webhookEvents,
      createNew,
      enabled,
      webhookId,
      excludeMessages,
    });
    setWebhookDialogOpen(false);
  };

  const handleDelete = () => {
    if (deleteFromUazapi) {
      deleteInstance.mutate({ instance, deleteFromUazapi: true });
    } else {
      // Unlink: remove subaccount_id but keep instance
      unlinkInstance.mutate(instance);
    }
    setDeleteDialogOpen(false);
  };

  const handleDisconnect = () => {
    disconnectInstance.mutate(instance, {
      onSuccess: () => {
        setConnectedPhone(null);
        setProfilePicUrl(null);
        setLocalStatus("disconnected");
      }
    });
  };

  const copyToken = () => {
    navigator.clipboard.writeText(instance.uazapi_instance_token);
    toast.success("Token copiado!");
  };

  const formatPhoneNumber = (phone: string) => {
    // Format phone number for display (e.g., +55 11 99999-9999)
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 12) {
      return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    } else if (cleaned.length >= 10) {
      return `+${cleaned.slice(0, 2)} ${cleaned.slice(2)}`;
    }
    return phone;
  };

  const statusConfig = {
    connected: {
      label: "Conectado",
      className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      icon: Wifi,
    },
    connecting: {
      label: "Conectando",
      className: "bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse",
      icon: Wifi,
    },
    disconnected: {
      label: "Desconectado",
      className: "bg-muted/50 text-muted-foreground border-muted",
      icon: WifiOff,
    },
  };

  const effectiveStatus = localStatus ?? instance.instance_status;
  const status = statusConfig[effectiveStatus];
  const StatusIcon = status.icon;
  const isConnected = effectiveStatus === "connected";

  return (
    <>
      <Card className={`bg-gradient-to-br from-card/80 via-card/60 to-card/90 backdrop-blur-sm border-border/50 hover:border-primary/40 transition-all duration-300 group max-w-[350px] min-h-[340px] rounded-sm flex flex-col ${isConnected ? "snake-border border-transparent" : "overflow-hidden"}`}>
        <CardContent className="p-0 flex flex-col flex-1">
          {/* Header Section */}
          <div className="p-4 pb-2 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Profile Picture or Default Icon */}
                {profilePicUrl ? (
                  <Avatar className="h-14 w-14 shrink-0 border-2 border-primary/20">
                    <AvatarImage src={profilePicUrl} alt="WhatsApp Profile" />
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20">
                      <Smartphone className="h-6 w-6 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="p-2.5 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl shrink-0">
                    <Smartphone className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-card-foreground truncate text-lg">
                      {instance.instance_name}
                    </h3>
                    {serverOnline !== null && (
                      <div 
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          serverOnline ? "bg-emerald-500" : "bg-destructive"
                        }`}
                        title={serverOnline ? "Servidor UAZAPI online" : "Servidor UAZAPI offline"}
                      />
                    )}
                    {!isConnected && (
                      <Badge variant="outline" className={`${status.className} shrink-0`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {status.label}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Phone number */}
                  {connectedPhone ? (
                    <div className="flex items-center gap-1.5 mt-2.5 whitespace-nowrap">
                      <Phone className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span className="text-sm text-emerald-400 font-medium">
                        {formatPhoneNumber(connectedPhone)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      Número não disponível
                    </p>
                  )}
                  
                  {/* GHL User */}
                  {instance.ghl_user_id && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <User className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs text-muted-foreground">
                        {ghlUserName || instance.ghl_user_id}
                      </span>
                    </div>
                  )}

                  {/* Official API badge */}
                  {instance.is_official_api && (
                    <Badge variant="outline" className="mt-1 bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px]">
                      API Oficial
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-60 hover:opacity-100"
                    title="Configurar abas do embed"
                    onClick={() => setEmbedTabsDialogOpen(true)}
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 hover:opacity-100">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border-border">
                  {settings?.track_id && (
                    <DropdownMenuItem onClick={async () => {
                      const trackId = settings.track_id!;
                      try {
                        await navigator.clipboard.writeText(trackId);
                      } catch {
                        const ta = document.createElement("textarea");
                        ta.value = trackId;
                        ta.style.position = "fixed";
                        ta.style.opacity = "0";
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand("copy");
                        document.body.removeChild(ta);
                      }
                      toast.success("Track ID copiado!");
                    }}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar Track ID
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setWebhookDialogOpen(true)}>
                    <Settings2 className="h-4 w-4 mr-2" />
                    Configurar Webhook
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMessagesDialogOpen(true)}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Mensagem em massa (beta)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setGroupManagerDialogOpen(true)}>
                    <Users className="h-4 w-4 mr-2" />
                    Gerenciador de Grupos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setAssignUserDialogOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Atribuir Usuário GHL
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => updateInstanceOfficialApi.mutate({ 
                      instanceId: instance.id, 
                      isOfficialApi: !instance.is_official_api 
                    })}
                  >
                    <Smartphone className="h-4 w-4 mr-2" />
                    {instance.is_official_api ? "Desativar API Oficial" : "Ativar API Oficial"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {!instance.subaccount_id && (
                    <DropdownMenuItem 
                      onClick={() => setLinkDialogOpen(true)}
                      className="text-primary"
                    >
                      <Link2 className="h-4 w-4 mr-2" />
                      Vincular a Subconta
                    </DropdownMenuItem>
                  )}
                  {instance.subaccount_id && (
                  <DropdownMenuItem 
                    onClick={() => {
                      setDeleteFromUazapi(false);
                      setDeleteDialogOpen(true);
                    }}
                    className="text-amber-400"
                  >
                    <Unlink className="h-4 w-4 mr-2" />
                    Desvincular
                  </DropdownMenuItem>
                  )}
                  <DropdownMenuItem 
                    onClick={() => {
                      setDeleteFromUazapi(true);
                      setDeleteDialogOpen(true);
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir Permanentemente
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSyncStatus}
                  disabled={syncing}
                  className="h-8 w-8 border-border/50 opacity-60 hover:opacity-100"
                  title="Atualizar Status"
                >
                  <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </div>

          {/* Credentials Section */}
          <div className="px-4 pt-3 pb-3 space-y-1 border-t border-border/30 mt-3">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Copy className="h-3 w-3 text-muted-foreground shrink-0" />
              <span
                className="text-sm text-muted-foreground font-mono truncate max-w-[300px] cursor-pointer hover:text-foreground transition-colors"
                title={instance.uazapi_base_url || settings?.uazapi_base_url || "Não configurada"}
                onClick={(e) => {
                  e.stopPropagation();
                  const url = instance.uazapi_base_url || settings?.uazapi_base_url;
                  if (url) { navigator.clipboard.writeText(url); toast.success("Base URL copiada!"); }
                }}
              >
                {instance.uazapi_base_url || settings?.uazapi_base_url || "URL não configurada"}
              </span>
            </div>
            <div className={`flex items-start gap-1.5 ${showToken ? '' : 'whitespace-nowrap'}`}>
              <Copy className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
              <span
                className={`text-sm text-muted-foreground font-mono cursor-pointer hover:text-foreground transition-colors ${showToken ? 'break-all' : 'truncate max-w-[250px]'}`}
                title="Clique para copiar o token"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(instance.uazapi_instance_token);
                  toast.success("Token copiado!");
                }}
              >
                {showToken
                  ? instance.uazapi_instance_token
                  : `${instance.uazapi_instance_token.slice(0, 12)}...${instance.uazapi_instance_token.slice(-4)}`}
              </span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                onClick={(e) => { e.stopPropagation(); setShowToken(!showToken); }}
                title={showToken ? "Ocultar token" : "Ver token completo"}
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Status + Actions */}
          {isConnected ? (
            <>
               <div className="mt-4 mb-2 flex items-center justify-center gap-2 py-5 bg-emerald-500/15 border-y border-emerald-500/30">
                 <Wifi className="h-5 w-5 text-emerald-400" />
                 <span className="text-sm text-emerald-400 font-bold">WhatsApp Conectado</span>
              </div>
              <div className="px-4 pb-4 flex items-center justify-center mt-auto">
                <Button
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnectInstance.isPending}
                  className="bg-destructive hover:bg-destructive/90 h-9 px-4 text-white"
                >
                  <Power className="h-3.5 w-3.5 text-white" />
                  <span className="w-px h-4 bg-white/30" />
                  Desconectar
                </Button>
              </div>
            </>
          ) : (
            <>
              <div 
                className="mx-4 mb-2 flex flex-col items-center justify-center py-3 border border-dashed border-border/70 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                onClick={handleConnect}
              >
                {loadingQR ? (
                  <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <QrCode className="h-10 w-10 text-muted-foreground mb-1.5" />
                    <span className="text-sm text-muted-foreground">
                      Clique para conectar
                    </span>
                  </>
                )}
              </div>
              <div className="px-4 pb-4 flex items-center justify-center mt-auto">
                <Button
                  size="sm"
                  onClick={handleConnect}
                  disabled={loadingQR}
                  className="bg-primary hover:bg-primary/90 h-9 px-4"
                >
                  <QrCode className="h-3.5 w-3.5 mr-1.5" />
                  Conectar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete/Unlink Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {deleteFromUazapi ? "Excluir permanentemente?" : "Desvincular instância?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFromUazapi ? (
                <>
                  A instância <strong>{instance.instance_name}</strong> será excluída permanentemente do sistema e do servidor UAZAPI.
                  <br /><br />
                  <span className="text-destructive font-medium">Esta ação não pode ser desfeita.</span>
                </>
              ) : (
                <>
                  A instância <strong>{instance.instance_name}</strong> será desvinculada da subconta, mas continuará disponível na aba "Todas as Instâncias" para vincular novamente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className={deleteFromUazapi ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-orange-500 hover:bg-orange-600 text-white"}
              disabled={deleteInstance.isPending || unlinkInstance.isPending}
            >
              {(deleteInstance.isPending || unlinkInstance.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {deleteFromUazapi ? "Excluir" : "Desvincular"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={(open) => {
        setQrDialogOpen(open);
        if (!open) handleSyncStatus();
      }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-card-foreground">Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Escaneie o QR Code com seu WhatsApp para conectar
            </DialogDescription>
          </DialogHeader>
          {qrCode ? (
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-white rounded-xl">
                <img
                  src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                  alt="QR Code"
                  className="w-64 h-64"
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Abra o WhatsApp → Menu → Dispositivos conectados → Conectar dispositivo
              </p>
              <Button onClick={handleRegenerateQR} variant="outline" className="border-border" disabled={loadingQR}>
                {loadingQR ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Gerar Novo QR Code
              </Button>
            </div>
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lazy-loaded dialogs - only fetched when opened */}
      <Suspense fallback={<DialogFallback />}>
        {webhookDialogOpen && (
          <WebhookConfigDialog
            open={webhookDialogOpen}
            onOpenChange={setWebhookDialogOpen}
            instance={instance}
            onSave={handleSaveWebhook}
            isSaving={updateInstanceWebhook.isPending}
            ignoreGroups={ignoreGroups}
            onIgnoreGroupsChange={setIgnoreGroups}
          />
        )}

        {assignUserDialogOpen && (
          <AssignGHLUserDialog
            open={assignUserDialogOpen}
            onOpenChange={setAssignUserDialogOpen}
            instanceName={instance.instance_name}
            currentUserId={instance.ghl_user_id}
            subaccount={subaccount}
            onAssign={(userId) => {
              updateInstanceGHLUser.mutate({ instanceId: instance.id, ghlUserId: userId });
              setAssignUserDialogOpen(false);
            }}
            isAssigning={updateInstanceGHLUser.isPending}
          />
        )}

        {messagesDialogOpen && (
          <ManageMessagesDialog
            open={messagesDialogOpen}
            onOpenChange={setMessagesDialogOpen}
            instance={instance}
            allInstances={allInstances}
          />
        )}

        {embedTabsDialogOpen && (
          <ConfigureEmbedTabsDialog
            open={embedTabsDialogOpen}
            onOpenChange={setEmbedTabsDialogOpen}
            instanceId={instance.id}
            instanceName={instance.instance_name}
            currentOptions={embedVisibleOptions}
            onSaved={setEmbedVisibleOptions}
          />
        )}

        {groupManagerDialogOpen && (
          <GroupManagerDialog
            open={groupManagerDialogOpen}
            onOpenChange={setGroupManagerDialogOpen}
            instance={instance}
          />
        )}

        {linkDialogOpen && (
          <LinkToSubaccountDialog
            open={linkDialogOpen}
            onOpenChange={setLinkDialogOpen}
            instance={instance}
          />
        )}
      </Suspense>
    </>
  );
});
