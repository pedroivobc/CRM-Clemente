import type { Metadata } from 'next'
import { ArrowRight, Shield, Users, Award, Target } from 'lucide-react'
import { LinkButton } from '@/components/ui/link-button'

export const metadata: Metadata = {
  title: 'Sobre Nós',
  description: 'Conheça a história e os valores da Clemente Assessoria, especialistas em financiamento imobiliário, correspondente bancário e despachante.',
}

const values = [
  { icon: Shield, title: 'Transparência', desc: 'Clareza em cada etapa, sem letras miúdas ou surpresas.' },
  { icon: Users, title: 'Compromisso', desc: 'Do primeiro contato ao registro: não paramos até a conclusão.' },
  { icon: Award, title: 'Excelência', desc: 'Padrão elevado de atendimento e profundo conhecimento técnico.' },
  { icon: Target, title: 'Foco no cliente', desc: 'Cada caso é único. Encontramos a melhor solução para seu perfil.' },
]

export default function SobrePage() {
  return (
    <div style={{ background: '#FFFFFF' }}>
      {/* Header */}
      <section className="py-20 relative" style={{ background: '#0D0B09' }}>
        <div className="h-px absolute top-0 left-0 right-0" style={{ background: 'linear-gradient(90deg, transparent, #B39533, transparent)' }} />
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
          <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#B39533' }}>NOSSA HISTÓRIA</p>
          <h1 className="text-4xl lg:text-5xl font-light mb-6" style={{ color: '#FFFFFF', fontFamily: 'Georgia, serif' }}>
            Sobre a Clemente Assessoria
          </h1>
          <p className="text-lg leading-relaxed" style={{ color: '#7A7068' }}>
            Nascemos da vontade de simplificar um processo que é ao mesmo tempo o maior sonho
            e o maior desafio financeiro da vida de uma família: a conquista do imóvel próprio.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="py-20">
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px flex-1" style={{ background: '#E8E3DC' }} />
            <h2 className="text-xl font-light shrink-0" style={{ color: '#1A1612', fontFamily: 'Georgia, serif' }}>Quem somos</h2>
            <div className="h-px flex-1" style={{ background: '#E8E3DC' }} />
          </div>
          <div className="space-y-5 text-base leading-relaxed" style={{ color: '#5E5651' }}>
            <p>
              A Clemente Assessoria é uma empresa especializada em assessoria imobiliária,
              correspondente bancário e despachante imobiliário, com mais de 10 anos de atuação
              no mercado de crédito habitacional.
            </p>
            <p>
              Nossa missão é conectar pessoas ao imóvel dos seus sonhos, cuidando de toda a
              jornada: da simulação inicial à entrega das chaves. Trabalhamos com os principais
              programas habitacionais — Minha Casa Minha Vida (MCMV), SBPE, FGTS e
              crédito habitacional tradicional.
            </p>
            <p>
              Somos credenciados como correspondentes bancários junto às principais instituições
              financeiras do Brasil, o que nos permite comparar condições, negociar taxas e
              submeter propostas de crédito com agilidade e segurança.
            </p>
            <p>
              Ao longo desses anos, ajudamos mais de 500 famílias a conquistar seu imóvel,
              com R$ 120 milhões em crédito captado e índice de satisfação superior a 98%.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20" style={{ background: '#F7F4EF' }}>
        <div className="container mx-auto px-4 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#B39533' }}>NOSSOS VALORES</p>
            <h2 className="text-3xl font-light" style={{ color: '#1A1612', fontFamily: 'Georgia, serif' }}>
              Os princípios que nos guiam
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {values.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center p-6 bg-white" style={{ outline: '1px solid #E8E3DC' }}>
                <div className="inline-flex p-3 rounded-full mb-4" style={{ background: 'rgba(179,149,51,0.1)' }}>
                  <Icon className="h-5 w-5" style={{ color: '#B39533' }} />
                </div>
                <h3 className="font-medium mb-2" style={{ color: '#1A1612' }}>{title}</h3>
                <p className="text-sm" style={{ color: '#7A7068' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4 lg:px-8 text-center">
          <h2 className="text-3xl font-light mb-4" style={{ color: '#1A1612', fontFamily: 'Georgia, serif' }}>Pronto para começar?</h2>
          <p className="mb-8 max-w-lg mx-auto text-sm" style={{ color: '#7A7068' }}>
            Faça uma simulação gratuita ou agende um atendimento presencial ou online.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <LinkButton href="/simulador" size="lg" className="font-medium px-8 text-white"
              style={{ background: '#B39533', borderColor: '#B39533' } as React.CSSProperties}>
              Simular Financiamento <ArrowRight className="ml-2 h-4 w-4" />
            </LinkButton>
            <LinkButton href="https://calendar.app.google/AgKHtxDWpGcoZE3m9" external size="lg" variant="outline"
              className="font-medium px-8" style={{ borderColor: '#B39533', color: '#B39533' } as React.CSSProperties}>
              Agendar Atendimento
            </LinkButton>
          </div>
        </div>
      </section>
    </div>
  )
}
