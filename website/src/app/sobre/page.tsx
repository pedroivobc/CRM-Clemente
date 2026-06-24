import type { Metadata } from 'next'
import { ArrowRight, Shield, Users, Award, Target } from 'lucide-react'
import { LinkButton } from '@/components/ui/link-button'

export const metadata: Metadata = {
  title: 'Sobre Nós',
  description: 'Conheça a história e os valores da Clemente Assessoria, especialistas em financiamento imobiliário, correspondente bancário e despachante.',
}

const values = [
  { icon: Shield, title: 'Transparência', desc: 'Clareza em cada etapa do processo, sem letras miúdas ou surpresas.' },
  { icon: Users, title: 'Compromisso', desc: 'Trabalhamos até a conclusão do processo, do começo ao fim.' },
  { icon: Award, title: 'Excelência', desc: 'Padrão elevado de atendimento e conhecimento técnico de mercado.' },
  { icon: Target, title: 'Foco no cliente', desc: 'Cada caso é único. Analisamos seu perfil para encontrar a melhor solução.' },
]

export default function SobrePage() {
  return (
    <div className="bg-white">
      <section className="bg-gray-900 text-white py-20">
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
          <p className="text-green-400 font-semibold text-sm tracking-wide uppercase mb-2">Nossa história</p>
          <h1 className="text-4xl lg:text-5xl font-bold mb-6">Sobre a Clemente Assessoria</h1>
          <p className="text-gray-400 text-lg leading-relaxed">
            Nascemos da vontade de simplificar um processo que é ao mesmo tempo o maior sonho
            e o maior desafio financeiro da vida de uma família: a conquista do imóvel próprio.
          </p>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Quem somos</h2>
          <div className="space-y-4 text-gray-600 leading-relaxed">
            <p>
              A Clemente Assessoria é uma empresa especializada em assessoria imobiliária,
              correspondente bancário e despachante imobiliário, com mais de 10 anos de atuação
              no mercado de crédito habitacional.
            </p>
            <p>
              Nossa missão é conectar pessoas ao imóvel dos seus sonhos, cuidando de toda a
              jornada: da simulação inicial à entrega das chaves. Trabalhamos com os principais
              programas habitacionais do país — Minha Casa Minha Vida (MCMV), SBPE, FGTS e
              crédito habitacional tradicional.
            </p>
            <p>
              Somos credenciados como correspondentes bancários junto aos principais bancos do
              Brasil, o que nos permite comparar condições, negociar taxas e submeter propostas
              de crédito de forma ágil e segura.
            </p>
            <p>
              Ao longo desses anos, já ajudamos mais de 500 famílias a conquistar seu imóvel,
              com mais de R$ 120 milhões em crédito captado e índice de satisfação superior a 98%.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Nossos valores</h2>
            <p className="text-gray-500 max-w-lg mx-auto">Os princípios que guiam cada atendimento e cada decisão da nossa equipe.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {values.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center p-6 bg-white rounded-2xl border border-gray-100">
                <div className="inline-flex p-3 rounded-xl bg-green-50 mb-4">
                  <Icon className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Pronto para começar?</h2>
          <p className="text-gray-500 mb-8 max-w-lg mx-auto">
            Faça uma simulação gratuita ou entre em contato com nossa equipe.
            Estamos prontos para cuidar do seu financiamento.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <LinkButton href="/simulador" size="lg" className="bg-green-600 hover:bg-green-700 border-green-600 text-white">
              Simular Financiamento <ArrowRight className="ml-2 h-4 w-4" />
            </LinkButton>
            <LinkButton href="/contato" size="lg" variant="outline">
              Falar com consultor
            </LinkButton>
          </div>
        </div>
      </section>
    </div>
  )
}
