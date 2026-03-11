import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import circleLogo from "@/assets/bridge-circle-logo.png";

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-50">
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

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">Termos de Serviço</h1>
        <p className="text-muted-foreground mb-10">Última atualização: {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>

        <div className="space-y-8 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Aceitação dos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Ao acessar ou utilizar a plataforma Bridge API, você concorda com estes Termos de Serviço.
              Caso não concorde com qualquer disposição, não utilize nossos serviços. O uso continuado da
              plataforma após alterações constitui aceitação dos termos atualizados.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Descrição do Serviço</h2>
            <p className="text-muted-foreground leading-relaxed">
              A Bridge API é uma plataforma de integração que conecta o WhatsApp a sistemas de CRM e automação
              (como GHL/GoHighLevel) por meio de APIs. Nossos serviços incluem roteamento de mensagens,
              gerenciamento de múltiplas instâncias WhatsApp, switcher automático, agendamento de mensagens
              em grupos e ferramentas de automação para atendimento ao cliente.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Cadastro e Conta</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Você deve fornecer informações verdadeiras, precisas e atualizadas durante o cadastro.</li>
              <li>Você é responsável por manter a confidencialidade das suas credenciais de acesso.</li>
              <li>Cada conta é pessoal e intransferível, salvo mediante autorização expressa.</li>
              <li>Você deve notificar imediatamente qualquer uso não autorizado da sua conta.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Planos e Pagamento</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Os planos disponíveis e seus respectivos preços estão descritos na página de preços da plataforma.</li>
              <li>Os pagamentos são processados pelo Stripe e cobrados mensalmente de forma recorrente.</li>
              <li>O período de teste gratuito (trial) está disponível para o plano flexível com até 2 conexões, por 5 dias.</li>
              <li>Após o período de teste, a cobrança será realizada automaticamente conforme o plano selecionado.</li>
              <li>Em caso de falha no pagamento, haverá um período de carência de 3 dias antes da suspensão do serviço.</li>
              <li>Não há reembolso para períodos parciais de uso após a cobrança.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Uso Aceitável</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">Ao utilizar a Bridge API, você concorda em:</p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Respeitar todas as leis e regulamentações aplicáveis, incluindo a LGPD.</li>
              <li>Não utilizar a plataforma para envio de spam, mensagens não solicitadas ou conteúdo ilegal.</li>
              <li>Não tentar acessar, modificar ou interferir em contas de outros usuários.</li>
              <li>Não realizar engenharia reversa, descompilar ou tentar extrair o código-fonte da plataforma.</li>
              <li>Não utilizar o serviço para atividades fraudulentas, abusivas ou que violem direitos de terceiros.</li>
              <li>Cumprir os Termos de Uso do WhatsApp e das demais plataformas integradas.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Infraestrutura e Dependências</h2>
            <p className="text-muted-foreground leading-relaxed">
              A Bridge API depende de serviços de terceiros para seu funcionamento, incluindo UAZAPI (para
              conexão WhatsApp), Supabase (infraestrutura), Stripe (pagamentos) e GHL (CRM). O usuário
              reconhece que é necessário possuir uma conta ativa na UAZAPI e que a disponibilidade do
              serviço pode ser afetada por fatores externos à nossa plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Disponibilidade do Serviço</h2>
            <p className="text-muted-foreground leading-relaxed">
              Nos esforçamos para manter a plataforma disponível 24/7, porém não garantimos disponibilidade
              ininterrupta. Manutenções programadas, atualizações ou eventos fora do nosso controle podem
              causar indisponibilidade temporária. Não somos responsáveis por perdas decorrentes de
              interrupções no serviço do WhatsApp, UAZAPI ou outros provedores externos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Propriedade Intelectual</h2>
            <p className="text-muted-foreground leading-relaxed">
              Todo o conteúdo, código, design, marca e materiais da Bridge API são de propriedade exclusiva
              da plataforma e protegidos por leis de propriedade intelectual. A licença concedida ao usuário
              é limitada, não exclusiva e revogável, restrita ao uso da plataforma conforme estes termos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Limitação de Responsabilidade</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>A Bridge API é fornecida "como está" (as is), sem garantias expressas ou implícitas.</li>
              <li>Não nos responsabilizamos por danos indiretos, incidentais, especiais ou consequenciais.</li>
              <li>Não somos responsáveis por bloqueios ou restrições impostos pelo WhatsApp à sua conta ou número.</li>
              <li>Nossa responsabilidade total está limitada ao valor pago pelo usuário nos últimos 3 meses.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Cancelamento e Rescisão</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Você pode cancelar sua assinatura a qualquer momento através do portal do cliente Stripe.</li>
              <li>O cancelamento entra em vigor ao final do período de faturamento vigente.</li>
              <li>Reservamo-nos o direito de suspender ou encerrar contas que violem estes termos.</li>
              <li>Após o cancelamento, seus dados serão retidos por até 30 dias e depois excluídos permanentemente.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Alterações nos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Podemos modificar estes Termos de Serviço a qualquer momento. Alterações significativas
              serão comunicadas por e-mail ou aviso na plataforma com antecedência mínima de 15 dias.
              O uso continuado após as alterações constitui aceitação dos novos termos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">12. Legislação Aplicável</h2>
            <p className="text-muted-foreground leading-relaxed">
              Estes termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa
              será submetida ao foro da comarca do domicílio do usuário, conforme previsto no Código
              de Defesa do Consumidor.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">13. Contato</h2>
            <p className="text-muted-foreground leading-relaxed">
              Para dúvidas sobre estes Termos de Serviço, entre em contato conosco através do e-mail
              de suporte disponível em sua área logada na plataforma.
            </p>
          </section>
        </div>
      </main>

      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full overflow-hidden shadow-sm">
              <img src={circleLogo} alt="Bridge API" className="w-full h-full object-cover scale-[1.85]" />
            </div>
            <span className="text-muted-foreground">Bridge API © {new Date().getFullYear()} - Todos os direitos reservados.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default TermsOfService;
