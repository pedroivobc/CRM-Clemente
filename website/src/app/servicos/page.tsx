import type { Metadata } from 'next'
import { CreditCard, FileCheck, Building2, CheckCircle, ArrowRight } from 'lucide-react'
import { LinkButton } from '@/components/ui/link-button'

export const metadata: Metadata = {
  title: 'Serviços',
  description: 'Conheça os serviços da Clemente Assessoria: correspondente bancário, despachante imobiliário e assessoria completa para financiamento habitacional.',
}

const services = [
  {
    id: 'correspondente',
    icon: CreditCard,
    title: 'Correspondente Bancário',
    description: 'Somos credenciados como correspondentes bancários dos principais bancos do Brasil. Analisamos seu perfil, comparamos condições e submetemos seu crédito diretamente, sem burocracia adicional.',
    benefits: [
      'Acesso a Caixa, Bradesco, Itaú, Santander, BB e outros',
      'Comparação de taxas e condições em múltiplos bancos',
      'Análise prévia sem comprometer seu score',
      'Suporte completo na montagem documental',
      'Acompanhamento até a aprovação do crédito',
    ],
  },
  {
    id: 'despachante',
    icon: FileCheck,
    title: 'Despachante Imobiliário',
    description: 'Cuidamos de toda a parte documental e cartorária do seu financiamento. Nossa equipe conhece cada etapa e garante que nada atrase ou impeça a concretização do seu negócio.',
    benefits: [
      'Análise e organização de documentação completa',
      'Verificação de matrícula e situação jurídica',
      'Redação e revisão de contratos',
      'Registro em cartório de imóveis',
      'ITBI e transferência de propriedade',
    ],
  },
  {
    id: 'assessoria',
    icon: Building2,
    title: 'Assessoria Imobiliária',
    description: 'Orientação em cada etapa da compra do seu imóvel: da modalidade de crédito à chave na mão. Trabalhamos com MCMV, SBPE, FGTS e crédito habitacional em geral.',
    benefits: [
      'Orientação sobre Minha Casa Minha Vida (MCMV)',
      'Uso estratégico do FGTS como entrada ou amortização',
      'Análise do programa ideal para seu perfil',
      'Negociação com construtoras e vendedores',
      'Acompanhamento pós-aprovação até as chaves',
    ],
  },
]

export default function ServicosPage() {
  return (
    <div style={{ background: '#FFFFFF' }}>
      <section className="py-20 relative" style={{ background: '#0D0B09' }}>
        <div className="h-px absolute top-0 left-0 right-0" style={{ background: 'linear-gradient(90deg, transparent, #B39533, transparent)' }} />
        <div className="container mx-auto px-4 lg:px-8 text-center">
          <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#B39533' }}>O QUE OFERECEMOS</p>
          <h1 className="text-4xl lg:text-5xl font-light mb-4" style={{ color: '#FFFFFF', fontFamily: 'Georgia, serif' }}>Nossos Serviços</h1>
          <p className="max-w-xl mx-auto text-sm" style={{ color: '#7A7068' }}>
            Soluções completas para quem quer comprar, financiar ou regularizar um imóvel.
          </p>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4 lg:px-8 space-y-20">
          {services.map((service, i) => {
            const Icon = service.icon
            return (
              <div key={service.id} id={service.id}
                className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
                <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                  <div className="inline-flex p-3 rounded-full mb-6" style={{ background: 'rgba(179,149,51,0.1)' }}>
                    <Icon className="h-6 w-6" style={{ color: '#B39533' }} />
                  </div>
                  <h2 className="text-3xl font-light mb-4" style={{ color: '#1A1612', fontFamily: 'Georgia, serif' }}>{service.title}</h2>
                  <p className="leading-relaxed mb-8 text-sm" style={{ color: '#7A7068' }}>{service.description}</p>
                  <ul className="space-y-3 mb-8">
                    {service.benefits.map((b) => (
                      <li key={b} className="flex items-start gap-3 text-sm" style={{ color: '#5E5651' }}>
                        <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#B39533' }} />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <LinkButton href="/simulador" className="text-white font-medium"
                    style={{ background: '#B39533', borderColor: '#B39533' } as React.CSSProperties}>
                    Fazer simulação <ArrowRight className="ml-2 h-4 w-4" />
                  </LinkButton>
                </div>

                <div className={`flex items-center justify-center h-64 lg:h-80 ${i % 2 === 1 ? 'lg:order-1' : ''}`}
                  style={{ background: '#F7F4EF', outline: '1px solid #E8E3DC' }}>
                  <Icon className="h-28 w-28 opacity-10" style={{ color: '#B39533' }} />
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
