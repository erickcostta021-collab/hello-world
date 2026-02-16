import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  User
} from "lucide-react";
import { toast } from "sonner";
import { EmbedAssignUserDialog } from "./EmbedAssignUserDialog";

export interface EmbedInstance {
  id: string;
  instance_name: string;
  instance_status: "connected" | "connecting" | "disconnected";
  uazapi_instance_token: string;
  phone?: string | null;
  profile_pic_url?: string | null;
  ghl_user_id?: string | null;
}

interface EmbedInstanceCardProps {
  instance: EmbedInstance;
  subaccountId: string;
  embedToken: string;
  locationId: string;
  onStatusChange?: () => void;
}

export function EmbedInstanceCard({ 
  instance, 
  subaccountId,
  embedToken,
  locationId,
  onStatusChange 
}: EmbedInstanceCardProps) {
  const [syncing, setSyncing] = useState(false);
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

  const persistStatusToDb = async (payload: {
    status: "connected" | "connecting" | "disconnected";
    phone?: string;
    profilePicUrl?: string;
  }) => {
    try {
      const { createEmbedSupabaseClient } = await import("@/hooks/useEmbedSupabase");
      const supabase = createEmbedSupabaseClient();

      const updateData: Record<string, unknown> = {
        instance_status: payload.status,
      };

      if (payload.status === "connected") {
        if (payload.phone) updateData.phone = payload.phone;
        if (payload.profilePicUrl) updateData.profile_pic_url = payload.profilePicUrl;
      } else {
        updateData.phone = null;
        updateData.profile_pic_url = null;
      }
      
      await supabase
        .from("instances")
        .update(updateData)
        .eq("id", instance.id);
    } catch (e) {
      console.error("Failed to cache instance data:", e);
    }
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

  const status = statusConfig[currentStatus];
  const StatusIcon = status.icon;
  const isConnected = currentStatus === "connected";

  return (
    <>
      <Card className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/40 transition-all duration-300 group overflow-hidden">
        <CardContent className="p-0">
          {/* Header Section */}
          <div className="p-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {profilePicUrl ? (
                  <Avatar className="h-11 w-11 shrink-0 border-2 border-primary/20">
                    <AvatarImage src={profilePicUrl} alt="WhatsApp Profile" />
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20">
                      <Smartphone className="h-5 w-5 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="p-2.5 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl shrink-0">
                    <Smartphone className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-card-foreground truncate">
                      {instance.instance_name}
                    </h3>
                    <Badge variant="outline" className={`${status.className} shrink-0`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {status.label}
                    </Badge>
                  </div>
                  
                  {connectedPhone ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Phone className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-sm text-emerald-400 font-medium">
                        {formatPhoneNumber(connectedPhone)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      Número não disponível
                    </p>
                  )}
                  
                  {currentGhlUserId && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <User className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs text-muted-foreground">
                        {ghlUserName || currentGhlUserId}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 opacity-60 hover:opacity-100">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border-border">
                  <DropdownMenuItem onClick={() => setAssignUserDialogOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Atribuir Usuário GHL
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Status Section */}
          {isConnected ? (
            <div className="mx-4 mb-3 flex items-center justify-center gap-2 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <Wifi className="h-4 w-4 text-emerald-400" />
              <span className="text-emerald-400 font-medium text-sm">WhatsApp Conectado</span>
            </div>
          ) : (
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
          )}

          {/* Actions */}
          <div className="px-4 pb-4 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncStatus}
              disabled={syncing}
              className="w-full border-border/50 h-9"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
              Status
            </Button>

            {isConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400 h-9"
              >
                <Power className="h-3.5 w-3.5 mr-1.5" />
                Desconectar
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={connecting}
                className="w-full bg-primary hover:bg-primary/90 h-9"
              >
                <QrCode className="h-3.5 w-3.5 mr-1.5" />
                Conectar
              </Button>
            )}
          </div>
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

      {/* Assign User Dialog */}
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
    </>
  );
}
