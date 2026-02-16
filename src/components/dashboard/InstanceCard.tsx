import { useState, useEffect, memo } from "react";
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
  RotateCcw
} from "lucide-react";
import { Instance, useInstances } from "@/hooks/useInstances";
import { checkServerHealth } from "@/hooks/instances/instanceApi";
import { useGHLUsers, GHLUser } from "@/hooks/useGHLUsers";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner";
import { AssignGHLUserDialog } from "./AssignGHLUserDialog";
import { supabase } from "@/integrations/supabase/client";

interface InstanceCardProps {
  instance: Instance;
}

export const InstanceCard = memo(function InstanceCard({ instance }: InstanceCardProps) {
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
  const [webhookUrl, setWebhookUrl] = useState("");
  const [ignoreGroups, setIgnoreGroups] = useState(instance.ignore_groups || false);
  const [syncing, setSyncing] = useState(false);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(instance.phone || null);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(instance.profile_pic_url || null);
  const [assignUserDialogOpen, setAssignUserDialogOpen] = useState(false);
  const [ghlUserName, setGhlUserName] = useState<string | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
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
          if (result?.phone) {
            setConnectedPhone(result.phone);
          }
          if (result?.profilePicUrl) {
            setProfilePicUrl(result.profilePicUrl);
          }
          setQrDialogOpen(false);
          toast.success("WhatsApp conectado com sucesso!");
        }
      } catch {
        // Ignore errors during auto-refresh
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [qrDialogOpen]);

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
        toast.success("Esta instância já está conectada!");
        setLoadingQR(false);
        return;
      }
      
      // If status is disconnected, clear cached phone/pic locally
      if (statusResult?.status === "disconnected") {
        setConnectedPhone(null);
        setProfilePicUrl(null);
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
      toast.success("Status atualizado!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveWebhook = () => {
    updateInstanceWebhook.mutate({
      instance,
      webhookUrl,
      ignoreGroups,
    });
    setWebhookDialogOpen(false);
  };

  const handleDelete = () => {
    deleteInstance.mutate({ instance, deleteFromUazapi });
    setDeleteDialogOpen(false);
  };

  const handleDisconnect = () => {
    disconnectInstance.mutate(instance, {
      onSuccess: () => {
        setConnectedPhone(null);
        setProfilePicUrl(null);
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

  const status = statusConfig[instance.instance_status];
  const StatusIcon = status.icon;
  const isConnected = instance.instance_status === "connected";

  return (
    <>
      <Card className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/40 transition-all duration-300 group overflow-hidden">
        <CardContent className="p-0">
          {/* Header Section */}
          <div className="p-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Profile Picture or Default Icon */}
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
                    {/* Server health badge - only shown after manual check */}
                    {serverOnline !== null && (
                      <div 
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          serverOnline ? "bg-emerald-500" : "bg-destructive"
                        }`}
                        title={serverOnline ? "Servidor UAZAPI online" : "Servidor UAZAPI offline"}
                      />
                    )}
                    <Badge variant="outline" className={`${status.className} shrink-0`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {status.label}
                    </Badge>
                  </div>
                  
                  {/* Phone number - always show if available */}
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
                  
                  {/* GHL User - show if assigned */}
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
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 opacity-60 hover:opacity-100">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border-border">
                  <DropdownMenuItem onClick={copyToken}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar Token
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setWebhookDialogOpen(true)}>
                    <Settings2 className="h-4 w-4 mr-2" />
                    Configurar Webhook
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
                disabled={disconnectInstance.isPending}
                className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400 h-9"
              >
                <Power className="h-3.5 w-3.5 mr-1.5" />
                Desconectar
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={loadingQR}
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
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
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

      {/* Webhook Dialog */}
      <Dialog open={webhookDialogOpen} onOpenChange={setWebhookDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-card-foreground">Configurar Webhook</DialogTitle>
            <DialogDescription>
              Configure a URL do webhook para receber mensagens
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-url">URL do Webhook</Label>
              <Input
                id="webhook-url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://seu-webhook.com/endpoint"
                className="bg-secondary border-border"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="ignore-groups">Ignorar mensagens de grupos</Label>
              <Switch
                id="ignore-groups"
                checked={ignoreGroups}
                onCheckedChange={setIgnoreGroups}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setWebhookDialogOpen(false)} className="border-border">
              Cancelar
            </Button>
            <Button onClick={handleSaveWebhook} disabled={updateInstanceWebhook.isPending}>
              {updateInstanceWebhook.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-card-foreground">
              {deleteFromUazapi ? "Excluir Permanentemente?" : "Desvincular Instância?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFromUazapi 
                ? "Esta ação vai excluir a instância da UAZAPI e do sistema. A conexão com o WhatsApp será perdida permanentemente."
                : "A instância será removida do sistema mas continuará existindo na UAZAPI. Você poderá importá-la novamente depois."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className={deleteFromUazapi ? "bg-destructive hover:bg-destructive/90" : "bg-amber-500 hover:bg-amber-500/90 text-white"}
            >
              {deleteFromUazapi ? "Excluir" : "Desvincular"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign GHL User Dialog */}
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
    </>
  );
});
