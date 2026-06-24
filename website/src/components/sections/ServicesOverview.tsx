import Link from 'next/link'
import { Building2, CreditCard, FileCheck, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const services = [
  {
    icon: CreditCard,
    title: 'Correspondente Bancário',
    description:
      'Intermediamos seu crédito imobiliário junto aos principais bancos do Brasil — Caixa, Bradesco, Itaú, Santander e outros — garantindo as melhores condições e taxas.',
    href: '/servicos#correspondente',
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  {
    icon: FileCheck,
    title: 'Despachante Imobiliário',
    description:
      'Cuidamos de toda a documentação, análise jurídica, registros em cartório e burocracia para que você não precise perder tempo e energia com papelada.',
    href: '/servicos#despachante',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: Building2,
    title: 'Assessoria Imobiliária',
    description:
      'Apoio completo na busca, negociação e fechamento do seu imóvel. Orientamos sobre MCMV, FGTS, SBPE e qual o melhor caminho para o seu perfil.',
    href: '/servicos#assessoria',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
]

export default function ServicesOverview() {
  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-14">
          <p className="text-green-600 font-semibold text-sm tracking-wide uppercase mb-2">O que fazemos</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            Soluções completas para seu financiamento
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Da simulação ao registro, cuidamos de cada etapa para que você conquiste
            seu imóvel com segurança, agilidade e tranquilidade.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {services.map((service) => {
            const Icon = service.icon
            return (
              <Card key={service.title} className="group border border-gray-100 hover:border-green-200 hover:shadow-lg transition-all duration-300">
                <CardContent className="p-6">
                  <div className={`inline-flex p-3 rounded-xl ${service.bg} mb-4`}>
                    <Icon className={`h-6 w-6 ${service.color}`} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{service.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed mb-4">{service.description}</p>
                  <Link
                    href={service.href}
                    className="inline-flex items-center gap-1 text-sm font-medium text-green-600 hover:text-green-700 group-hover:gap-2 transition-all"
                  >
                    Saiba mais <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
