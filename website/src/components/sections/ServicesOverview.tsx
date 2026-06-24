'use client'

import Link from 'next/link'
import { Building2, CreditCard, FileCheck, ArrowRight } from 'lucide-react'

const services = [
  {
    icon: CreditCard,
    title: 'Correspondente Bancário',
    description: 'Intermediamos seu crédito junto a Caixa, Bradesco, Itaú, Santander e demais bancos — comparando taxas para você ter a melhor condição.',
    href: '/servicos#correspondente',
  },
  {
    icon: FileCheck,
    title: 'Despachante Imobiliário',
    description: 'Cuidamos de toda a documentação, análise jurídica, registros em cartório e tramitações para que você não precise se preocupar com burocracia.',
    href: '/servicos#despachante',
  },
  {
    icon: Building2,
    title: 'Assessoria Imobiliária',
    description: 'Apoio completo na jornada de compra: orientação sobre MCMV, FGTS, SBPE e acompanhamento do início ao registro do imóvel.',
    href: '/servicos#assessoria',
  },
]

export default function ServicesOverview() {
  return (
    <section className="py-24" style={{ background: '#F7F4EF' }}>
      <div className="container mx-auto px-4 lg:px-8">

        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#B39533' }}>O QUE FAZEMOS</p>
          <h2 className="text-3xl lg:text-4xl font-light mb-4" style={{ color: '#1A1612', fontFamily: 'Georgia, serif' }}>
            Soluções completas para seu financiamento
          </h2>
          <div className="flex items-center justify-center gap-3">
            <div className="h-px w-12" style={{ background: '#B39533' }} />
            <p className="text-sm" style={{ color: '#7A7068' }}>Da simulação ao registro, cuidamos de cada etapa</p>
            <div className="h-px w-12" style={{ background: '#B39533' }} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {services.map((service, i) => {
            const Icon = service.icon
            return (
              <div key={service.title}
                className="group p-8 bg-white transition-shadow duration-300 hover:shadow-lg"
                style={{ borderBottom: '3px solid transparent', borderImage: 'none', outline: '1px solid #E8E3DC' }}
                onMouseEnter={e => (e.currentTarget.style.borderBottomColor = '#B39533')}
                onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
              >
                <div className="mb-6 inline-flex items-center justify-center w-12 h-12 rounded-full"
                  style={{ background: 'rgba(179,149,51,0.1)' }}>
                  <Icon className="h-5 w-5" style={{ color: '#B39533' }} />
                </div>
                <h3 className="text-lg font-light mb-3" style={{ color: '#1A1612', fontFamily: 'Georgia, serif' }}>{service.title}</h3>
                <p className="text-sm leading-relaxed mb-6" style={{ color: '#7A7068' }}>{service.description}</p>
                <Link href={service.href}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase transition-colors"
                  style={{ color: '#B39533' }}>
                  Saiba mais <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
