import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useImpersonation } from "@/hooks/useImpersonation";
import { useAccountStatus } from "@/hooks/useAccountStatus";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowUpCircle, CreditCard, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Subscription {
  id: string;
  plan: string;
  status: string;
  amount: number;
  currency: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface SubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PLANS = [
  { key: "flexible", name: "Flexível", price: "A partir de R$29", description: "1-10 conexões" },
  { key: "plan_50", name: "50 Conexões", price: "R$898", description: "/mês" },
  { key: "plan_100", name: "100 Conexões", price: "R$1.498", description: "/mês", popular: true },
  
];

export function SubscriptionDialog({ open, onOpenChange }: SubscriptionDialogProps) {
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const navigate = useNavigate();
  const impersonatedUserId = useImpersonation((s) => s.impersonatedUserId);
  const { profile } = useAccountStatus();

  const lookupEmail = impersonatedUserId ? profile?.email ?? null : null;

  const { data, isLoading } = useQuery({
    queryKey: ["subscription-details", lookupEmail],
    queryFn: async () => {
      const body: { email?: string } = {};
      if (lookupEmail) {
        body.email = lookupEmail;
      }

      const { data, error } = await supabase.functions.invoke("subscription-details", {
        body: Object.keys(body).length > 0 ? body : undefined,
      });

      if (error) throw error;
      return data as { subscriptions: Subscription[] };
    },
    enabled: open,
    staleTime: 1000 * 30,
  });

  const subscriptions = data?.subscriptions ?? [];

  const handleDialogChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);

    if (!nextOpen) {
      setSelectedSub(null);
      setShowPlans(false);
      setPendingPlan(null);
    }
  };

  const handleOpenPortal = async (flow?: "payment_method_update" | "subscription_cancel") => {
    setLoadingPortal(true);

    try {
      const portalBody: { email?: string; flow?: "payment_method_update" | "subscription_cancel" } = {};

      if (lookupEmail) {
        portalBody.email = lookupEmail;
      }

      if (flow) {
        portalBody.flow = flow;
      }

      const { data, error } = await supabase.functions.invoke("customer-portal", {
        body: Object.keys(portalBody).length > 0 ? portalBody : undefined,
      });

      if (error) throw error;

      if (data?.error === "NO_CUSTOMER") {
        toast.error("Cliente do Stripe não encontrado para esta conta.");
        return;
      }

      if (data?.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
        return;
      }

      throw new Error("URL do portal não retornada");
    } catch (error) {
      console.error("Portal error:", error);
      toast.error("Erro ao abrir portal de pagamento");
    } finally {
      setLoadingPortal(false);
    }
  };

  const handleSelectPlan = (planKey: string) => {
    navigate(`/checkout?plan=${planKey}&upgrade=true`);
    onOpenChange(false);
    setSelectedSub(null);
    setShowPlans(false);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";

    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const statusLabel = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      active: { label: "Ativa", variant: "default" },
      trialing: { label: "Trial", variant: "secondary" },
      past_due: { label: "Pagamento pendente", variant: "destructive" },
    };

    return map[status] ?? { label: status, variant: "outline" as const };
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-md p-6">
        {selectedSub && !showPlans ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">{selectedSub.plan}</DialogTitle>
            </DialogHeader>

            <div className="mt-4 space-y-5">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={statusLabel(selectedSub.status).variant} className="mt-1">
                    {statusLabel(selectedSub.status).label}
                  </Badge>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Valor</p>
                  <p className="text-lg font-semibold text-foreground">
                    R${selectedSub.amount.toFixed(0)}/mês
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Próxima cobrança</p>
                  <p className="font-medium text-foreground">
                    {selectedSub.cancel_at_period_end
                      ? "Cancelada ao final do período"
                      : formatDate(selectedSub.current_period_end)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 border-t border-border pt-5">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleOpenPortal("subscription_cancel")}
                  disabled={loadingPortal}
                >
                  Cancelar assinatura
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPlans(true)}
                >
                  <ArrowUpCircle className="mr-1 h-4 w-4" />
                  Atualizar assinatura
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenPortal("payment_method_update")}
                  disabled={loadingPortal}
                >
                  <CreditCard className="mr-1 h-4 w-4" />
                  Mudar Cartão
                </Button>
              </div>
            </div>
          </>
        ) : selectedSub && showPlans ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">Selecione o plano</DialogTitle>
            </DialogHeader>

            <div className="mt-2 space-y-2">
              {PLANS.map((plan) => (
                <button
                  key={plan.key}
                  onClick={() => handleSelectPlan(plan.key)}
                  className="w-full rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-foreground">{plan.name}</p>
                      {plan.popular && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          Popular
                        </Badge>
                      )}
                    </div>

                    <span className="font-bold text-foreground">
                      {plan.price}
                      <span className="text-sm font-normal text-muted-foreground"> {plan.description}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowPlans(false)}>
              ← Voltar
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">Assinaturas ativas</DialogTitle>
            </DialogHeader>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="py-6 text-center">
                <p className="mb-4 text-muted-foreground">Nenhuma assinatura ativa</p>
                <Button
                  onClick={() => {
                    navigate("/checkout?plan=flexible");
                    handleDialogChange(false);
                  }}
                >
                  Assinar um plano
                </Button>
              </div>
            ) : (
              <div className="mt-2">
                <p className="mb-3 text-sm text-muted-foreground">
                  Selecione uma assinatura para mais detalhes
                </p>

                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="grid grid-cols-2 gap-0 bg-primary/10 px-4 py-2">
                    <span className="text-sm font-semibold text-foreground">Plano</span>
                    <span className="text-sm font-semibold text-foreground">Status</span>
                  </div>

                  {subscriptions.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setSelectedSub(sub)}
                      className="grid w-full grid-cols-2 gap-0 border-t border-border px-4 py-3 text-left transition-colors hover:bg-accent/50"
                    >
                      <span className="text-sm text-foreground">{sub.plan}</span>
                      <span className="text-sm text-foreground">
                        {statusLabel(sub.status).label}
                        {sub.current_period_end && sub.status === "active" && (
                          <span className="text-muted-foreground"> — vence {formatDate(sub.current_period_end)}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
