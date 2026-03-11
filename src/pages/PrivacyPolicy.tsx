import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import circleLogo from "@/assets/bridge-circle-logo.png";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">Política de Privacidade</h1>
        <p className="text-muted-foreground mb-10">Última atualização: {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Introdução</h2>
            <p className="text-muted-foreground leading-relaxed">
              A Bridge API ("nós", "nosso" ou "plataforma") valoriza a privacidade dos seus usuários. 
              Esta Política de Privacidade descreve como coletamos, utilizamos, armazenamos e protegemos 
              as informações pessoais fornecidas por você ao utilizar nossos serviços de integração 
              WhatsApp e automação de mensagens.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Informações que Coletamos</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">Podemos coletar as seguintes categorias de informações:</p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Dados de cadastro:</strong> nome, e-mail, telefone e informações de faturamento fornecidos durante o registro ou assinatura.</li>
              <li><strong className="text-foreground">Dados de uso:</strong> informações sobre como você interage com a plataforma, incluindo logs de acesso, funcionalidades utilizadas e configurações aplicadas.</li>
              <li><strong className="text-foreground">Dados de integração:</strong> tokens de acesso, credenciais de API e identificadores necessários para conectar seus serviços (WhatsApp, GHL e outros).</li>
              <li><strong className="text-foreground">Dados de pagamento:</strong> processados diretamente pelo Stripe. Não armazenamos números de cartão de crédito em nossos servidores.</li>
              <li><strong className="text-foreground">Dados de mensagens:</strong> metadados de mensagens trafegadas pela plataforma para fins de roteamento e entrega. O conteúdo das mensagens é processado em trânsito e não é armazenado permanentemente.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Como Utilizamos suas Informações</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">Utilizamos as informações coletadas para:</p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Prover, manter e melhorar nossos serviços de integração e automação.</li>
              <li>Processar transações e gerenciar sua assinatura.</li>
              <li>Enviar comunicações técnicas, atualizações e alertas de segurança.</li>
              <li>Monitorar e garantir a estabilidade e segurança da plataforma.</li>
              <li>Cumprir obrigações legais e regulatórias aplicáveis.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Compartilhamento de Dados</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Não vendemos, alugamos ou comercializamos suas informações pessoais. Podemos compartilhar dados com:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Provedores de serviço:</strong> Stripe (pagamentos), Supabase (infraestrutura), UAZAPI (conexão WhatsApp) e outros parceiros técnicos essenciais para o funcionamento da plataforma.</li>
              <li><strong className="text-foreground">Obrigações legais:</strong> quando exigido por lei, ordem judicial ou processo legal aplicável.</li>
              <li><strong className="text-foreground">Proteção de direitos:</strong> para proteger nossos direitos, propriedade ou segurança, bem como de nossos usuários.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Armazenamento e Segurança</h2>
            <p className="text-muted-foreground leading-relaxed">
              Seus dados são armazenados em servidores seguros com criptografia em trânsito (TLS/SSL) e em repouso. 
              Utilizamos práticas de segurança como autenticação por tokens, controle de acesso baseado em papéis (RBAC) 
              e políticas de segurança em nível de linha (RLS) para proteger suas informações. Tokens e credenciais de 
              integração são armazenados de forma criptografada e isolada por conta de usuário.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Retenção de Dados</h2>
            <p className="text-muted-foreground leading-relaxed">
              Mantemos seus dados pessoais enquanto sua conta estiver ativa ou conforme necessário para fornecer 
              nossos serviços. Dados de mensagens e logs operacionais são retidos por períodos limitados 
              (geralmente entre 1 hora e 30 dias, dependendo do tipo) e removidos automaticamente após esse prazo. 
              Após o cancelamento da conta, seus dados serão excluídos em até 30 dias, exceto quando a retenção 
              for exigida por lei.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Seus Direitos</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Em conformidade com a Lei Geral de Proteção de Dados (LGPD), você tem direito a:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Acessar, corrigir ou excluir seus dados pessoais.</li>
              <li>Solicitar a portabilidade dos seus dados.</li>
              <li>Revogar o consentimento para o tratamento de dados a qualquer momento.</li>
              <li>Solicitar informações sobre com quem seus dados são compartilhados.</li>
              <li>Apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Cookies e Tecnologias Semelhantes</h2>
            <p className="text-muted-foreground leading-relaxed">
              Utilizamos cookies e armazenamento local (localStorage) exclusivamente para manter sua sessão 
              autenticada e suas preferências na plataforma. Não utilizamos cookies de rastreamento publicitário 
              ou de terceiros para fins de marketing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Serviços de Terceiros</h2>
            <p className="text-muted-foreground leading-relaxed">
              Nossa plataforma integra-se com serviços de terceiros (WhatsApp via UAZAPI, GHL, Stripe) que possuem 
              suas próprias políticas de privacidade. Recomendamos que você revise as políticas desses serviços. 
              A Bridge API não se responsabiliza pelas práticas de privacidade de terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Alterações nesta Política</h2>
            <p className="text-muted-foreground leading-relaxed">
              Podemos atualizar esta Política de Privacidade periodicamente. Alterações significativas serão 
              comunicadas por e-mail ou por aviso na plataforma. O uso continuado dos serviços após as alterações 
              constitui aceitação da política atualizada.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Contato</h2>
            <p className="text-muted-foreground leading-relaxed">
              Para exercer seus direitos ou esclarecer dúvidas sobre esta Política de Privacidade, 
              entre em contato conosco através do e-mail de suporte disponível em sua área logada na plataforma.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
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

export default PrivacyPolicy;
