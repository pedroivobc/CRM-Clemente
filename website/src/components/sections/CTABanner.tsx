import { ArrowRight, CalendarCheck } from 'lucide-react'
import { LinkButton, AnchorButton } from '@/components/ui/link-button'

export default function CTABanner() {
  return (
    <section className="py-20 relative overflow-hidden" style={{ background: '#0D0B09' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-64 h-64 rounded-full opacity-10 blur-3xl" style={{ background: '#B39533' }} />
      </div>
      {/* Top gold line */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #B39533, transparent)' }} />

      <div className="relative container mx-auto px-4 lg:px-8 text-center">
        <p className="text-xs font-semibold tracking-widest mb-4" style={{ color: '#B39533' }}>COMECE AGORA</p>
        <h2 className="text-3xl lg:text-4xl font-light mb-4" style={{ color: '#FFFFFF', fontFamily: 'Georgia, serif' }}>
          Pronto para conquistar seu imóvel?
        </h2>
        <p className="mb-10 max-w-lg mx-auto text-sm leading-relaxed" style={{ color: '#7A7068' }}>
          Simule gratuitamente ou agende uma conversa com nossos especialistas.
          Atendimento presencial e online disponível.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <LinkButton
            href="/simulador"
            size="lg"
            className="font-medium px-8 text-white"
            style={{ background: '#B39533', borderColor: '#B39533' } as React.CSSProperties}
          >
            Simular agora <ArrowRight className="ml-2 h-4 w-4" />
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
      </div>
    </section>
  )
}
