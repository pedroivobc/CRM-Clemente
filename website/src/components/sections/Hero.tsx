import { ArrowRight, CalendarCheck } from 'lucide-react'
import { LinkButton, AnchorButton } from '@/components/ui/link-button'

export default function Hero() {
  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '5511999999999'
  const message = encodeURIComponent('Olá! Gostaria de fazer uma simulação de financiamento imobiliário.')

  return (
    <section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0D0B09 0%, #1A1410 60%, #110F0C 100%)' }}>
      {/* Subtle gold glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/3 w-96 h-96 rounded-full opacity-10 blur-3xl" style={{ background: '#B39533' }} />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full opacity-5 blur-3xl" style={{ background: '#B39533' }} />
      </div>

      {/* Gold top line */}
      <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, transparent, #B39533, transparent)' }} />

      <div className="relative container mx-auto px-4 lg:px-8 py-24 lg:py-36">
        <div className="max-w-3xl">

          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs tracking-widest mb-8"
            style={{ border: '1px solid rgba(179,149,51,0.4)', color: '#B39533', background: 'rgba(179,149,51,0.08)' }}>
            ASSESSORIA IMOBILIÁRIA · SÃO PAULO
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light leading-tight mb-6" style={{ color: '#FFFFFF', fontFamily: 'Georgia, serif' }}>
            Realize o sonho da{' '}
            <span style={{ color: '#B39533' }}>casa própria</span>{' '}
            <br className="hidden sm:block" />
            com quem entende do assunto
          </h1>

          <p className="text-lg leading-relaxed mb-10 max-w-xl" style={{ color: '#9B9490' }}>
            Mais de 10 anos conectando famílias ao imóvel certo — do financiamento ao
            registro em cartório, cuidamos de cada detalhe por você.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-16">
            <LinkButton
              href="/simulador"
              size="lg"
              className="font-medium px-8 text-white"
              style={{ background: '#B39533', borderColor: '#B39533' } as React.CSSProperties}
            >
              Simular Financiamento <ArrowRight className="ml-2 h-4 w-4" />
            </LinkButton>
            <AnchorButton
              href="https://calendar.app.google/AgKHtxDWpGcoZE3m9"
              target="_blank"
              rel="noopener noreferrer"
              size="lg"
              variant="outline"
              className="font-medium px-8"
              style={{ borderColor: 'rgba(179,149,51,0.5)', color: '#B39533' } as React.CSSProperties}
            >
              <CalendarCheck className="mr-2 h-4 w-4" />
              Agendar Atendimento
            </AnchorButton>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-8 max-w-sm" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '2rem' }}>
            {[
              { value: '500+', label: 'financiamentos' },
              { value: 'R$120M+', label: 'em crédito' },
              { value: '98%', label: 'satisfação' },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="text-xl font-light" style={{ color: '#B39533', fontFamily: 'Georgia, serif' }}>{value}</p>
                <p className="text-xs mt-1" style={{ color: '#5E5651' }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom gold line */}
      <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(179,149,51,0.3), transparent)' }} />
    </section>
  )
}
