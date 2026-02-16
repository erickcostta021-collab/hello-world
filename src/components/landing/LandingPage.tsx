import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Slider } from "@/components/ui/slider";
import { 
  MessageCircle, 
  Mic, 
  Smartphone, 
  Users, 
  ArrowRight,
  Zap,
  Shield,
  RefreshCw,
  Gift,
  Link2,
  ImageUp,
  MousePointerClick,
  Phone,
  Lock
} from "lucide-react";
import circleLogo from "@/assets/bridge-circle-logo.png";
import whatsappLogo from "@/assets/whatsapp-logo.svg";
import ghlIcon from "@/assets/ghl-icon.png";
import bridgeImg from "@/assets/bridge.png";

const EXCHANGE_RATE = 5.50;

const LandingPage = () => {
  const [instanceCount, setInstanceCount] = useState(1);
  const [currency, setCurrency] = useState<'BRL' | 'USD'>('BRL');
  const pricePerInstance = 35;
  const totalPrice = instanceCount * pricePerInstance;

  const formatPrice = useCallback((brlValue: number) => {
    if (currency === 'BRL') {
      return `R$${brlValue.toLocaleString('pt-BR')}`;
    }
    const usdValue = Math.round(brlValue / EXCHANGE_RATE);
    return `$${usdValue.toLocaleString('en-US')}`;
  }, [currency]);

  const formatPerUnit = useCallback((brlValue: number) => {
    if (currency === 'BRL') {
      return `R$${brlValue} por conexão`;
    }
    const usdValue = (brlValue / EXCHANGE_RATE).toFixed(2);
    return `$${usdValue} por conexão`;
  }, [currency]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Subtle Background Elements */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Single subtle orb */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-muted/30 rounded-full blur-[200px]" />
        
        {/* Interactive Grid Pattern */}
        <div 
          className="absolute inset-0 opacity-30 hover:opacity-100 transition-opacity duration-500 pointer-events-auto cursor-default"
          style={{
            backgroundImage: `linear-gradient(hsl(var(--brand-blue) / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-blue) / 0.4) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden shadow-md">
              <img src={circleLogo} alt="Bridge API" className="w-full h-full object-cover scale-[1.85]" />
            </div>
            <span className="text-lg sm:text-xl font-semibold text-foreground">Bridge API</span>
          </div>
          
          {/* Center Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <button 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="text-muted-foreground hover:text-foreground transition-colors duration-300 font-medium"
            >
              Início
            </button>
            <button 
              onClick={() => document.getElementById('precos')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-muted-foreground hover:text-foreground transition-colors duration-300 font-medium"
            >
              Preços
            </button>
          </nav>
          
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/login">
              <Button variant="outline" size="sm" className="border-border text-foreground hover:bg-secondary transition-all duration-300 text-xs sm:text-sm">
                Entrar
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm" className="bg-brand-green hover:bg-brand-green/90 text-white transition-all duration-300 text-xs sm:text-sm">
                Inicie Agora
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-24 sm:pt-32 pb-12 sm:pb-20 px-4 sm:px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-secondary border border-border text-brand-green text-xs sm:text-sm font-medium mb-4 sm:mb-6">
            <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Integração WhatsApp + GHL
          </div>
          
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4 sm:mb-6 text-foreground">
            Conecte o WhatsApp ao GoHighLevel{" "}
            <span className="text-brand-green">Com estabilidade e melhor custo benefício</span>
          </h1>
          
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10 px-2">
            Liberte o Potencial Total da Sua Comunicação. Gerencie Múltiplas Instâncias, 
            Otimize Interações e Automatize seu Atendimento Direto do GHL.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4 sm:px-0">
            <Link to="/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto bg-brand-green hover:bg-brand-green/90 text-white px-8 py-6 text-base sm:text-lg transition-all duration-300 group">
                Inicie Agora
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button 
              size="lg" 
              variant="outline" 
              className="w-full sm:w-auto px-8 py-6 text-base sm:text-lg border-border text-foreground hover:bg-secondary transition-all duration-300"
              onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Saiba Mais
            </Button>
          </div>


          {/* CSS Keyframes for signal animations */}
          <style>{`
            @keyframes signalRightAlt {
              0% { left: -32px; opacity: 0; }
              5% { left: 0; opacity: 1; }
              90% { left: calc(100% - 32px); opacity: 1; }
              100% { left: 100%; opacity: 0; }
            }
            @keyframes signalLeftAlt {
              0% { left: calc(100%); opacity: 0; }
              5% { left: calc(100% - 32px); opacity: 1; }
              90% { left: 0; opacity: 1; }
              100% { left: -32px; opacity: 0; }
            }
          `}</style>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="como-funciona" className="py-12 sm:py-20 px-4 sm:px-6 scroll-mt-20 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 sm:mb-4">
              Como Funciona a Bridge API?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Uma ponte inteligente que conecta o WhatsApp ao GoHighLevel, usando a UAZAPI como motor de integração.
            </p>
          </div>

          {/* Architecture Diagram */}
          <div className="relative flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-0 mb-16">
            {/* WhatsApp Side */}
            <div className="flex flex-col items-center text-center lg:w-1/5 relative z-10">
              <div className="w-20 h-20 rounded-2xl bg-card shadow-lg flex items-center justify-center border border-border mb-4">
                <img src={whatsappLogo} alt="WhatsApp" className="h-12 w-12" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">WhatsApp</h3>
              <p className="text-sm text-muted-foreground">Seus números e conversas com clientes</p>
            </div>

            {/* Full-width animated lines (WhatsApp → GHL) passing behind UAZAPI */}
            <div className="hidden lg:block lg:w-[52%] relative" style={{ minHeight: '140px', marginLeft: '-40px', marginRight: '-40px', width: 'calc(52% + 80px)' }}>
              {/* Lines positioned to align with icon centers (icon is 80px tall, center at 40px) */}
              <div className="absolute left-0 right-0 flex flex-col gap-4 w-full" style={{ top: '32px' }}>
                {/* Line 1 - Signal going right */}
                <div className="relative h-0.5 w-full bg-border/50 rounded-full overflow-hidden">
                  <div 
                    className="absolute h-full w-8 bg-gradient-to-r from-transparent via-brand-blue to-transparent"
                    style={{
                      animation: 'signalRightAlt 4s ease-in-out infinite',
                      boxShadow: '0 0 12px 4px hsl(var(--brand-blue))',
                    }}
                  />
                </div>
                {/* Line 2 - Signal going left */}
                <div className="relative h-0.5 w-full bg-border/50 rounded-full overflow-hidden">
                  <div 
                    className="absolute h-full w-8 bg-gradient-to-r from-transparent via-brand-blue to-transparent"
                    style={{
                      animation: 'signalLeftAlt 4s ease-in-out infinite',
                      boxShadow: '0 0 12px 4px hsl(var(--brand-blue))',
                    }}
                  />
                </div>
              </div>

              {/* UAZAPI floating on top of the lines */}
              <div className="relative flex items-start justify-center z-20 pointer-events-none">
                <div className="flex flex-col items-center text-center pointer-events-auto">
                  <div className="w-20 h-20 rounded-2xl bg-card shadow-lg flex items-center justify-center border border-brand-blue mb-4">
                    <span className="text-lg font-bold text-brand-blue">UAZAPI</span>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">UAZAPI</h3>
                  <p className="text-sm text-muted-foreground">API de integração que conecta seu WhatsApp</p>
                </div>
              </div>
            </div>

            {/* Mobile fallback: arrows + UAZAPI */}
            <div className="lg:hidden flex flex-col items-center gap-4">
              <ArrowRight className="h-6 w-6 text-brand-blue rotate-90" />
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-2xl bg-card shadow-lg flex items-center justify-center border border-brand-blue mb-4">
                  <span className="text-lg font-bold text-brand-blue">UAZAPI</span>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">UAZAPI</h3>
                <p className="text-sm text-muted-foreground">API de integração que conecta seu WhatsApp</p>
              </div>
              <ArrowRight className="h-6 w-6 text-brand-blue rotate-90" />
            </div>

            {/* GHL Side */}
            <div className="flex flex-col items-center text-center lg:w-1/5 relative z-10">
              <div className="w-20 h-20 rounded-2xl bg-card shadow-lg flex items-center justify-center border border-border mb-4 overflow-hidden">
                <img src={ghlIcon} alt="GoHighLevel" className="h-12 w-12 rounded-lg" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">GoHighLevel</h3>
              <p className="text-sm text-muted-foreground">Seu CRM para gerenciar tudo em um só lugar</p>
            </div>
          </div>

          {/* Steps */}
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-8">
            <div className="bg-card rounded-xl sm:rounded-2xl p-6 sm:p-8 border border-border text-center">
              <div className="w-12 h-12 rounded-full bg-brand-green/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-brand-green">1</span>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Configure sua UAZAPI</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Use sua própria conta da UAZAPI. Basta ter o token e a URL da sua instância em mãos para começar.
              </p>
            </div>
            <div className="bg-card rounded-xl sm:rounded-2xl p-6 sm:p-8 border border-border text-center">
              <div className="w-12 h-12 rounded-full bg-brand-blue/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-brand-blue">2</span>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Adicione no Dashboard</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Cadastre suas conexões no painel da Bridge API, vincule à sua subconta do GHL e ative a ponte com um clique.
              </p>
            </div>
            <div className="bg-card rounded-xl sm:rounded-2xl p-6 sm:p-8 border border-border text-center">
              <div className="w-12 h-12 rounded-full bg-brand-green/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-xl font-bold text-brand-green">3</span>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Gerencie Tudo pelo Dash</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Monitore status, troque instâncias, gerencie subcontas e acompanhe todas as suas conexões em um só lugar.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 relative z-10 bg-secondary/30">
        <div className="max-w-6xl mx-auto relative">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 sm:mb-4">
              Funcionalidades Poderosas
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Tudo o que você precisa para gerenciar suas conversas do WhatsApp diretamente do GoHighLevel.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            {/* Feature 1 */}
            <div className="group bg-card rounded-xl p-6 border border-border hover:border-brand-blue hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300">
              <div className="w-11 h-11 rounded-lg bg-secondary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300">
                <MessageCircle className="h-5 w-5 text-brand-green" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Reaja, Edite, Responda e Apague Mensagens
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Tenha controle total sobre suas conversas. Reaja com emojis, edite textos enviados, 
                responda a mensagens específicas e apague o que foi dito, tudo dentro do GoHighLevel.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group bg-card rounded-xl p-6 border border-border hover:border-brand-blue hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300">
              <div className="w-11 h-11 rounded-lg bg-secondary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300">
                <Mic className="h-5 w-5 text-brand-green" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Envie e Receba Áudios e Mídias
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Comunicação rica e completa. Envie e receba mensagens de áudio, fotos e vídeos 
                diretamente da interface do GHL, como se estivesse no WhatsApp nativo.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group bg-card rounded-xl p-6 border border-border hover:border-brand-blue hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300">
              <div className="w-11 h-11 rounded-lg bg-secondary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300">
                <Smartphone className="h-5 w-5 text-brand-green" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Múltiplos Números, Uma Só Subconta
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Conecte diversas instâncias do WhatsApp à mesma subconta do GHL. O Switcher automático 
                troca o número de envio conforme a conversa, garantindo que você sempre responda pelo número certo.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="group bg-card rounded-xl p-6 border border-border hover:border-brand-blue hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300">
              <div className="w-11 h-11 rounded-lg bg-secondary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300">
                <Users className="h-5 w-5 text-brand-green" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Gestão de Grupos
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Gerencie seus grupos de WhatsApp diretamente do GoHighLevel, facilitando 
                campanhas e comunicações em massa com comandos simples.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="group bg-card rounded-xl p-6 border border-border hover:border-brand-blue hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300">
              <div className="w-11 h-11 rounded-lg bg-secondary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300">
                <ImageUp className="h-5 w-5 text-brand-green" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Fotos Atualizadas
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                As fotos de perfil dos seus contatos são atualizadas automaticamente no CRM, 
                garantindo uma base de dados sempre com informações visuais em dia.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="group bg-card rounded-xl p-6 border border-border hover:border-brand-blue hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300">
              <div className="w-11 h-11 rounded-lg bg-secondary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300">
                <Link2 className="h-5 w-5 text-brand-green" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Link White Label para Conexão
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Gere um link personalizado para que seus clientes conectem o WhatsApp diretamente 
                por dentro do GoHighLevel, sem sair do CRM. Experiência integrada e profissional.
              </p>
            </div>

            {/* Feature 7 */}
            <div className="group bg-card rounded-xl p-6 border border-border hover:border-brand-blue hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300">
              <div className="w-11 h-11 rounded-lg bg-secondary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300">
                <MousePointerClick className="h-5 w-5 text-brand-green" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Enviar Botões Interativos
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Envie botões de resposta rápida, listas interativas, enquetes e botões de pagamento PIX 
                diretamente pelo chat do GoHighLevel com comandos simples.
              </p>
            </div>

            {/* Feature 8 - Ligação (Coming Soon) */}
            <div className="group relative bg-card rounded-xl p-6 border border-border overflow-hidden opacity-75">
              <div className="absolute inset-0 bg-card/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">Em Breve</span>
              </div>
              <div className="w-11 h-11 rounded-lg bg-secondary flex items-center justify-center mb-4">
                <Phone className="h-5 w-5 text-brand-green" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Ligações por Voz
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Realize e receba chamadas de voz diretamente pelo GoHighLevel, 
                integrando telefonia ao seu fluxo de atendimento via WhatsApp.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="precos" className="py-12 sm:py-20 px-4 sm:px-6 scroll-mt-20 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 sm:mb-4">
              Planos e Preços
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Escolha o plano ideal para o tamanho do seu negócio. Cada conexão representa uma ponte entre seu WhatsApp e o GHL — a instância UAZAPI é sua.
            </p>

            {/* Currency Switch */}
            <div className="inline-flex flex-col items-center gap-2">
              <div
                className="relative inline-flex items-center bg-secondary rounded-full p-1 border border-border"
                role="radiogroup"
                aria-label="Selecionar moeda"
              >
                <button
                  role="radio"
                  aria-checked={currency === 'BRL'}
                  onClick={() => setCurrency('BRL')}
                  className={`relative z-10 px-5 py-2 rounded-full text-sm font-semibold transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    currency === 'BRL'
                      ? 'text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  R$ BRL
                </button>
                <button
                  role="radio"
                  aria-checked={currency === 'USD'}
                  onClick={() => setCurrency('USD')}
                  className={`relative z-10 px-5 py-2 rounded-full text-sm font-semibold transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    currency === 'USD'
                      ? 'text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  $ USD
                </button>
                {/* Sliding indicator */}
                <div
                  className="absolute top-1 h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-full bg-brand-green shadow-md transition-transform duration-300 ease-out"
                  style={{
                    transform: currency === 'USD' ? 'translateX(100%)' : 'translateX(0)',
                    left: '4px',
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground/60">
                {currency === 'USD' ? `Taxa: 1 USD = ${EXCHANGE_RATE.toFixed(2)} BRL` : 'Valores em Real Brasileiro'}
              </span>
            </div>
          </div>

          <div className="text-center mb-6">
            <p className="text-lg font-semibold text-brand-green">
              Comece com até 5 conexões grátis por 5 dias
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
            {/* Flexible Plan */}
            <div className="group bg-card rounded-2xl p-8 border border-border hover:border-brand-blue hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 flex flex-col">
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-foreground mb-2">Flexível</h3>
                <p className="text-muted-foreground text-sm">Escolha a quantidade ideal</p>
              </div>


              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground transition-opacity duration-300">{formatPrice(totalPrice)}</span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
                <p className="text-sm text-brand-green font-medium mt-1">{formatPerUnit(35)}</p>
                {instanceCount <= 5 && (
                  <p className="text-xs text-green-500 font-medium mt-0.5">
                    Cobrado apenas após o trial
                  </p>
                )}
              </div>
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                   <span className="text-sm text-muted-foreground">Conexões</span>
                   <span className="text-lg font-bold text-brand-green">{instanceCount}</span>
                </div>
                <Slider
                  value={[instanceCount]}
                  onValueChange={(value) => setInstanceCount(value[0])}
                  min={1}
                  max={10}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>1</span>
                  <span>10</span>
                </div>
                {instanceCount <= 5 && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Até 5 conexões: teste grátis. A partir de 6: cobrança imediata.
                  </p>
                )}
              </div>
              <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  {instanceCount} {instanceCount > 1 ? 'Conexões' : 'Conexão'} WhatsApp ↔ GHL
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Subcontas ilimitadas
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Mensagens ilimitadas
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Switcher automático
                </li>
              </ul>
              <Link to={`/checkout?plan=flexible&quantity=${instanceCount}`} className="w-full">
                {instanceCount <= 5 ? (
                  <Button className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white transition-all duration-300">
                    <Gift className="mr-2 h-4 w-4" />
                    Testar Grátis
                  </Button>
                ) : (
                  <Button className="w-full bg-brand-green hover:bg-brand-green/90 text-white transition-all duration-300">
                    Começar Agora
                  </Button>
                )}
              </Link>
            </div>

            {/* 50 Instances Plan */}
            <div className="group bg-card rounded-2xl p-8 border border-border hover:border-brand-blue hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 flex flex-col">
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-foreground mb-2">50 Conexões</h3>
                <p className="text-muted-foreground text-sm">Para negócios em crescimento</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold text-foreground transition-opacity duration-300">{formatPrice(798)}</span>
                <span className="text-muted-foreground">/mês</span>
              </div>
              <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  50 Conexões WhatsApp ↔ GHL
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Subcontas ilimitadas
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Mensagens ilimitadas
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Switcher automático
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Suporte prioritário
                </li>
              </ul>
              <Link to="/checkout?plan=plan_50" className="w-full">
                <Button className="w-full bg-brand-green hover:bg-brand-green/90 text-white transition-all duration-300">
                  Começar Agora
                </Button>
              </Link>
            </div>

            {/* 100 Instances Plan */}
            <div className="group relative bg-card rounded-2xl p-8 border-2 border-brand-green hover:border-brand-blue hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 flex flex-col">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-green text-white text-xs font-semibold px-4 py-1.5 rounded-full">
                Mais Popular
              </div>
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-foreground mb-2">100 Conexões</h3>
                <p className="text-muted-foreground text-sm">Para agências e equipes</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold text-foreground transition-opacity duration-300">{formatPrice(1298)}</span>
                <span className="text-muted-foreground">/mês</span>
              </div>
              <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  100 Conexões WhatsApp ↔ GHL
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Subcontas ilimitadas
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Mensagens ilimitadas
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Switcher automático
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Suporte prioritário
                </li>
              </ul>
              <Link to="/checkout?plan=plan_100" className="w-full">
                <Button className="w-full bg-brand-green hover:bg-brand-green/90 text-white transition-all duration-300">
                  Começar Agora
                </Button>
              </Link>
            </div>

            {/* 300 Instances Plan - Hidden for now */}
            {/* <div className="group bg-card rounded-2xl p-8 border border-border hover:border-muted-foreground/30 transition-all duration-300 flex flex-col">
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-foreground mb-2">300 Instâncias</h3>
                <p className="text-muted-foreground text-sm">Para grandes operações</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold text-foreground">R$2.998</span>
                <span className="text-muted-foreground">/mês</span>
              </div>
              <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  300 Instâncias WhatsApp
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Subcontas ilimitadas
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Mensagens ilimitadas
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Switcher automático
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4 text-brand-green" />
                  Suporte prioritário
                </li>
              </ul>
              <Link to="/checkout?plan=plan_300" className="w-full">
                <Button className="w-full bg-brand-green hover:bg-brand-green/90 text-white transition-all duration-300">
                  Começar Agora
                </Button>
              </Link>
            </div> */}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-brand-green rounded-2xl sm:rounded-3xl p-8 sm:p-12 md:p-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 sm:mb-4">
              Pronto para ir para o próximo Level?
            </h2>
            <p className="text-lg text-white/90 max-w-2xl mx-auto mb-8">
              Otimize seu tempo, melhore a experiência do cliente e escale seu atendimento com a Bridge API.
            </p>
            <Link to="/register">
              <Button size="lg" className="bg-white text-brand-green hover:bg-white/90 px-8 py-6 text-lg font-semibold transition-all duration-300">
                Ir para o Próximo Level 🚀
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full overflow-hidden shadow-sm">
              <img src={circleLogo} alt="Bridge API" className="w-full h-full object-cover scale-[1.85]" />
            </div>
            <span className="text-muted-foreground">Bridge API © {new Date().getFullYear()} - Todos os direitos reservados.</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors duration-300">Termos de Serviço</a>
            <a href="#" className="hover:text-foreground transition-colors duration-300">Política de Privacidade</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
