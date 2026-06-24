import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Política de privacidade da Clemente Assessoria. Saiba como coletamos, usamos e protegemos seus dados pessoais.',
}

export default function PoliticaPage() {
  return (
    <div className="bg-white min-h-screen">
      <section className="bg-gray-900 text-white py-16">
        <div className="container mx-auto px-4 lg:px-8">
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">Política de Privacidade</h1>
          <p className="text-gray-400">Última atualização: janeiro de 2025</p>
        </div>
      </section>

      <section className="py-12">
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
          <div className="prose prose-gray max-w-none space-y-6 text-gray-600">

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">1. Informações que coletamos</h2>
              <p>A Clemente Assessoria coleta informações que você nos fornece diretamente, como nome, e-mail, telefone, cidade, renda e dados sobre o imóvel de interesse ao preencher formulários de contato ou simulação em nosso site.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">2. Como usamos suas informações</h2>
              <p>Utilizamos suas informações para:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Processar e responder sua solicitação de contato ou simulação</li>
                <li>Entrar em contato para apresentar condições de financiamento</li>
                <li>Enviar informações relevantes sobre nossos serviços (mediante autorização)</li>
                <li>Cumprir obrigações legais e regulatórias</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">3. Compartilhamento de dados</h2>
              <p>Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins comerciais próprios. Podemos compartilhar dados com bancos parceiros e instituições financeiras apenas quando necessário para análise e concessão de crédito imobiliário, e somente com seu consentimento explícito.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">4. Segurança dos dados</h2>
              <p>Adotamos medidas técnicas e organizacionais adequadas para proteger suas informações pessoais contra acesso não autorizado, alteração, divulgação ou destruição. Utilizamos criptografia em trânsito (HTTPS) e em repouso para proteção dos dados armazenados.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">5. Cookies</h2>
              <p>Nosso site pode utilizar cookies para melhorar a experiência de navegação. Você pode configurar seu navegador para recusar cookies, mas isso pode limitar algumas funcionalidades do site.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">6. Seus direitos (LGPD)</h2>
              <p>De acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem direito a:</p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Confirmar a existência de tratamento dos seus dados</li>
                <li>Acessar os dados que temos sobre você</li>
                <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
                <li>Solicitar a exclusão dos seus dados (quando legalmente possível)</li>
                <li>Revogar o consentimento a qualquer momento</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">7. Retenção de dados</h2>
              <p>Mantemos seus dados pelo tempo necessário para prestar os serviços solicitados ou cumprir obrigações legais, o que for maior. Após esse período, os dados são excluídos ou anonimizados.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">8. Contato</h2>
              <p>Para exercer seus direitos ou tirar dúvidas sobre esta política, entre em contato pelo e-mail: <a href="mailto:privacidade@clementeassessoria.com.br" className="text-green-600 hover:underline">privacidade@clementeassessoria.com.br</a></p>
            </section>

          </div>
        </div>
      </section>
    </div>
  )
}
