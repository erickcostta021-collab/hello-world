
import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { useSubscription } from "@/hooks/useSubscription";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GroupCommandsDialog } from "@/components/dashboard/GroupCommandsDialog";
import { InstanceOverrideDialog } from "@/components/dashboard/InstanceOverrideDialog";
import {
  LayoutDashboard,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Wrench,
  Users,
  MessageSquare,
  Palette,
  MousePointerClick,
  Activity,
  Rocket,
  Repeat,
  Code,
  KeyRound,
} from "lucide-react";
import { CustomizeSmsDialog } from "@/components/dashboard/CustomizeSmsDialog";
import { ConfigureCredentialsDialog } from "@/components/dashboard/ConfigureCredentialsDialog";
import { WhatsAppThemeDialog } from "@/components/dashboard/WhatsAppThemeDialog";
import { SendButtonsDialog } from "@/components/dashboard/SendButtonsDialog";
import { ScriptsDialog } from "@/components/dashboard/ScriptsDialog";

import { useSidebarState } from "@/hooks/useSidebarState";

const adminNavItems = [
  { to: "/admin/health", icon: Activity, label: "Saúde do Sistema" },
];

export function Sidebar() {
  const { collapsed, toggle } = useSidebarState();
  const { getOAuthUrl } = useSettings();
  const { hasActiveSubscription } = useSubscription();
  const location = useLocation();
  const [utilitiesOpen, setUtilitiesOpen] = useState(false);
  const [startHereOpen, setStartHereOpen] = useState(false);
  const [groupCommandsOpen, setGroupCommandsOpen] = useState(false);
  const [customizeSmsOpen, setCustomizeSmsOpen] = useState(false);
  const [whatsappThemeOpen, setWhatsappThemeOpen] = useState(false);
  const [sendButtonsOpen, setSendButtonsOpen] = useState(false);
  const [instanceOverrideOpen, setInstanceOverrideOpen] = useState(false);
  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase.rpc("is_admin").then(({ data }) => setIsAdmin(!!data));
    });
  }, []);

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

  // Helper to render a nav link item
  const renderNavItem = (item: { to: string; icon: any; label: string }) => {
    const isActive = location.pathname === item.to;
    return (
      <TooltipProvider key={item.to} delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink
              to={item.to}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative overflow-hidden",
                isActive
                  ? "bg-primary/15 text-primary shadow-sm shadow-primary/10"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r-full" />
              )}
              <item.icon className={cn(
                "h-5 w-5 flex-shrink-0 transition-transform duration-200",
                isActive ? "text-primary" : "group-hover:scale-110"
              )} />
              <span className={cn(
                "transition-all duration-300 whitespace-nowrap",
                collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100 w-auto"
              )}>
                {item.label}
              </span>
            </NavLink>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right" className="font-medium">
              {item.label}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div
          className="fixed inset-0 top-16 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
          onClick={toggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 top-16 lg:top-0 left-0 z-50 lg:z-auto flex flex-col border-r border-white/[0.08]",
          "bg-gradient-to-b from-background/95 via-background/90 to-background/95",
          "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          collapsed ? "w-[68px]" : "w-64",
          "lg:translate-x-0",
          collapsed ? "-translate-x-full lg:translate-x-0" : "translate-x-0"
        )}
      >
        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1.5 mt-2">
          {/* Dashboard */}
          {renderNavItem({ to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" })}

          {/* Comece por aqui Dropdown */}
          <div className="pt-1">
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      if (collapsed) {
                        if (oauthUrl && hasActiveSubscription) handleInstallApp();
                      } else {
                        setStartHereOpen(!startHereOpen);
                      }
                    }}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 w-full text-left",
                      "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <Rocket className="h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
                    <span className={cn(
                      "transition-all duration-300 whitespace-nowrap flex-1",
                      collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100 w-auto"
                    )}>
                      Comece por aqui
                    </span>
                    {!collapsed && (
                      <ChevronDown className={cn(
                        "h-4 w-4 text-sidebar-foreground/40 transition-transform duration-200",
                        startHereOpen && "rotate-180"
                      )} />
                    )}
                  </button>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" className="font-medium">
                    Comece por aqui
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            {startHereOpen && !collapsed && (
              <div className="mt-1 ml-3 pl-3 border-l border-white/[0.08] space-y-0.5 animate-fade-in">
                <p className="px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
                  Passo a passo
                </p>
                {oauthUrl && (
                  <button
                    onClick={hasActiveSubscription ? handleInstallApp : undefined}
                    disabled={!hasActiveSubscription}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 w-full text-left text-sm",
                      hasActiveSubscription
                        ? "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        : "text-sidebar-foreground/30 cursor-not-allowed"
                    )}
                  >
                    <span className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs font-bold text-primary">1</span>
                      <ExternalLink className="h-4 w-4" />
                    </span>
                    <span className="whitespace-nowrap">Conectar subconta GHL</span>
                  </button>
                )}
                <button
                  onClick={() => setCredentialsOpen(true)}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 w-full text-left text-sm",
                    "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs font-bold text-primary">2</span>
                    <KeyRound className="h-4 w-4" />
                  </span>
                  <span className="whitespace-nowrap">Configurar Credenciais</span>
                </button>
                <button
                  onClick={() => setScriptsOpen(true)}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 w-full text-left text-sm",
                    "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs font-bold text-primary">3</span>
                    <Code className="h-4 w-4" />
                  </span>
                  <span className="whitespace-nowrap">Scripts</span>
                </button>
              </div>
            )}
          </div>

          {/* Utilidades Dropdown */}
          <div className="pt-1">
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      if (collapsed) {
                        setGroupCommandsOpen(true);
                      } else {
                        setUtilitiesOpen(!utilitiesOpen);
                      }
                    }}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 w-full text-left",
                      "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <Wrench className="h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
                    <span className={cn(
                      "transition-all duration-300 whitespace-nowrap flex-1",
                      collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100 w-auto"
                    )}>
                      Utilidades
                    </span>
                    {!collapsed && (
                      <ChevronDown className={cn(
                        "h-4 w-4 text-sidebar-foreground/40 transition-transform duration-200",
                        utilitiesOpen && "rotate-180"
                      )} />
                    )}
                  </button>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" className="font-medium">
                    Utilidades
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            {utilitiesOpen && !collapsed && (
              <div className="mt-1 ml-3 pl-3 border-l border-white/[0.08] space-y-0.5 animate-fade-in">
                {/* Comandos */}
                <p className="px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
                  Comandos
                </p>
                <button
                  onClick={() => setGroupCommandsOpen(true)}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 w-full text-left text-sm",
                    "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Users className="h-4 w-4 flex-shrink-0" />
                  <span className="whitespace-nowrap">Gerenciar Grupos</span>
                </button>
                <button
                  onClick={() => setSendButtonsOpen(true)}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 w-full text-left text-sm",
                    "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <MousePointerClick className="h-4 w-4 flex-shrink-0" />
                  <span className="whitespace-nowrap">Enviar Botões</span>
                </button>
                <button
                  onClick={() => setInstanceOverrideOpen(true)}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 w-full text-left text-sm",
                    "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Repeat className="h-4 w-4 flex-shrink-0" />
                  <span className="whitespace-nowrap">Trocar Instância</span>
                </button>

                {/* Personalizar GHL */}
                <p className="px-3 py-1.5 pt-3 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
                  Personalizar GHL
                </p>
                <button
                  onClick={() => setCustomizeSmsOpen(true)}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 w-full text-left text-sm",
                    "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0" />
                  <span className="whitespace-nowrap">Customizar SMS</span>
                </button>
                <button
                  onClick={() => setWhatsappThemeOpen(true)}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 w-full text-left text-sm",
                    "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Palette className="h-4 w-4 flex-shrink-0" />
                  <span className="whitespace-nowrap">Tema WhatsApp</span>
                </button>
              </div>
            )}
          </div>

          {/* Configurações */}
          {renderNavItem({ to: "/settings", icon: Settings, label: "Configurações" })}

          {/* Admin items */}
          {isAdmin && adminNavItems.map((item) => renderNavItem(item))}
        </nav>

        {/* Collapse toggle at bottom (desktop only) */}
        <div className="hidden lg:flex items-center justify-center p-3 border-t border-white/[0.08]">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className={cn(
              "h-8 w-8 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200",
            )}
          >
            <div className="transition-transform duration-300">
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </div>
          </Button>
        </div>
      </aside>

      {/* Group Commands Dialog */}
      <GroupCommandsDialog open={groupCommandsOpen} onOpenChange={setGroupCommandsOpen} />

      {/* Customize SMS Dialog */}
      <CustomizeSmsDialog open={customizeSmsOpen} onOpenChange={setCustomizeSmsOpen} />

      {/* WhatsApp Theme Dialog */}
      <WhatsAppThemeDialog open={whatsappThemeOpen} onOpenChange={setWhatsappThemeOpen} />

      {/* Send Buttons Dialog */}
      <SendButtonsDialog open={sendButtonsOpen} onOpenChange={setSendButtonsOpen} />

      {/* Instance Override Dialog */}
      <InstanceOverrideDialog open={instanceOverrideOpen} onOpenChange={setInstanceOverrideOpen} />

      {/* Scripts Dialog */}
      <ScriptsDialog open={scriptsOpen} onOpenChange={setScriptsOpen} />

      {/* Configure Credentials Dialog */}
      <ConfigureCredentialsDialog open={credentialsOpen} onOpenChange={setCredentialsOpen} />
    </>
  );
}
