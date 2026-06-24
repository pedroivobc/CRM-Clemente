import type { Metadata } from 'next'
import { CreditCard, FileCheck, Building2, CheckCircle, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
    description: 'Somos credenciados como correspondentes bancários dos principais bancos do Brasil. Isso significa que analisamos seu perfil, comparamos condições e submetemos seu crédito diretamente, sem burocracia adicional.',
    benefits: [
      'Acesso a Caixa, Bradesco, Itaú, Santander, BB e outros',
      'Comparação de taxas e condições em múltiplos bancos',
      'Análise prévia de crédito sem comprometer seu score',
      'Suporte na montagem do dossiê documental',
      'Acompanhamento até a aprovação do crédito',
    ],
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  {
    id: 'despachante',
    icon: FileCheck,
    title: 'Despachante Imobiliário',
    description: 'Cuidamos de toda a parte documental e cartorária do seu financiamento. Nossa equipe conhece cada etapa do processo e garante que nada atrase ou impeça a concretização do seu negócio.',
    benefits: [
      'Análise e organização de documentação',
      'Verificação de matrícula e situação jurídica do imóvel',
      'Redação e revisão de contratos',
      'Registro em cartório de imóveis',
      'Acompanhamento de ITBI e transferência de propriedade',
    ],
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  {
    id: 'assessoria',
    icon: Building2,
    title: 'Assessoria Imobiliária',
    description: 'Orientamos você em cada etapa da compra do seu imóvel: da escolha da modalidade de crédito à chave na mão. Trabalhamos com MCMV, SBPE, FGTS e crédito habitacional em geral.',
    benefits: [
      'Orientação sobre Minha Casa Minha Vida (MCMV)',
      'Uso do FGTS como entrada ou amortização',
      'Análise do melhor programa para seu perfil',
      'Negociação com construtoras e vendedores',
      'Acompanhamento pós-aprovação até as chaves',
    ],
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
  },
]

export default function ServicosPage() {
  return (
    <div className="bg-white">
      <section className="bg-gray-900 text-white py-20">
        <div className="container mx-auto px-4 lg:px-8 text-center">
          <p className="text-green-400 font-semibold text-sm tracking-wide uppercase mb-2">O que oferecemos</p>
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">Nossos Serviços</h1>
          <p className="text-gray-400 max-w-xl mx-auto">
            Soluções completas para quem quer comprar, financiar ou regularizar um imóvel
            com segurança e tranquilidade.
          </p>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4 lg:px-8 space-y-16">
          {services.map((service, i) => {
            const Icon = service.icon
            return (
              <div key={service.id} id={service.id} className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                  <div className={`inline-flex p-4 rounded-2xl ${service.bg} mb-6`}>
                    <Icon className={`h-8 w-8 ${service.color}`} />
                  </div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-4">{service.title}</h2>
                  <p className="text-gray-500 leading-relaxed mb-6">{service.description}</p>
                  <ul className="space-y-3 mb-8">
                    {service.benefits.map((b) => (
                      <li key={b} className="flex items-start gap-3 text-gray-600 text-sm">
                        <CheckCircle className={`h-5 w-5 mt-0.5 shrink-0 ${service.color}`} />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <LinkButton href="/simulador" className="bg-green-600 hover:bg-green-700 border-green-600 text-white">
                    Fazer simulação <ArrowRight className="ml-2 h-4 w-4" />
                  </LinkButton>
                </div>
                <Card className={`border-2 ${service.border} ${i % 2 === 1 ? 'lg:order-1' : ''}`}>
                  <CardContent className={`p-8 ${service.bg} h-64 flex items-center justify-center`}>
                    <Icon className={`h-24 w-24 ${service.color} opacity-20`} />
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
