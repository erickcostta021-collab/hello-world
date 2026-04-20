import { useState, useEffect, useRef, lazy, Suspense } from "react";

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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Smartphone, 
  QrCode, 
  Loader2, 
  Wifi, 
  WifiOff, 
  RefreshCw,
  MoreVertical,
  Power,
  Phone,
  UserPlus,
  User,
  Copy,
  Link,
  Webhook,
  MessageSquare,
  Users,
  Eye,
  EyeOff,
  Pencil,
  Check,
  X,
  Tag,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const EmbedAssignUserDialog = lazy(() => import("./EmbedAssignUserDialog").then(m => ({ default: m.EmbedAssignUserDialog })));
const WebhookConfigDialog = lazy(() => import("@/components/dashboard/WebhookConfigDialog").then(m => ({ default: m.WebhookConfigDialog })));
const ManageMessagesDialog = lazy(() => import("@/components/dashboard/ManageMessagesDialog").then(m => ({ default: m.ManageMessagesDialog })));
const GroupManagerDialog = lazy(() => import("@/components/dashboard/GroupManagerDialog").then(m => ({ default: m.GroupManagerDialog })));
export interface EmbedVisibleOptions {
  assign_user?: boolean;
  webhook?: boolean;
  
  base_url?: boolean;
  token?: boolean;
  connect?: boolean;
  disconnect?: boolean;
  status?: boolean;
  messages?: boolean;
  api_oficial?: boolean;
  group_manager?: boolean;
  edit_name?: boolean;
  auto_tag?: boolean;
}

export interface EmbedInstance {
  id: string;
  instance_name: string;
  instance_status: "connected" | "connecting" | "disconnected";
  uazapi_instance_token: string;
  uazapi_base_url?: string | null;
  phone?: string | null;
  profile_pic_url?: string | null;
  ghl_user_id?: string | null;
  is_official_api?: boolean;
  ignore_groups?: boolean | null;
  embed_visible_options?: EmbedVisibleOptions | null;
  auto_tag?: string | null;
}

interface EmbedInstanceCardProps {
  instance: EmbedInstance;
  subaccountId: string;
  embedToken: string;
  locationId: string;
  trackId?: string | null;
  onStatusChange?: () => void;
}

