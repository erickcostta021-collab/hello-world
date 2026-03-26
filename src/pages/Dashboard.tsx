import { useState } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SubaccountCard } from "@/components/dashboard/SubaccountCard";
import { InstanceCard } from "@/components/dashboard/InstanceCard";
import { AddInstanceDialog } from "@/components/dashboard/AddInstanceDialog";
import { CreateUnlinkedInstanceDialog } from "@/components/dashboard/CreateUnlinkedInstanceDialog";
import { CreateFolderDialog } from "@/components/dashboard/CreateFolderDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSubaccounts, Subaccount } from "@/hooks/useSubaccounts";
import { useInstances } from "@/hooks/useInstances";
import { useSettings } from "@/hooks/useSettings";
import { useSubscription } from "@/hooks/useSubscription";
import { PlansDialog } from "@/components/dashboard/PlansDialog";
import { RefreshCw, Search, ArrowLeft, Loader2, AlertCircle, Plus, Smartphone, Link2, Eye, Lock, CreditCard, Clock, ChevronDown, RotateCw, KeyRound, LayoutGrid, Building2, FolderOpen } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CANONICAL_APP_ORIGIN } from "@/lib/canonicalOrigin";
import { useAuth } from "@/hooks/useAuth";
import { useImpersonation } from "@/hooks/useImpersonation";
import { getEffectiveUserId } from "@/hooks/useSettings";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Instance } from "@/hooks/instances/instanceApi";

