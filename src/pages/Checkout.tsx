import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Zap, Check } from "lucide-react";
import circleLogo from "@/assets/bridge-circle-logo.png";
import { useAuth } from "@/hooks/useAuth";

const PLANS = {
  flexible: {
    name: "Flexível",
    description: "Escolha a quantidade ideal",
    pricePerUnit: 35,
    minQuantity: 1,
    maxQuantity: 10,
  },
  plan_50: {
    name: "50 Conexões",
    description: "Para negócios em crescimento",
    price: 798,
    instances: 50,
  },
  plan_100: {
    name: "100 Conexões",
    description: "Para agências e equipes",
    price: 1298,
    instances: 100,
    popular: true,
  },
  plan_300: {
    name: "300 Conexões",
    description: "Para grandes operações",
    price: 2998,
    instances: 300,
  },
};

const Checkout = () => {
  const [searchParams] = useSearchParams();
  const planParam = searchParams.get("plan") || "flexible";
  const quantityParam = parseInt(searchParams.get("quantity") || "1", 10);
  const { user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [quantity, setQuantity] = useState(
    planParam === "flexible" ? Math.min(Math.max(quantityParam, 1), 10) : 1
  );

  const isLoggedIn = !!user;

  // Auto-fill email when user is logged in
  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user]);

  const plan = PLANS[planParam as keyof typeof PLANS] || PLANS.flexible;
  const isFlexible = planParam === "flexible";
  
  const totalPrice = isFlexible 
    ? (PLANS.flexible.pricePerUnit * quantity)
    : (plan as { price: number }).price;
  
  const totalInstances = isFlexible 
    ? quantity 
    : (plan as { instances: number }).instances;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes("@")) {
      toast.error("Por favor, insira um email válido");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          plan: planParam,
          quantity: isFlexible ? quantity : 1,
          email: email.trim().toLowerCase(),
        },
      });

      if (error) {
        const anyError = error as any;
        let serverMessage: string | undefined;
        let serverCode: string | undefined;

        try {
          const response: Response | undefined = anyError?.context?.response;
          if (response) {
            const text = await response.text();
            if (text) {
              const parsed = JSON.parse(text);
              serverMessage = parsed?.error;
              serverCode = parsed?.code;
            }
          }
        } catch {
          // ignore parsing errors
        }

        if (serverCode === "EMAIL_EXISTS" && serverMessage) {
          toast.error(serverMessage);
          return;
        }

        toast.error(serverMessage || error.message || "Erro ao iniciar checkout");
        return;
      }

      if (data?.code === "EMAIL_EXISTS") {
        toast.error(data.error);
        return;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error(error.message || "Erro ao iniciar checkout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden shadow-md ring-2 ring-primary/20">
              <img src={circleLogo} alt="Bridge API" className="w-full h-full object-cover scale-[1.85]" />
            </div>
            <span className="text-xl font-semibold text-foreground">Bridge API</span>
          </Link>
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Finalizar Assinatura
            </h1>
            <p className="text-muted-foreground">
              {isLoggedIn 
                ? "Confirme seu plano e finalize a assinatura"
                : "Insira seu email para continuar com o checkout"
              }
            </p>
          </div>

          <div className="bg-card rounded-2xl border border-border p-8">
            {/* Plan Summary */}
            <div className="bg-secondary/50 rounded-xl p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>
                {(plan as any).popular && (
                  <span className="bg-brand-green text-white text-xs font-semibold px-2 py-1 rounded-full">
                    Popular
                  </span>
                )}
              </div>

              {/* Flexible Plan Slider */}
              {isFlexible && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted-foreground">Conexões</span>
                    <span className="text-lg font-bold text-brand-green">{quantity}</span>
                  </div>
                  <Slider
                    value={[quantity]}
                    onValueChange={(value) => setQuantity(value[0])}
                    min={1}
                    max={10}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>1</span>
                    <span>10</span>
                  </div>
                </div>
              )}

              <div className="flex items-baseline justify-between pt-4 border-t border-border">
                <div>
                  <span className="text-3xl font-bold text-foreground">R${totalPrice}</span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {totalInstances} conexão{totalInstances > 1 ? 'ões' : ''}
                </span>
              </div>
            </div>

            {/* Benefits */}
            <div className="mb-8">
              <h4 className="text-sm font-medium text-foreground mb-3">Incluído:</h4>
              <ul className="space-y-2">
                {[
                  "Subcontas ilimitadas",
                  "Mensagens ilimitadas",
                  "Switcher automático",
                  "Suporte prioritário",
                ].map((benefit) => (
                  <li key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-brand-green" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            {/* Email Form */}
            <form onSubmit={handleCheckout} className="space-y-4">
              {!isLoggedIn && (
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-brand-green hover:bg-brand-green/90 text-white py-6 text-lg"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Processando...
                  </>
                ) : isFlexible && quantity <= 5 ? (
                  "Testar Grátis"
                ) : (
                  <>
                    <Zap className="mr-2 h-5 w-5" />
                    Continuar para Pagamento
                  </>
                )}
              </Button>
            </form>

            {!isLoggedIn && (
              <p className="text-xs text-muted-foreground text-center mt-4">
                Ao continuar, você será redirecionado para o Stripe para finalizar o pagamento.
                Após a confirmação, você poderá criar sua conta.
              </p>
            )}
          </div>

          {!isLoggedIn && (
            <p className="text-center text-sm text-muted-foreground mt-6">
              Já tem uma conta?{" "}
              <Link to="/login" className="text-brand-green hover:underline">
                Faça login
              </Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
};

export default Checkout;
