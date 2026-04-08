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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowUpCircle, CreditCard, X } from "lucide-react";

interface Subscription {
  id: string;
  plan: string;
  status: string;
  amount: number;
  currency: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

const PLANS = [
  { key: "flexible", name: "Flexível", price: "A partir de R$29", description: "1-10 conexões" },
  { key: "plan_50", name: "50 Conexões", price: "R$898", description: "/mês" },
  { key: "plan_100", name: "100 Conexões", price: "R$1.498", description: "/mês", popular: true },
  { key: "plan_300", name: "300 Conexões", price: "R$2.998", description: "/mês" },
];

export function SubscriptionDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const navigate = useNavigate();
  const impersonatedUserId = useImpersonation((s) => s.impersonatedUserId);
  const { profile } = useAccountStatus();

  const { data, isLoading } = useQuery({
    queryKey: ["subscription-details", impersonatedUserId],
    queryFn: async () => {
      const body: any = {};
      if (impersonatedUserId && profile?.email) {
        body.email = profile.email;
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

  const handleOpenPortal = async (flow?: "subscription_cancel" | "payment_method_update") => {
    setLoadingPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.error) {
        toast.error("Nenhuma forma de pagamento cadastrada.");
        return;
      }
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch {
      toast.error("Erro ao abrir portal de pagamento");
    } finally {
      setLoadingPortal(false);
    }
  };

  const handleSelectPlan = (planKey: string) => {
    navigate(`/checkout?plan=${planKey}`);
    setOpen(false);
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
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSelectedSub(null); setShowPlans(false); } }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md p-6">
        {/* Subscription detail view */}
        {selectedSub && !showPlans ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">{selectedSub.plan}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={statusLabel(selectedSub.status).variant}>
                    {statusLabel(selectedSub.status).label}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Valor</p>
                  <p className="font-semibold text-foreground">
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

              <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
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
                  <ArrowUpCircle className="h-4 w-4 mr-1" />
                  Atualizar assinatura
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenPortal("payment_method_update")}
                  disabled={loadingPortal}
                >
                  <CreditCard className="h-4 w-4 mr-1" />
                  Mudar Cartão
                </Button>
              </div>
            </div>
          </>
        ) : selectedSub && showPlans ? (
          /* Plan selector */
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">Selecione o plano</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 mt-2">
              {PLANS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => handleSelectPlan(p.key)}
                  className="w-full flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors text-left"
                >
                  <div>
                    <p className="font-semibold text-foreground">{p.name}</p>
                    {p.popular && (
                      <Badge variant="secondary" className="mt-1 text-xs">Popular</Badge>
                    )}
                  </div>
                  <span className="font-bold text-foreground">
                    {p.price}<span className="text-sm font-normal text-muted-foreground"> {p.description}</span>
                  </span>
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowPlans(false)}>
              ← Voltar
            </Button>
          </>
        ) : (
          /* Subscription list */
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
                <p className="text-muted-foreground mb-4">Nenhuma assinatura ativa</p>
                <Button onClick={() => { navigate("/checkout?plan=flexible"); setOpen(false); }}>
                  Assinar um plano
                </Button>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-sm text-muted-foreground mb-3">
                  Selecione uma assinatura para mais detalhes
                </p>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-2 gap-0 bg-primary/10 px-4 py-2">
                    <span className="text-sm font-semibold text-foreground">Plano</span>
                    <span className="text-sm font-semibold text-foreground">Status</span>
                  </div>
                  {subscriptions.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setSelectedSub(sub)}
                      className="w-full grid grid-cols-2 gap-0 px-4 py-3 hover:bg-accent/50 transition-colors border-t border-border text-left"
                    >
                      <span className="text-sm text-foreground">{sub.plan}</span>
                      <span className="text-sm text-foreground">
                        {statusLabel(sub.status).label}
                        {sub.current_period_end && sub.status === "active" && (
                          <span className="text-muted-foreground">
                            {" "}— vence {formatDate(sub.current_period_end)}
                          </span>
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
