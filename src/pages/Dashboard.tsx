import { useState } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SubaccountCard } from "@/components/dashboard/SubaccountCard";
import { InstanceCard } from "@/components/dashboard/InstanceCard";
import { AddInstanceDialog } from "@/components/dashboard/AddInstanceDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useSubaccounts, Subaccount } from "@/hooks/useSubaccounts";
import { useInstances } from "@/hooks/useInstances";
import { useSettings } from "@/hooks/useSettings";
import { useSubscription } from "@/hooks/useSubscription";
import { PlansDialog } from "@/components/dashboard/PlansDialog";
import { RefreshCw, Search, ArrowLeft, Loader2, AlertCircle, Plus, Smartphone, Link2, Eye, Lock, CreditCard, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CANONICAL_APP_ORIGIN } from "@/lib/canonicalOrigin";

export default function Dashboard() {
  const [selectedSubaccount, setSelectedSubaccount] = useState<Subaccount | null>(null);
  const [search, setSearch] = useState("");
  const { subaccounts, isLoading, syncSubaccounts, isSharedAccount } = useSubaccounts();
  const { instances, syncAllInstancesStatus, linkedInstanceCount, unlinkedInstanceCount, instanceLimit } = useInstances(selectedSubaccount?.id);
  const { settings } = useSettings();
  const { hasActiveSubscription, isInGracePeriod, gracePeriodEndsAt } = useSubscription();

  const filteredSubaccounts = subaccounts.filter((s) =>
    s.account_name.toLowerCase().includes(search.toLowerCase()) ||
    s.location_id.toLowerCase().includes(search.toLowerCase())
  );

  const hasGHLToken = !!settings?.ghl_agency_token;
  const hasUAZAPIConfig = !!settings?.uazapi_admin_token && !!settings?.uazapi_base_url;

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
                        
                        await supabase
                          .from("ghl_subaccounts")
                          .update({ embed_token: token })
                          .eq("id", selectedSubaccount.id);
                      }
                      
                      const embedUrl = `${CANONICAL_APP_ORIGIN}/embed/${token}?iframe=true`;
                      await navigator.clipboard.writeText(embedUrl);
                      toast.success("Link copiado para a área de transferência!");
                    } catch (error) {
                      toast.error("Erro ao gerar link");
                    }
                  }}
                  className={hasActiveSubscription ? "border-border" : "border-border opacity-40 cursor-not-allowed"}
                >
                  <Link2 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Copiar Link GHL</span>
                </Button>
                {hasUAZAPIConfig && !isSharedAccount && hasActiveSubscription && (
                  <AddInstanceDialog subaccount={selectedSubaccount} />
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

          {/* Alert if UAZAPI not configured */}
          {!hasUAZAPIConfig && !isSharedAccount && hasActiveSubscription && (
            <Alert className="border-warning bg-warning/10">
              <AlertCircle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                Configure seu token UAZAPI nas configurações para criar e gerenciar instâncias.
              </AlertDescription>
            </Alert>
          )}

          {/* Instances Grid */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {/* Instance Cards */}
            {instances.map((instance) => (
              <InstanceCard key={instance.id} instance={instance} />
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
                Configure a UAZAPI nas configurações para começar a criar instâncias.
              </p>
            </div>
          )}
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


        {/* Alert if GHL not configured */}
        {!hasGHLToken && !isSharedAccount && (
          <Alert className="border-warning bg-warning/10">
            <AlertCircle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning">
              Configure seu token de agência GoHighLevel nas configurações para sincronizar subcontas.
            </AlertDescription>
          </Alert>
        )}

        {/* Search */}
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar subcontas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary border-border"
          />
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
              {subaccounts.length === 0 ? "Nenhuma subconta" : "Nenhum resultado"}
            </h3>
            <p className="text-muted-foreground max-w-md">
              {subaccounts.length === 0
                ? "Clique em 'Sincronizar CRM' para importar suas subcontas do GoHighLevel."
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
      </div>
    </DashboardLayout>
  );
}
