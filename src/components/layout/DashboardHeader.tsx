import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useSubscription } from "@/hooks/useSubscription";
import { useSettings } from "@/hooks/useSettings";
import { useSidebarState } from "@/hooks/useSidebarState";
import { PlansDialog } from "@/components/dashboard/PlansDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Menu, KeyRound, LogOut, CreditCard, User, Wallet, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import circleLogo from "@/assets/bridge-circle-logo.png";

export function DashboardHeader() {
  const { signOut } = useAuth();
  const { profile } = useProfile();
  const { hasActiveSubscription } = useSubscription();
  const { getOAuthUrl } = useSettings();
  const { toggle } = useSidebarState();
  const navigate = useNavigate();

  const oauthUrl = getOAuthUrl();

  const handleInstallApp = () => {
    if (!oauthUrl) return;
    try {
      const url = new URL(oauthUrl);
      const state = url.searchParams.get("state");
      if (state) localStorage.setItem("ghl_oauth_state", state);
    } catch {
      // ignore
    }
    window.open(oauthUrl, "_blank");
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0]?.toUpperCase() || "U";
  };

  const handleChangePassword = () => {
    navigate("/settings", { state: { openPasswordChange: true } });
  };

  const [loadingPortal, setLoadingPortal] = useState(false);

  const handleManagePayment = async () => {
    setLoadingPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.error) {
        // No Stripe customer found — user has no payment method registered
        toast.error("Nenhuma forma de pagamento cadastrada. Assine um plano primeiro.");
        return;
      }
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        throw new Error("URL do portal não retornada");
      }
    } catch (err: any) {
      console.error("Portal error:", err);
      toast.error("Erro ao abrir gerenciamento de pagamento");
    } finally {
      setLoadingPortal(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 lg:px-8 bg-gradient-to-r from-background/95 via-background/90 to-background/95 backdrop-blur-xl border-b border-border/50 shadow-[0_1px_3px_0_hsl(var(--background)/0.5),0_4px_12px_-2px_hsl(var(--primary)/0.08)]">
      {/* Left: mobile menu + branding */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="lg:hidden text-foreground hover:bg-sidebar-accent"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="group flex items-center gap-3 cursor-default select-none">
          <div className="relative">
            <div className="w-10 h-10 rounded-full overflow-hidden shadow-md ring-2 ring-primary/20 transition-all duration-500 group-hover:scale-110 group-hover:ring-primary/40 group-hover:shadow-[0_0_16px_hsl(var(--primary)/0.25)]">
              <img
                src={circleLogo}
                alt="Bridge API"
                className="w-full h-full object-cover scale-[1.85]"
              />
            </div>
            <div className="absolute -inset-1 rounded-full bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-sm" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-foreground leading-tight">
              Bridge API
            </span>
            <span className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground/60 leading-tight">
              Instance Manager
            </span>
          </div>
        </div>
      </div>

      {/* Right: connect + plans + avatar */}
      <div className="flex items-center gap-2 sm:gap-3">
        {oauthUrl && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={hasActiveSubscription ? handleInstallApp : undefined}
                  disabled={!hasActiveSubscription}
                  className="border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 transition-all duration-300"
                >
                  <ExternalLink className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Conectar Subconta</span>
                </Button>
              </TooltipTrigger>
              {!hasActiveSubscription && (
                <TooltipContent>
                  <p>Assine um plano para conectar subcontas</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}
        <PlansDialog>
          <Button
            size="sm"
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-300"
          >
            <CreditCard className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Comprar Conexões</span>
          </Button>
        </PlansDialog>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="group relative flex items-center gap-2 rounded-full p-0.5 transition-all duration-300 hover:ring-2 hover:ring-primary/30">
              <Avatar className="h-9 w-9 transition-transform duration-300 group-hover:scale-105">
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
                  <User className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="absolute -inset-1 rounded-full bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 mt-1">
            <div className="px-3 py-2">
              <p className="text-sm font-semibold">{profile?.full_name || "Usuário"}</p>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleChangePassword} className="cursor-pointer">
              <KeyRound className="h-4 w-4 mr-2" />
              Alterar Senha
            </DropdownMenuItem>
            {hasActiveSubscription && (
              <DropdownMenuItem
                onClick={handleManagePayment}
                disabled={loadingPortal}
                className="cursor-pointer"
              >
                <Wallet className="h-4 w-4 mr-2" />
                {loadingPortal ? "Abrindo..." : "Gerenciar Pagamento"}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair da Conta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
