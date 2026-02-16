import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Plus, Loader2, RefreshCw, HelpCircle, User, AlertTriangle, Unlink, Link2 } from "lucide-react";
import { useInstances, UazapiInstance, Instance } from "@/hooks/useInstances";
import { ManualConnectTab } from "./ManualConnectTab";
import { useGHLUsers, GHLUser } from "@/hooks/useGHLUsers";
import { Subaccount } from "@/hooks/useSubaccounts";
import { useAuth } from "@/hooks/useAuth";
import { useSettings, getEffectiveUserId } from "@/hooks/useSettings";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AddInstanceDialogProps {
  subaccount: Subaccount;
}

type TabType = "create" | "import" | "manual";

export function AddInstanceDialog({ subaccount }: AddInstanceDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("create");
  
  // Create state
  const [name, setName] = useState("");
  const [systemName, setSystemName] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  
  // Import state
  const [uazapiInstances, setUazapiInstances] = useState<UazapiInstance[]>([]);
  const [selectedInstances, setSelectedInstances] = useState<Set<string>>(new Set());
  const [loadingInstances, setLoadingInstances] = useState(false);
  
  // GHL Users state
  const [ghlUsers, setGhlUsers] = useState<GHLUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Unlink confirmation state
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const [instanceToUnlink, setInstanceToUnlink] = useState<Instance | null>(null);

  const { 
    createInstance, 
    importInstance, 
    instances, 
    fetchUazapiInstances,
    deleteInstance,
    instanceLimit,
    linkedInstanceCount,
    unlinkedInstanceCount,
    canCreateInstance,
  } = useInstances(subaccount.id);
  const { fetchLocationUsers } = useGHLUsers();
  const { user } = useAuth();
  const { settings } = useSettings();

  // Fetch ALL user instances (across all subaccounts) to detect already-imported ones
  const { data: allUserInstances = [] } = useQuery({
    queryKey: ["all-user-instances", user?.id, settings?.shared_from_user_id],
    queryFn: async () => {
      if (!user) return [];
      const effectiveUserId = await getEffectiveUserId(user.id);
      const { data, error } = await supabase
        .from("instances")
        .select("*")
        .eq("user_id", effectiveUserId)
        .order("instance_name");
      if (error) throw error;
      return data as Instance[];
    },
    enabled: !!user && open,
  });

  // Load GHL users when dialog opens
  useEffect(() => {
    if (open && subaccount.location_id) {
      loadGHLUsers();
    }
  }, [open, subaccount.location_id]);

  const loadGHLUsers = async () => {
    if (!subaccount.ghl_access_token) {
      console.warn("App não instalado na subconta via OAuth");
      return;
    }
    setLoadingUsers(true);
    try {
      const users = await fetchLocationUsers(subaccount.location_id, subaccount.ghl_access_token);
      setGhlUsers(users);
    } catch (error: any) {
      console.error("Error loading GHL users:", error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadUazapiInstances = async () => {
    setLoadingInstances(true);
    try {
      const data = await fetchUazapiInstances();
      setUazapiInstances(data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoadingInstances(false);
    }
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && activeTab === "import") {
      loadUazapiInstances();
    }
    if (!isOpen) {
      // Reset state
      setName("");
      setSystemName("");
      setSelectedUserId("");
      setSelectedInstances(new Set());
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === "import" && uazapiInstances.length === 0) {
      loadUazapiInstances();
    }
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    
    createInstance.mutate(
      { name: name.trim(), subaccountId: subaccount.id },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
          setSystemName("");
          setSelectedUserId("");
        },
      }
    );
  };

  const handleImport = async () => {
    if (selectedInstances.size === 0) return;

    const instancesToImport = uazapiInstances.filter((i) =>
      selectedInstances.has(i.token)
    );

    for (const instance of instancesToImport) {
      await new Promise<void>((resolve) => {
        importInstance.mutate(
          { uazapiInstance: instance, subaccountId: subaccount.id },
          {
            onSuccess: () => {
              setSelectedInstances((prev) => {
                const next = new Set(prev);
                next.delete(instance.token);
                return next;
              });
              resolve();
            },
            onError: () => resolve(),
          }
        );
      });
    }

    if (selectedInstances.size === 0) {
      setOpen(false);
    }
  };

  const toggleInstanceSelection = (token: string) => {
    setSelectedInstances((prev) => {
      const next = new Set(prev);
      if (next.has(token)) {
        next.delete(token);
      } else {
        next.add(token);
      }
      return next;
    });
  };

  // Find which uazapi instances are already linked (have a subaccount_id)
  const linkedTokenMap = new Map<string, Instance>();
  const unlinkedTokenMap = new Map<string, Instance>();
  allUserInstances.forEach((i) => {
    if (i.subaccount_id) {
      linkedTokenMap.set(i.uazapi_instance_token, i);
    } else {
      unlinkedTokenMap.set(i.uazapi_instance_token, i);
    }
  });

  // Split into: available (not in DB or unlinked) and already linked
  const availableInstances = uazapiInstances.filter(
    (i) => !linkedTokenMap.has(i.token)
  );
  const alreadyLinkedInstances = uazapiInstances.filter(
    (i) => linkedTokenMap.has(i.token)
  );

  const handleUnlinkClick = (uazapiInstance: UazapiInstance) => {
    const dbInstance = linkedTokenMap.get(uazapiInstance.token);
    if (dbInstance) {
      setInstanceToUnlink(dbInstance);
      setUnlinkConfirmOpen(true);
    }
  };

  const queryClient = useQueryClient(); // for invalidating all-user-instances after unlink

  const confirmUnlink = () => {
    if (!instanceToUnlink) return;
    deleteInstance.mutate(
      { instance: instanceToUnlink, deleteFromUazapi: false },
      {
        onSuccess: () => {
          setUnlinkConfirmOpen(false);
          setInstanceToUnlink(null);
          queryClient.invalidateQueries({ queryKey: ["all-user-instances"] });
        },
        onError: () => {
          setUnlinkConfirmOpen(false);
          setInstanceToUnlink(null);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          Adicionar WhatsApp
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">
            Adicionar WhatsApp
          </DialogTitle>
          <DialogDescription>
            Crie uma nova ou vincule uma existente.
            {instanceLimit > 0 && (
              <span className="block mt-1 text-xs">
                {linkedInstanceCount} vinculada{linkedInstanceCount !== 1 ? "s" : ""} de {instanceLimit} do plano
                {unlinkedInstanceCount > 0 && ` · ${unlinkedInstanceCount} disponíve${unlinkedInstanceCount !== 1 ? "is" : "l"}`}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Instance limit warning */}
        {!canCreateInstance && instanceLimit > 0 && (
          <Alert variant="destructive" className="mb-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm font-medium leading-relaxed">
              Limite de {instanceLimit} {instanceLimit === 1 ? "instância" : "instâncias"} atingido. Faça upgrade do seu plano para adicionar mais.
            </AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <div className="flex border border-border rounded-lg overflow-hidden">
          <button
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "create"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => handleTabChange("create")}
          >
            Criar Nova
          </button>
          <button
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "import"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => handleTabChange("import")}
          >
            Importar
          </button>
          <button
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "manual"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => handleTabChange("manual")}
          >
            Manual
          </button>
        </div>

        {/* Create Tab Content */}
        {activeTab === "create" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="instance-name">Nome da Instância</Label>
              <Input
                id="instance-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: [Cliente][01]"
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="system-name">System Name</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">
                      Nome interno usado para identificação no sistema.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="system-name"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                placeholder={name || "Nome interno"}
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <Label>Usuário GHL (Opcional)</Label>
              </div>
              <Select
                value={selectedUserId}
                onValueChange={setSelectedUserId}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Nenhum usuário" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="none">Nenhum usuário</SelectItem>
                  {!subaccount.ghl_access_token ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      App não instalado na subconta
                    </div>
                  ) : loadingUsers ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : ghlUsers.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      Nenhum usuário encontrado
                    </div>
                  ) : (
                    ghlUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={handleCreate}
              disabled={!name.trim() || createInstance.isPending || !canCreateInstance}
            >
              {createInstance.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              <Plus className="h-4 w-4 mr-2" />
              {canCreateInstance ? "Criar Instância" : "Limite Atingido"}
            </Button>
          </div>
        )}

        {/* Import Tab Content */}
        {activeTab === "import" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Instâncias no Servidor
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadUazapiInstances}
                disabled={loadingInstances}
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-1 ${loadingInstances ? "animate-spin" : ""}`}
                />
                Atualizar
              </Button>
            </div>

            <ScrollArea className="h-[280px] pr-2">
              {loadingInstances ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : uazapiInstances.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhuma instância encontrada no servidor
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Available instances (not yet imported or unlinked) */}
                  {availableInstances.map((instance) => {
                    const isUnlinked = unlinkedTokenMap.has(instance.token);
                    return (
                      <div
                        key={instance.token}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                          selectedInstances.has(instance.token)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground bg-secondary/50"
                        }`}
                        onClick={() => toggleInstanceSelection(instance.token)}
                      >
                        <Checkbox
                          checked={selectedInstances.has(instance.token)}
                          onCheckedChange={() =>
                            toggleInstanceSelection(instance.token)
                          }
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground truncate">
                              {instance.name}
                            </p>
                            {isUnlinked && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                                desvinculada
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {instance.token}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Already linked instances with unlink button */}
                  {alreadyLinkedInstances.map((instance) => (
                    <div
                      key={instance.token}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/30 opacity-70"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {instance.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {instance.token}
                        </p>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 bg-orange-500/15 hover:bg-orange-500/25 text-orange-500 hover:text-orange-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnlinkClick(instance);
                            }}
                          >
                            <Unlink className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Desvincular instância</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <Button
              className="w-full bg-primary/80 hover:bg-primary"
              onClick={handleImport}
              disabled={selectedInstances.size === 0 || importInstance.isPending || !canCreateInstance}
            >
              {importInstance.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              <Plus className="h-4 w-4 mr-2" />
              {canCreateInstance 
                ? `Vincular Instâncias${selectedInstances.size > 0 ? ` (${selectedInstances.size})` : ""}`
                : "Limite Atingido"
              }
            </Button>
          </div>
        )}

        {/* Manual Tab Content */}
        {activeTab === "manual" && (
          <ManualConnectTab
            subaccountId={subaccount.id}
            canCreateInstance={canCreateInstance}
            onSuccess={() => {
              setOpen(false);
            }}
          />
        )}

        {/* Unlink Confirmation Dialog */}
        <AlertDialog open={unlinkConfirmOpen} onOpenChange={setUnlinkConfirmOpen}>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle>Desvincular instância?</AlertDialogTitle>
              <AlertDialogDescription>
                A instância <span className="font-semibold text-foreground">{instanceToUnlink?.instance_name}</span> será removida do sistema. Ela continuará disponível no servidor para uma nova importação.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={confirmUnlink}
                disabled={deleteInstance.isPending}
              >
                {deleteInstance.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Desvincular
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