export default function Dashboard() {
  const [selectedSubaccount, setSelectedSubaccount] = useState<Subaccount | null>(null);
  const [search, setSearch] = useState("");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [embedPassword, setEmbedPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [viewMode, setViewMode] = useState<"subaccounts" | "folders" | "all-instances">("subaccounts");
  const [instanceSearch, setInstanceSearch] = useState("");
  const [instanceFilter, setInstanceFilter] = useState<"all" | "connected" | "disconnected" | "linked" | "unlinked">("all");
  const { user } = useAuth();
  const impersonatedUserId = useImpersonation((s) => s.impersonatedUserId);
  const { subaccounts, isLoading, syncSubaccounts, isSharedAccount } = useSubaccounts();
  const { instances, syncAllInstancesStatus, linkedInstanceCount, unlinkedInstanceCount, instanceLimit, isManagedMode } = useInstances(selectedSubaccount?.id);
  const { settings } = useSettings();
  const { hasActiveSubscription, isInGracePeriod, gracePeriodEndsAt } = useSubscription();

  // Query all instances for the "all instances" view
  const { data: allInstances = [], isLoading: allInstancesLoading } = useQuery({
    queryKey: ["all-instances-dashboard", user?.id, impersonatedUserId],
    queryFn: async () => {
      if (!user) return [];
      const effectiveUserId = impersonatedUserId || await getEffectiveUserId(user.id);
      const { data, error } = await supabase
        .from("instances")
        .select("*")
        .eq("user_id", effectiveUserId)
        .order("instance_name");
      if (error) throw error;
      return data as Instance[];
    },
    enabled: !!user && viewMode === "all-instances",
  });

  const handleRegenerateLink = async () => {
    if (!selectedSubaccount) return;
    try {
      const { data: tokenData } = await supabase.rpc("generate_embed_token");
      const token = tokenData || btoa(crypto.randomUUID()).slice(0, 20);
      await supabase
        .from("ghl_subaccounts")
        .update({ embed_token: token })
        .eq("id", selectedSubaccount.id);
      const embedUrl = `${CANONICAL_APP_ORIGIN}/embed/${token}?iframe=true`;
      await navigator.clipboard.writeText(embedUrl);
      toast.success("Novo link gerado e copiado!");
    } catch {
      toast.error("Erro ao gerar novo link");
    }
  };

  const handleSavePassword = async () => {
    if (!selectedSubaccount) return;
    setSavingPassword(true);
    try {
      await supabase
        .from("ghl_subaccounts")
        .update({ embed_password: embedPassword.trim() || null })
        .eq("id", selectedSubaccount.id);
      toast.success(embedPassword.trim() ? "Senha definida com sucesso!" : "Senha removida!");
      setPasswordDialogOpen(false);
    } catch {
      toast.error("Erro ao salvar senha");
    } finally {
      setSavingPassword(false);
    }
  };

  const openPasswordDialog = async () => {
    if (!selectedSubaccount) return;
    const { data } = await supabase
      .from("ghl_subaccounts")
      .select("embed_password")
      .eq("id", selectedSubaccount.id)
      .single();
    setEmbedPassword((data as any)?.embed_password || "");
    setPasswordDialogOpen(true);
  };

  // Separate folders from real subaccounts
  const realSubaccounts = subaccounts.filter((s) => !s.location_id.startsWith("folder_"));
  const folderSubaccounts = subaccounts.filter((s) => s.location_id.startsWith("folder_"));

  const filteredSubaccounts = realSubaccounts.filter((s) =>
    s.account_name.toLowerCase().includes(search.toLowerCase()) ||
    s.location_id.toLowerCase().includes(search.toLowerCase())
  );

  const filteredFolders = folderSubaccounts.filter((s) =>
    s.account_name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredAllInstances = allInstances
    .filter((inst) => {
      if (instanceFilter === "connected") return inst.instance_status === "connected";
      if (instanceFilter === "disconnected") return inst.instance_status === "disconnected";
      if (instanceFilter === "linked") return !!inst.subaccount_id;
      if (instanceFilter === "unlinked") return !inst.subaccount_id;
      return true;
    })
    .filter((inst) =>
      inst.instance_name.toLowerCase().includes(instanceSearch.toLowerCase()) ||
      (inst.phone || "").includes(instanceSearch)
    );

  const getSubaccountName = (subaccountId: string | null) => {
    if (!subaccountId) return null;
    const sub = subaccounts.find((s) => s.id === subaccountId);
    return sub?.account_name || null;
  };

  const hasGHLToken = !!settings?.ghl_agency_token;
  const hasUAZAPIConfig = isManagedMode || (!!settings?.uazapi_admin_token && !!settings?.uazapi_base_url);

  if (selectedSubaccount) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedSubaccount(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Minhas Instâncias
                </h1>
                <p className="text-muted-foreground">
                  Gerencie suas conexões do WhatsApp e status em tempo real.
                </p>
              </div>
            </div>
            
            {/* Subaccount Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-secondary/50 rounded-xl border border-border">
              <div>
                <p className="font-medium text-foreground">{selectedSubaccount.account_name}</p>
                <p className="text-xs text-muted-foreground font-mono">{selectedSubaccount.location_id}</p>
                {instanceLimit > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {linkedInstanceCount} vinculada{linkedInstanceCount !== 1 ? "s" : ""} de {instanceLimit}
                    {unlinkedInstanceCount > 0 && ` · ${unlinkedInstanceCount} disponíve${unlinkedInstanceCount !== 1 ? "is" : "l"}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncAllInstancesStatus.mutate()}
                  disabled={syncAllInstancesStatus.isPending || instances.length === 0}
                  className="border-border"
                >
                  {syncAllInstancesStatus.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline ml-2">Atualizar Status</span>
                </Button>
                <div className="flex items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasActiveSubscription}
                    onClick={async () => {
                      try {
                        let token = selectedSubaccount.embed_token;
                        if (!token) {
                          const { data: tokenData } = await supabase.rpc("generate_embed_token");
                          token = tokenData || btoa(crypto.randomUUID()).slice(0, 20);
                          await supabase.from("ghl_subaccounts").update({ embed_token: token }).eq("id", selectedSubaccount.id);
                        }
                        const embedUrl = `${CANONICAL_APP_ORIGIN}/embed/${token}?iframe=true`;
                        await navigator.clipboard.writeText(embedUrl);
                        toast.success("Link copiado para a área de transferência!");
                      } catch {
                        toast.error("Erro ao gerar link");
                      }
                    }}
                    className={`rounded-r-none ${hasActiveSubscription ? "border-border" : "border-border opacity-40 cursor-not-allowed"}`}
                  >
                    <Link2 className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Copiar Link GHL</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasActiveSubscription}
                        className="rounded-l-none border-l-0 px-2 border-border"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleRegenerateLink}>
                        <RotateCw className="h-4 w-4 mr-2" />
                        Gerar novo link
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={openPasswordDialog}>
                        <KeyRound className="h-4 w-4 mr-2" />
                        Definir senha
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {!isSharedAccount && hasActiveSubscription && (
                  <AddInstanceDialog subaccount={selectedSubaccount} hasUAZAPIConfig={hasUAZAPIConfig} />
                )}
                {!hasActiveSubscription && !isSharedAccount && (
                  <PlansDialog>
                    <Button className="bg-brand-green hover:bg-brand-green/90" size="sm">
                      <Lock className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Assinar Plano</span>
                    </Button>
                  </PlansDialog>
                )}
              </div>
            </div>
          </div>

          {/* Grace Period Warning */}
          {isInGracePeriod && !isSharedAccount && (
            <Alert className="border-orange-500 bg-orange-500/10">
              <Clock className="h-4 w-4 text-orange-500" />
              <AlertDescription className="text-orange-500">
                <strong>Pagamento pendente!</strong> Seu pagamento não foi identificado. Você tem até{" "}
                <strong>
                  {gracePeriodEndsAt?.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </strong>{" "}
                para regularizar. Após essa data, todas as instâncias serão desvinculadas das subcontas e você perderá as configurações feitas no dashboard.
              </AlertDescription>
            </Alert>
          )}

          {/* No Subscription Alert */}
          {!hasActiveSubscription && !isSharedAccount && !isInGracePeriod && (
            <Alert className="border-amber-500 bg-amber-500/10">
              <CreditCard className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-500">
                Você não possui um plano ativo.{" "}
                <PlansDialog>
                  <button className="underline font-medium cursor-pointer">Assine agora</button>
                </PlansDialog>{" "}
                para criar instâncias e baixar o app.
              </AlertDescription>
            </Alert>
          )}

          {/* Shared Account Alert */}
          {isSharedAccount && (
            <Alert className="border-blue-500 bg-blue-500/10">
              <Eye className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-500">
                Você está visualizando o dashboard de outra conta (modo espelho). Apenas visualização disponível.
              </AlertDescription>
            </Alert>
          )}

          {/* Alert if API not configured */}
          {!hasUAZAPIConfig && !isSharedAccount && hasActiveSubscription && (
            <Alert className="border-warning bg-warning/10">
              <AlertCircle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                {isManagedMode
                  ? "Entre em contato com o administrador para configurar sua conta."
                  : "Configure seu token UAZAPI nas configurações para criar e gerenciar instâncias."}
              </AlertDescription>
            </Alert>
          )}

          {/* Instances Grid */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {/* Instance Cards */}
            {instances.map((inst) => (
              <InstanceCard key={inst.id} instance={inst} allInstances={instances} />
            ))}
          </div>

          {/* Empty State */}
          {instances.length === 0 && !hasUAZAPIConfig && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 bg-muted rounded-full mb-4">
                <Smartphone className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                Nenhuma instância
              </h3>
              <p className="text-muted-foreground max-w-md">
                {isManagedMode
                  ? "Entre em contato com o administrador para configurar suas instâncias."
                  : "Configure a UAZAPI nas configurações para começar a criar instâncias."}
              </p>
            </div>
          )}


          {/* Password Dialog */}
          <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Senha do Link GHL</DialogTitle>
                <DialogDescription>
                  Defina uma senha para proteger o acesso ao link embed. Deixe em branco para remover a senha.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <Input
                  type="text"
                  placeholder="Digite a senha..."
                  value={embedPassword}
                  onChange={(e) => setEmbedPassword(e.target.value)}
                />
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleSavePassword} disabled={savingPassword}>
                  {savingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Dashboard Gestor
              {isSharedAccount && (
                <span className="ml-2 text-sm font-normal text-blue-500">(Modo Espelho)</span>
              )}
            </h1>
            <p className="text-muted-foreground">
              {isSharedAccount 
                ? "Visualizando dashboard compartilhado - somente leitura" 
                : "Gerencie suas subcontas e instâncias"}
            </p>
          </div>
          {hasGHLToken && !isSharedAccount && (
            <Button
              onClick={() => syncSubaccounts.mutate()}
              disabled={syncSubaccounts.isPending}
              className="bg-primary hover:bg-primary/90"
            >
              {syncSubaccounts.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sincronizar CRM
            </Button>
          )}
        </div>

        {/* Grace Period Warning */}
        {isInGracePeriod && !isSharedAccount && (
          <Alert className="border-orange-500 bg-orange-500/10">
            <Clock className="h-4 w-4 text-orange-500" />
            <AlertDescription className="text-orange-500">
              <strong>Pagamento pendente!</strong> Seu pagamento não foi identificado. Você tem até{" "}
              <strong>
                {gracePeriodEndsAt?.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </strong>{" "}
              para regularizar. Após essa data, todas as instâncias serão desvinculadas e você perderá as configurações.
            </AlertDescription>
          </Alert>
        )}

        {/* Shared Account Alert */}
        {isSharedAccount && (
          <Alert className="border-blue-500 bg-blue-500/10">
            <Eye className="h-4 w-4 text-blue-500" />
            <AlertDescription className="text-blue-500">
              Você está visualizando o dashboard de outra conta que usa o mesmo token de agência. 
              Apenas visualização disponível - você não pode modificar dados.
            </AlertDescription>
          </Alert>
        )}



        {/* View Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "subaccounts" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("subaccounts")}
            className="gap-2"
          >
            <Building2 className="h-4 w-4" />
            Subcontas
          </Button>
          <Button
            variant={viewMode === "folders" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("folders")}
            className="gap-2"
          >
            <FolderOpen className="h-4 w-4" />
            Pastas
          </Button>
          <Button
            variant={viewMode === "all-instances" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("all-instances")}
            className="gap-2"
          >
            <LayoutGrid className="h-4 w-4" />
            Todas as Instâncias
          </Button>
        </div>

        {viewMode === "subaccounts" ? (
          <>
            {/* Search */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar subcontas..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-secondary border-border"
                />
              </div>
            </div>

            {/* Subaccounts Grid */}
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredSubaccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="p-4 bg-muted rounded-full mb-4">
                  <AlertCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {realSubaccounts.length === 0 ? "Nenhuma subconta" : "Nenhum resultado"}
                </h3>
                <p className="text-muted-foreground max-w-md">
                  {realSubaccounts.length === 0
                    ? hasGHLToken
                      ? "Clique em 'Sincronizar CRM' para importar suas subcontas do GoHighLevel."
                      : "Clique em 'Conectar Subconta' no topo da página para conectar sua primeira subconta."
                    : "Tente ajustar sua busca."}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredSubaccounts.map((subaccount) => (
                  <SubaccountCard
                    key={subaccount.id}
                    subaccount={subaccount}
                    onClick={() => setSelectedSubaccount(subaccount)}
                  />
                ))}
              </div>
            )}
          </>
        ) : viewMode === "folders" ? (
          <>
            {/* Search + Create Folder */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar pastas..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-secondary border-border"
                />
              </div>
              <CreateFolderDialog />
            </div>

            {/* Folders Grid */}
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredFolders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="p-4 bg-muted rounded-full mb-4">
                  <FolderOpen className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {folderSubaccounts.length === 0 ? "Nenhuma pasta" : "Nenhum resultado"}
                </h3>
                <p className="text-muted-foreground max-w-md mb-4">
                  {folderSubaccounts.length === 0
                    ? "Crie pastas para organizar suas instâncias."
                    : "Tente ajustar sua busca."}
                </p>
                {folderSubaccounts.length === 0 && <CreateFolderDialog />}
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredFolders.map((folder) => (
                  <SubaccountCard
                    key={folder.id}
                    subaccount={folder}
                    onClick={() => setSelectedSubaccount(folder)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* All Instances Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar instâncias por nome ou telefone..."
                  value={instanceSearch}
                  onChange={(e) => setInstanceSearch(e.target.value)}
                  className="pl-10 bg-secondary border-border"
                />
              </div>
              <div className="flex items-center gap-2">
                {!isSharedAccount && hasActiveSubscription && hasUAZAPIConfig && (
                  <CreateUnlinkedInstanceDialog />
                )}
              </div>
            </div>

            {/* Filters */}
            {!allInstancesLoading && allInstances.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <Button
                  variant={instanceFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInstanceFilter("all")}
                  className="h-7 text-xs"
                >
                  Todas ({allInstances.length})
                </Button>
                <Button
                  variant={instanceFilter === "connected" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInstanceFilter("connected")}
                  className="h-7 text-xs gap-1.5"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Conectadas ({allInstances.filter(i => i.instance_status === "connected").length})
                </Button>
                <Button
                  variant={instanceFilter === "disconnected" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInstanceFilter("disconnected")}
                  className="h-7 text-xs gap-1.5"
                >
                  <span className="h-2 w-2 rounded-full bg-destructive" />
                  Desconectadas ({allInstances.filter(i => i.instance_status === "disconnected").length})
                </Button>
                <Button
                  variant={instanceFilter === "linked" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInstanceFilter("linked")}
                  className="h-7 text-xs gap-1.5"
                >
                  <Link2 className="h-3 w-3" />
                  Vinculadas ({allInstances.filter(i => !!i.subaccount_id).length})
                </Button>
                <Button
                  variant={instanceFilter === "unlinked" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInstanceFilter("unlinked")}
                  className="h-7 text-xs gap-1.5"
                >
                  Desvinculadas ({allInstances.filter(i => !i.subaccount_id).length})
                </Button>
              </div>
            )}

            {/* All Instances Grid */}
            {allInstancesLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredAllInstances.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="p-4 bg-muted rounded-full mb-4">
                  <Smartphone className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {allInstances.length === 0 ? "Nenhuma instância" : "Nenhum resultado"}
                </h3>
                <p className="text-muted-foreground max-w-md mb-4">
                  {allInstances.length === 0
                    ? "Crie instâncias aqui ou a partir de uma subconta."
                    : "Tente ajustar sua busca."}
                </p>
                {allInstances.length === 0 && !isSharedAccount && hasActiveSubscription && hasUAZAPIConfig && (
                  <CreateUnlinkedInstanceDialog />
                )}
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredAllInstances.map((inst) => {
                  const subName = getSubaccountName(inst.subaccount_id);
                  return (
                    <div key={inst.id} className="relative">
                      {subName ? (
                        <div className="absolute -top-2.5 left-3 z-10">
                          <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-secondary border border-border shadow-sm">
                            {subName}
                          </Badge>
                        </div>
                      ) : (
                        <div className="absolute -top-2.5 left-3 z-10">
                          <Badge variant="outline" className="text-[10px] px-2 py-0 border-muted-foreground/30 text-muted-foreground shadow-sm">
                            Sem subconta
                          </Badge>
                        </div>
                      )}
                      <InstanceCard instance={inst} allInstances={filteredAllInstances} />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