export function EmbedInstanceCard({ 
  instance, 
  subaccountId,
  embedToken,
  locationId,
  trackId,
  onStatusChange 
}: EmbedInstanceCardProps) {
  const opts = instance.embed_visible_options;
  const isVisible = (key: keyof EmbedVisibleOptions) => opts?.[key] !== false;
  const [syncing, setSyncing] = useState(false);
  const [isOfficialApi, setIsOfficialApi] = useState(instance.is_official_api || false);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(instance.phone || null);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(instance.profile_pic_url || null);
  const [currentStatus, setCurrentStatus] = useState(instance.instance_status);
  const [ghlUserName, setGhlUserName] = useState<string | null>(null);
  const [assignUserDialogOpen, setAssignUserDialogOpen] = useState(false);
  const [currentGhlUserId, setCurrentGhlUserId] = useState(instance.ghl_user_id);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [ignoreGroups, setIgnoreGroups] = useState(instance.ignore_groups ?? false);
  const [messagesDialogOpen, setMessagesDialogOpen] = useState(false);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(instance.instance_name);
  const [savingName, setSavingName] = useState(false);
  const [instanceName, setInstanceName] = useState(instance.instance_name);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [autoTags, setAutoTags] = useState<string[]>(() => {
    const raw = instance.auto_tag || "";
    return raw ? raw.split(",").map((t: string) => t.trim()).filter(Boolean) : [];
  });
  const [tagInput, setTagInput] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [showTagsOnCard, setShowTagsOnCard] = useState<boolean>(() => {
    const opts = instance.embed_visible_options;
    return (opts as any)?.show_tags_on_card !== false;
  });
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const copyToClipboard = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for iframes where clipboard API is blocked
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  };

  const normalizeQr = (raw: unknown): string | null => {
    if (!raw) return null;
    const s = String(raw);
    if (!s) return null;
    if (s.startsWith("data:image")) return s;
    if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length > 200) {
      return `data:image/png;base64,${s}`;
    }
    return s;
  };

  const callUazapiProxy = async (action: "status" | "connect" | "qrcode" | "disconnect" | "ghl-users", extra?: Record<string, string>) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazapi-proxy-embed`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embedToken, instanceId: instance.id, action, ...extra }),
    });
    const json = await res.json().catch(() => null);
    return json;
  };

  const fetchInstanceStatus = async (): Promise<{
    status: "connected" | "connecting" | "disconnected";
    phone?: string;
    profilePicUrl?: string;
    qrcode?: string;
    loggedIn?: boolean;
    jid?: string | null;
  } | null> => {
    try {
      const proxied = await callUazapiProxy("status");
      if (!proxied?.data) return null;
      const data = proxied.data;
      
      const loggedIn = data.status?.loggedIn === true || data.instance?.loggedIn === true;
      const jid: string | null =
        data.status?.jid || data.instance?.jid || data.jid || null;

      const rawStatus =
        data.instance?.status ||
        data.instance?.connectionState ||
        data.instance?.state ||
        data.status ||
        data.state ||
        data.connection ||
        data.connectionState ||
        "disconnected";
      
      const phone = data.instance?.owner
        || data.instance?.phoneNumber 
        || data.instance?.phone 
        || data.instance?.number
        || data.instance?.wid?.user
        || data.status?.jid?.split("@")?.[0]?.split(":")?.[0]
        || data.phone 
        || data.phoneNumber 
        || data.number 
        || data.wid?.user
        || data.jid?.split("@")?.[0]
        || data.instance?.jid?.split("@")?.[0]
        || "";
      
      const pic = data.instance?.profilePicUrl
        || data.instance?.profilePic
        || data.instance?.picture
        || data.instance?.imgUrl
        || data.profilePicUrl
        || data.profilePic
        || data.picture
        || data.imgUrl
        || "";
      
      const qrcodeRaw =
        data.instance?.qrcode ||
        data.qrcode ||
        data.qr ||
        data.base64 ||
        data.qr_code ||
        data.data?.qrcode ||
        data.data?.qr ||
        null;

      const qrcode = normalizeQr(qrcodeRaw);

      const statusLower = String(rawStatus).toLowerCase();
      const instanceStatusConnected = ["connected", "open", "authenticated"].includes(statusLower);
      const sessionConnected = loggedIn || !!jid;
      const connectedSignals = sessionConnected || instanceStatusConnected;

      let mapped: "connected" | "connecting" | "disconnected" = "disconnected";
      if (connectedSignals) {
        mapped = phone ? "connected" : "connecting";
      } else if (["connecting", "qr", "waiting", "pairing"].includes(statusLower)) {
        mapped = "connecting";
      } else {
        mapped = "disconnected";
      }

      return {
        status: mapped,
        phone,
        profilePicUrl: pic,
        qrcode: qrcode || undefined,
        loggedIn,
        jid,
      };
    } catch (error) {
      console.error("[EmbedInstanceCard] Error fetching status:", error);
      return null;
    }
  };

  // Fetch GHL user name via server-side proxy
  useEffect(() => {
    const fetchGhlUserName = async () => {
      if (currentGhlUserId && locationId) {
        try {
          const result = await callUazapiProxy("ghl-users", { locationId });
          const users = result?.users || [];
          const user = users.find((u: any) => u.id === currentGhlUserId);
          if (user) {
            setGhlUserName(user.name);
          }
        } catch (error) {
          console.error("Failed to fetch GHL user name:", error);
        }
      }
    };

    fetchGhlUserName();
  }, [currentGhlUserId, locationId]);

  useEffect(() => {
    if (!instance.phone || !instance.profile_pic_url) {
      fetchInstanceStatus().then((result) => {
        if (result) {
          setCurrentStatus(result.status);

          if (result.status === "connected") {
            if (result.phone) setConnectedPhone(result.phone);
            if (result.profilePicUrl) setProfilePicUrl(result.profilePicUrl);
          } else {
            setConnectedPhone(null);
            setProfilePicUrl(null);
          }

          persistStatusToDb({
            status: result.status,
            phone: result.phone,
            profilePicUrl: result.profilePicUrl,
          });
        }
      });
    }
  }, [instance.uazapi_instance_token]);

  useEffect(() => {
    setIgnoreGroups(instance.ignore_groups ?? false);
  }, [instance.ignore_groups]);

  const persistStatusToDb = async (payload: {
    status: "connected" | "connecting" | "disconnected";
    phone?: string;
    profilePicUrl?: string;
  }) => {
    try {
      // Use secure RPC instead of direct table update
      await supabase.rpc("update_instance_for_embed", {
        p_instance_id: instance.id,
        p_embed_token: embedToken,
        p_instance_status: payload.status,
        p_phone: payload.status === "connected" ? (payload.phone || "") : "",
        p_profile_pic_url: payload.status === "connected" ? (payload.profilePicUrl || "") : "",
      });
    } catch (e) {
      console.error("Failed to cache instance data:", e);
    }
  };

  const persistIgnoreGroups = async (checked: boolean) => {
    const { data, error } = await supabase.rpc("update_instance_for_embed", {
      p_instance_id: instance.id,
      p_embed_token: embedToken,
      p_ignore_groups: checked,
    });

    if (error) throw error;
    if (!data) throw new Error("Não foi possível salvar a configuração");

    setIgnoreGroups(checked);
  };

  const handleSyncStatus = async () => {
    setSyncing(true);
    try {
      const result = await fetchInstanceStatus();
      if (result) {
        setCurrentStatus(result.status);

        if (result.status === "connected") {
          if (result.phone) setConnectedPhone(result.phone);
          if (result.profilePicUrl) setProfilePicUrl(result.profilePicUrl);
        } else {
          setConnectedPhone(null);
          setProfilePicUrl(null);
        }

        await persistStatusToDb({
          status: result.status,
          phone: result.phone,
          profilePicUrl: result.profilePicUrl,
        });
        toast.success("Status atualizado!");
        onStatusChange?.();
      }
    } catch {
      toast.error("Erro ao atualizar status");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      // Use server-side proxy for disconnect - no tokens exposed to client
      const result = await callUazapiProxy("disconnect");
      
      if (!result?.ok) {
        throw new Error("Falha ao desconectar");
      }

      setCurrentStatus("disconnected");
      setConnectedPhone(null);
      setProfilePicUrl(null);
      toast.success("Desconectado com sucesso!");
      onStatusChange?.();
    } catch (error: any) {
      toast.error(error.message || "Erro ao desconectar");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const statusWithQr = await fetchInstanceStatus();
      if (statusWithQr?.qrcode) {
        setQrCode(statusWithQr.qrcode);
        setQrDialogOpen(true);
        return;
      }

      const connectRes = await callUazapiProxy("connect");
      const connectData = connectRes?.data || {};
      const immediateQr =
        connectData.instance?.qrcode ||
        connectData.instance?.qr ||
        connectData.instance?.base64 ||
        connectData.instance?.qr_code ||
        connectData.qrcode ||
        connectData.qr ||
        connectData.base64 ||
        connectData.qr_code ||
        connectData.data?.qrcode ||
        connectData.data?.qr ||
        null;

      const normalizedImmediateQr = normalizeQr(immediateQr);
      if (normalizedImmediateQr) {
        setQrCode(normalizedImmediateQr);
        setQrDialogOpen(true);
        return;
      }

      const statusAfter = await fetchInstanceStatus();
      if (statusAfter?.qrcode) {
        setQrCode(statusAfter.qrcode);
        setQrDialogOpen(true);
        return;
      }

      const qrRes = await callUazapiProxy("qrcode");
      const qrData = qrRes?.data || {};
      const qr =
        qrData.instance?.qrcode ||
        qrData.instance?.qr ||
        qrData.instance?.base64 ||
        qrData.instance?.qr_code ||
        qrData.qrcode ||
        qrData.qr ||
        qrData.base64 ||
        qrData.qr_code ||
        qrData.data?.qrcode ||
        qrData.data?.qr ||
        null;

      const normalizedQr = normalizeQr(qr);
      if (normalizedQr) {
        setQrCode(normalizedQr);
        setQrDialogOpen(true);
        return;
      }

      throw new Error("Erro ao obter QR Code");
    } catch (error: any) {
      console.error("[EmbedInstanceCard] Connect error:", error);
      toast.error(error.message || "Erro ao obter QR Code");
    } finally {
      setConnecting(false);
    }
  };

  const handleUserAssigned = (userId: string | null, userName: string | null) => {
    setCurrentGhlUserId(userId);
    setGhlUserName(userName);
  };

  const handleSaveWebhook = async (params: {
    webhookUrl: string;
    ignoreGroups: boolean;
    webhookEvents: string[];
    createNew: boolean;
    enabled: boolean;
    webhookId?: string;
    excludeMessages?: string;
  }) => {
    setWebhookSaving(true);
    try {
      await persistIgnoreGroups(params.ignoreGroups);

      const { data, error } = await supabase.functions.invoke("configure-webhook", {
        body: {
          instance_id: instance.id,
          webhook_url_override: params.webhookUrl,
          webhook_events: params.webhookEvents,
          create_new: params.createNew,
          enabled: params.enabled,
          webhook_id: params.webhookId,
          exclude_messages: params.excludeMessages,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(params.createNew ? "Webhook criado!" : "Webhook atualizado!");
      setWebhookDialogOpen(false);
    } catch (err: any) {
      toast.error("Erro ao configurar webhook: " + (err.message || ""));
    } finally {
      setWebhookSaving(false);
    }
  };

  const formatPhoneNumber = (phone: string) => {
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

  const handleSaveName = async () => {
    const trimmed = editedName.trim();
    if (!trimmed || trimmed === instanceName) {
      setIsEditingName(false);
      setEditedName(instanceName);
      return;
    }
    setSavingName(true);
    try {
      const { data, error } = await supabase.rpc("update_instance_for_embed", {
        p_instance_id: instance.id,
        p_embed_token: embedToken,
        p_instance_name: trimmed,
        p_auto_tag: instance.auto_tag ?? "",
      } as any);
      if (error) throw error;
      setInstanceName(trimmed);
      toast.success("Nome atualizado!");
      setIsEditingName(false);
      onStatusChange?.();
    } catch (err: any) {
      toast.error("Erro ao atualizar nome: " + err.message);
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveAutoTag = async () => {
    setSavingTag(true);
    try {
      const tagValue = autoTags.length > 0 ? autoTags.join(",") : "";
      const currentOpts = instance.embed_visible_options || {};
      const newOpts = { ...(currentOpts as any), show_tags_on_card: showTagsOnCard };
      const { error } = await supabase.rpc("update_instance_for_embed", {
        p_instance_id: instance.id,
        p_embed_token: embedToken,
        p_auto_tag: tagValue || "",
        p_embed_visible_options: newOpts,
      });
      if (error) throw error;
      toast.success(autoTags.length > 0 ? `${autoTags.length} tag(s) configurada(s)!` : "Tags automáticas removidas!");
      setTagDialogOpen(false);
    } catch (err: any) {
      toast.error("Erro ao salvar tags: " + err.message);
    } finally {
      setSavingTag(false);
    }
  };

  const status = statusConfig[currentStatus];
  const StatusIcon = status.icon;
  const isConnected = currentStatus === "connected";

  return (
    <>
      <Card className={`bg-gradient-to-br from-card/80 via-card/60 to-card/90 backdrop-blur-sm border-border/50 hover:border-primary/40 transition-all duration-300 group max-w-[350px] min-h-[340px] rounded-sm flex flex-col ${isConnected ? "snake-border border-transparent" : "overflow-hidden"}`}>
        <CardContent className="p-0 flex flex-col flex-1">
          {/* Header Section */}
          <div className="p-4 pb-2 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
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
                    {isVisible("edit_name") && isEditingName ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSaveName} disabled={savingName}>
                            {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-400" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setIsEditingName(false); setEditedName(instanceName); }}>
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                        <Input
                          ref={nameInputRef}
                          value={editedName}
                          onChange={(e) => setEditedName(e.target.value)}
                          className="h-7 text-sm font-semibold w-36 px-1 py-0"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveName();
                            if (e.key === "Escape") { setIsEditingName(false); setEditedName(instanceName); }
                          }}
                          autoFocus
                          disabled={savingName}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group/name min-w-0">
                        <h3 className="font-semibold text-card-foreground text-sm leading-tight break-words min-w-0">
                          {instanceName}
                        </h3>
                        {isVisible("edit_name") && (
                          <button
                            onClick={() => { setIsEditingName(true); setEditedName(instanceName); }}
                            className="opacity-0 group-hover/name:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted shrink-0"
                            title="Editar nome"
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
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
                  {currentGhlUserId && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <User className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs text-muted-foreground">
                        {ghlUserName || currentGhlUserId}
                      </span>
                    </div>
                  )}

                  {/* Official API badge */}
                  {isVisible("api_oficial") && isOfficialApi && (
                    <Badge variant="outline" className="mt-1 bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px]">
                      API Oficial
                    </Badge>
                  )}
                  {/* Auto Tag badges */}
                  {showTagsOnCard && instance.auto_tag && instance.auto_tag.split(",").map((t: string) => t.trim()).filter(Boolean).map((tag: string, idx: number) => (
                    <Badge key={idx} variant="outline" className="mt-1 bg-purple-500/10 text-purple-400 border-purple-500/30 text-[10px]">
                      <Tag className="h-2.5 w-2.5 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col items-end gap-1 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 hover:opacity-100">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover border-border">
                    {isVisible("assign_user") && (
                      <DropdownMenuItem onClick={() => setAssignUserDialogOpen(true)}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Atribuir Usuário GHL
                      </DropdownMenuItem>
                    )}
                    {isVisible("webhook") && (
                      <DropdownMenuItem onClick={() => setWebhookDialogOpen(true)}>
                        <Webhook className="h-4 w-4 mr-2" />
                        Configurar Webhooks
                      </DropdownMenuItem>
                    )}
                    {isVisible("messages") && (
                      <DropdownMenuItem onClick={() => setMessagesDialogOpen(true)}>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Mensagem em massa (beta)
                      </DropdownMenuItem>
                    )}
                    {isVisible("group_manager") && (
                      <DropdownMenuItem onClick={() => setGroupManagerOpen(true)}>
                        <Users className="h-4 w-4 mr-2" />
                        Gerenciador de Grupos
                      </DropdownMenuItem>
                    )}
                    {isVisible("api_oficial") && (
                      <DropdownMenuItem onClick={async () => {
                        const newValue = !isOfficialApi;
                        const { error } = await supabase
                          .from("instances")
                          .update({ is_official_api: newValue })
                          .eq("id", instance.id);
                        if (error) {
                          toast.error("Erro ao atualizar API Oficial");
                        } else {
                          setIsOfficialApi(newValue);
                          toast.success(newValue ? "API Oficial ativada" : "API Oficial desativada");
                        }
                      }}>
                        <Smartphone className="h-4 w-4 mr-2" />
                        {isOfficialApi ? "Desativar API Oficial" : "Ativar API Oficial"}
                      </DropdownMenuItem>
                    )}
                    {isVisible("auto_tag") && (
                      <DropdownMenuItem onClick={() => {
                        const raw = instance.auto_tag || "";
                        setAutoTags(raw ? raw.split(",").map((t: string) => t.trim()).filter(Boolean) : []);
                        setTagInput("");
                        const opts = instance.embed_visible_options;
                        setShowTagsOnCard((opts as any)?.show_tags_on_card !== false);
                        setTagDialogOpen(true);
                      }}>
                        <Tag className="h-4 w-4 mr-2" />
                        {instance.auto_tag ? "Editar Tags Automáticas" : "Configurar Tags Automáticas"}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {isVisible("status") && (
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
                )}
              </div>
            </div>
          </div>

          {/* Credentials Section */}
          <div className="px-4 pt-3 pb-3 space-y-1 border-t border-border/30 mt-3">
            {isVisible("base_url") && (
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <Copy className="h-3 w-3 text-muted-foreground shrink-0" />
                <span
                  className="text-sm text-muted-foreground font-mono truncate max-w-[300px] cursor-pointer hover:text-foreground transition-colors"
                  title="Clique para copiar Base URL"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const info = await callUazapiProxy("get-info" as any);
                      if (info?.baseUrl) {
                        await copyToClipboard(info.baseUrl);
                        toast.success("Base URL copiada!");
                      }
                    } catch { toast.error("Erro ao copiar"); }
                  }}
                >
                  {instance.uazapi_base_url || "Base URL"}
                </span>
              </div>
            )}
            {isVisible("token") && (
              <div className={`flex items-start gap-1.5 ${showToken ? '' : 'whitespace-nowrap'}`}>
                <Copy className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                <span
                  className={`text-sm text-muted-foreground font-mono cursor-pointer hover:text-foreground transition-colors ${showToken ? 'break-all' : 'truncate max-w-[250px]'}`}
                  title="Clique para copiar o token"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const info = await callUazapiProxy("get-info" as any);
                      if (info?.token) {
                        await copyToClipboard(info.token);
                        toast.success("Token copiado!");
                      }
                    } catch { toast.error("Erro ao copiar"); }
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
            )}
          </div>

          {/* Status + Actions */}
          {isConnected ? (
            <>
               <div className="mt-4 mb-2 flex items-center justify-center gap-2 py-5 bg-emerald-500/15 border-y border-emerald-500/30">
                 <Wifi className="h-5 w-5 text-emerald-400" />
                 <span className="text-sm text-emerald-400 font-bold">WhatsApp Conectado</span>
              </div>
              <div className="px-4 pb-4 flex items-center justify-center mt-auto">
                {isVisible("disconnect") && (
                  <Button
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="bg-destructive hover:bg-destructive/90 h-9 px-4 text-white"
                  >
                    <Power className="h-3.5 w-3.5 text-white" />
                    <span className="w-px h-4 bg-white/30" />
                    Desconectar
                  </Button>
                )}
              </div>
            </>
          ) : isVisible("connect") ? (
            <>
              <div 
                className="mx-4 mb-3 flex flex-col items-center justify-center py-5 border border-dashed border-border/70 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                onClick={handleConnect}
              >
                {connecting ? (
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
                  disabled={connecting}
                  className="bg-primary hover:bg-primary/90 h-9 px-4"
                >
                  <QrCode className="h-3.5 w-3.5 mr-1.5" />
                  Conectar
                </Button>
              </div>
            </>
          ) : (
            <div className="mx-4 mb-3 flex items-center justify-center gap-2 py-3 bg-muted/30 border border-border/30 rounded-lg mt-auto">
              <WifiOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground font-medium text-sm">Desconectado</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* QR Code Dialog */}
      {qrDialogOpen && qrCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setQrDialogOpen(false)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-card-foreground mb-4">Conectar WhatsApp</h3>
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-white rounded-xl">
                <img
                  src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                  alt="QR Code"
                  className="w-48 h-48"
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Abra o WhatsApp → Menu → Dispositivos conectados → Conectar dispositivo
              </p>
              <Button onClick={() => setQrDialogOpen(false)} variant="outline" className="border-border">
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        {assignUserDialogOpen && (
          <EmbedAssignUserDialog
            open={assignUserDialogOpen}
            onOpenChange={setAssignUserDialogOpen}
            instanceId={instance.id}
            instanceName={instance.instance_name}
            currentUserId={currentGhlUserId || null}
            embedToken={embedToken}
            locationId={locationId}
            onAssigned={handleUserAssigned}
          />
        )}
        {webhookDialogOpen && (
          <WebhookConfigDialog
            open={webhookDialogOpen}
            onOpenChange={setWebhookDialogOpen}
            instance={{
              id: instance.id,
              user_id: "",
              subaccount_id: null,
              instance_name: instance.instance_name,
              uazapi_instance_token: instance.uazapi_instance_token,
              instance_status: currentStatus,
              webhook_url: null,
              ignore_groups: ignoreGroups,
              ghl_user_id: instance.ghl_user_id || null,
              phone: connectedPhone,
              profile_pic_url: profilePicUrl,
              uazapi_base_url: instance.uazapi_base_url || null,
              is_official_api: false,
            }}
            onSave={handleSaveWebhook}
            isSaving={webhookSaving}
            ignoreGroups={ignoreGroups}
            onIgnoreGroupsChange={setIgnoreGroups}
          />
        )}
        {messagesDialogOpen && (
          <ManageMessagesDialog
            open={messagesDialogOpen}
            onOpenChange={setMessagesDialogOpen}
            embedToken={embedToken}
            trackId={trackId}
            instance={{
              id: instance.id,
              user_id: "",
              subaccount_id: subaccountId,
              instance_name: instance.instance_name,
              uazapi_instance_token: instance.uazapi_instance_token,
              instance_status: currentStatus,
              webhook_url: null,
              ignore_groups: ignoreGroups,
              ghl_user_id: instance.ghl_user_id || null,
              phone: connectedPhone,
              profile_pic_url: profilePicUrl,
              uazapi_base_url: instance.uazapi_base_url || null,
              is_official_api: false,
            }}
          />
        )}
        {groupManagerOpen && (
          <GroupManagerDialog
            open={groupManagerOpen}
            onOpenChange={setGroupManagerOpen}
            embedToken={embedToken}
            onIgnoreGroupsSaved={setIgnoreGroups}
            instance={{
              id: instance.id,
              user_id: "",
              subaccount_id: null,
              instance_name: instance.instance_name,
              uazapi_instance_token: instance.uazapi_instance_token,
              instance_status: currentStatus,
              webhook_url: null,
              ignore_groups: ignoreGroups,
              ghl_user_id: instance.ghl_user_id || null,
              phone: connectedPhone,
              profile_pic_url: profilePicUrl,
              uazapi_base_url: instance.uazapi_base_url || null,
              is_official_api: false,
            }}
          />
        )}
      </Suspense>

      {/* Auto Tag Dialog */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent className="bg-card border-border sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-card-foreground">Tags Automáticas</DialogTitle>
            <DialogDescription>
              Quando um lead enviar mensagem para esta instância, as tags serão adicionadas automaticamente ao contato no GHL. Pressione Enter para adicionar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Adicionar Tag</Label>
              <Input
                placeholder="Digite a tag e pressione Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = tagInput.trim();
                    if (val && !autoTags.includes(val)) {
                      setAutoTags((prev) => [...prev, val]);
                    }
                    setTagInput("");
                  }
                }}
              />
              {autoTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {autoTags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 px-2.5 py-1 text-xs font-medium"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setAutoTags((prev) => prev.filter((_, i) => i !== idx))}
                        className="ml-0.5 rounded-full hover:bg-purple-500/30 p-0.5 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {autoTags.length === 0 ? "Nenhuma tag configurada." : `${autoTags.length} tag(s) configurada(s).`}
              </p>
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  id="embed-show-tags-card"
                  checked={showTagsOnCard}
                  onCheckedChange={setShowTagsOnCard}
                />
                <Label htmlFor="embed-show-tags-card" className="cursor-pointer text-sm">
                  Exibir tags no card
                </Label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTagDialogOpen(false)}>Cancelar</Button>
            <Button disabled={savingTag} onClick={handleSaveAutoTag}>
              {savingTag && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
