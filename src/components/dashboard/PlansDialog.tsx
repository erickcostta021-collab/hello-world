import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Check, CreditCard, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    key: "flexible",
    name: "Flexível",
    description: "Comece com até 5 conexões grátis por 5 dias",
    pricePerUnit: 35,
    isFlexible: true,
    trialInfo: "Trial grátis de 5 dias (até 5 conexões)",
  },
  {
    key: "plan_50",
    name: "50 Conexões",
    description: "Para negócios em crescimento",
    price: 798,
    instances: 50,
  },
  {
    key: "plan_100",
    name: "100 Conexões",
    description: "Para agências e equipes",
    price: 1298,
    instances: 100,
    popular: true,
  },
];

const BENEFITS = [
  "Subcontas ilimitadas",
  "Mensagens ilimitadas",
  "Switcher automático",
  "Suporte prioritário",
];

interface PlansDialogProps {
  children: React.ReactNode;
}

export function PlansDialog({ children }: PlansDialogProps) {
  const [open, setOpen] = useState(false);
  const [flexibleQuantity, setFlexibleQuantity] = useState(1);
  const navigate = useNavigate();

  const handleSelectPlan = (planKey: string, quantity?: number) => {
    const params = new URLSearchParams({ plan: planKey });
    if (quantity) params.set("quantity", String(quantity));
    navigate(`/checkout?${params.toString()}`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center">
            Escolha seu Plano
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-3 mt-4">
          {PLANS.map((plan) => {
            const isFlexible = plan.isFlexible;
            const price = isFlexible
              ? plan.pricePerUnit! * flexibleQuantity
              : plan.price!;
            const instances = isFlexible ? flexibleQuantity : plan.instances!;

            return (
              <div
                key={plan.key}
                className={cn(
                  "relative rounded-xl border p-5 flex flex-col transition-all hover:border-primary/50 hover:scale-[1.02]",
                  plan.popular
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                )}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    Popular
                  </span>
                )}

                <h3 className="text-lg font-semibold text-foreground">
                  {plan.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  {plan.description}
                </p>


                {isFlexible && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">
                       Conexões
                       </span>
                     <span className="text-sm font-bold text-primary">
                       {flexibleQuantity}
                      </span>
                    </div>
                    <Slider
                      value={[flexibleQuantity]}
                      onValueChange={(v) => setFlexibleQuantity(v[0])}
                      min={1}
                      max={10}
                      step={1}
                    />
                    {flexibleQuantity <= 5 && (
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Até 5 conexões: teste grátis. A partir de 6: cobrança imediata.
                      </p>
                    )}
                  </div>
                )}

                <div className="mb-4">
                  <span className="text-3xl font-bold text-foreground">
                    R${price}
                  </span>
                  <span className="text-muted-foreground text-sm">/mês</span>
                  {isFlexible && (
                     <p className="text-xs text-primary mt-1">
                       R$35 por conexão
                     </p>
                  )}
                  {isFlexible && flexibleQuantity <= 5 && (
                    <p className="text-xs text-green-500 font-medium mt-0.5">
                      Cobrado apenas após o trial
                    </p>
                  )}
                </div>

                <ul className="space-y-2 mb-5 flex-1">
                  {BENEFITS.map((b) => (
                    <li
                      key={b}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      {b}
                    </li>
                  ))}
                   <li className="flex items-center gap-2 text-sm text-muted-foreground">
                     <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                     {instances} conexão{instances > 1 ? "ões" : ""} WhatsApp ↔ GHL
                   </li>
                </ul>

                <Button
                  onClick={() =>
                    handleSelectPlan(
                      plan.key,
                      isFlexible ? flexibleQuantity : undefined
                    )
                  }
                  className={cn(
                    "w-full",
                    plan.popular
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                      : "bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                  )}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {isFlexible && flexibleQuantity <= 5
                    ? "Testar Grátis"
                    : "Assinar Plano"}
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
