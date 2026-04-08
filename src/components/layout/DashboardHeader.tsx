import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useAccountStatus } from "@/hooks/useAccountStatus";
import { useSettings } from "@/hooks/useSettings";
import { useSidebarState } from "@/hooks/useSidebarState";
import { useImpersonation } from "@/hooks/useImpersonation";
import { PlansDialog } from "@/components/dashboard/PlansDialog";
import { SubscriptionDialog } from "@/components/dashboard/SubscriptionDialog";
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
import { Menu, KeyRound, LogOut, CreditCard, User, ExternalLink, ArrowUpCircle } from "lucide-react";
import circleLogo from "@/assets/bridge-circle-logo.png";

export function DashboardHeader() {
  const { signOut } = useAuth();
  const { profile } = useProfile();
  const { hasActiveSubscription, hasStripeSubscription } = useAccountStatus();
  const { getOAuthUrl } = useSettings();
  const { toggle } = useSidebarState();
  const isImpersonating = !!useImpersonation((s) => s.impersonatedUserId);
  const showSubscriptionOptions = hasStripeSubscription || isImpersonating;
  const navigate = useNavigate();
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);

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

  const handleChangePassword = () => {
    navigate("/settings", { state: { openPasswordChange: true } });
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/50 bg-gradient-to-r from-background/95 via-background/90 to-background/95 px-4 shadow-[0_1px_3px_0_hsl(var(--background)/0.5),0_4px_12px_-2px_hsl(var(--primary)/0.08)] backdrop-blur-xl lg:px-8">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="text-foreground hover:bg-sidebar-accent lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="group flex cursor-default select-none items-center gap-3">
          <div className="relative">
            <div className="h-10 w-10 overflow-hidden rounded-full shadow-md ring-2 ring-primary/20 transition-all duration-500 group-hover:scale-110 group-hover:ring-primary/40 group-hover:shadow-[0_0_16px_hsl(var(--primary)/0.25)]">
              <img
                src={circleLogo}
                alt="Bridge API"
                className="h-full w-full object-cover scale-[1.85]"
              />
            </div>
            <div className="absolute -inset-1 -z-10 rounded-full bg-primary/10 opacity-0 blur-sm transition-opacity duration-500 group-hover:opacity-100" />
          </div>

          <div className="flex flex-col">
            <span className="text-lg font-bold leading-tight tracking-tight text-foreground">
              Bridge API
            </span>
            <span className="text-[10px] font-medium uppercase leading-tight tracking-widest text-muted-foreground/60">
              Instance Manager
            </span>
          </div>
        </div>
      </div>

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
                  className="border-primary/30 text-primary transition-all duration-300 hover:border-primary/50 hover:bg-primary/10"
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
            className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/20 transition-all duration-300 hover:from-primary/90 hover:to-primary/70 hover:shadow-lg hover:shadow-primary/30"
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
              <div className="absolute -inset-1 -z-10 rounded-full bg-primary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="mt-1 w-56">
            <div className="px-3 py-2">
              <p className="text-sm font-semibold">{profile?.full_name || "Usuário"}</p>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleChangePassword} className="cursor-pointer">
              <KeyRound className="mr-2 h-4 w-4" />
              Alterar Senha
            </DropdownMenuItem>

            {showSubscriptionOptions && (
              <>
                <DropdownMenuItem
                  onSelect={() => setSubscriptionDialogOpen(true)}
                  className="cursor-pointer"
                >
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  Minha Assinatura
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            <DropdownMenuItem
              onClick={handleSignOut}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair da Conta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <SubscriptionDialog
          open={subscriptionDialogOpen}
          onOpenChange={setSubscriptionDialogOpen}
        />
      </div>
    </header>
  );
}
