import { ArrowRight, Shield, Star, TrendingUp } from 'lucide-react'
import { LinkButton, AnchorButton } from '@/components/ui/link-button'

export default function Hero() {
  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '5511999999999'
  const message = encodeURIComponent('Olá! Gostaria de fazer uma simulação de financiamento imobiliário.')

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-green-900 text-white">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-green-500 blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-blue-500 blur-3xl" />
      </div>

      <div className="relative container mx-auto px-4 lg:px-8 py-24 lg:py-36">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-green-700/30 border border-green-500/30 rounded-full px-4 py-1.5 text-sm text-green-300 mb-6">
            <Star className="h-3.5 w-3.5 fill-green-400 text-green-400" />
            Especialistas em financiamento habitacional
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            Realize o sonho da{' '}
            <span className="text-green-400">casa própria</span>{' '}
            com quem entende do assunto
          </h1>

          <p className="text-lg text-gray-300 leading-relaxed mb-10 max-w-2xl">
            Somos especialistas em assessoria imobiliária, correspondente bancário e
            despachante imobiliário. Cuidamos de todo o processo de financiamento para
            você, do início ao registro.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <LinkButton
              href="/simulador"
              size="lg"
              className="bg-green-600 hover:bg-green-700 text-white font-semibold text-base px-8 border-green-600"
            >
              Simular Financiamento <ArrowRight className="ml-2 h-4 w-4" />
            </LinkButton>
            <AnchorButton
              href={`https://wa.me/${whatsapp}?text=${message}`}
              target="_blank"
              rel="noopener noreferrer"
              size="lg"
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 text-base px-8"
            >
              Falar com Especialista
            </AnchorButton>
          </div>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: Shield, label: 'Processo seguro', desc: 'Acompanhamos cada etapa do seu financiamento' },
              { icon: TrendingUp, label: 'Melhor taxa', desc: 'Comparamos bancos para você ter a melhor oferta' },
              { icon: Star, label: 'Atendimento personalizado', desc: 'Consultoria dedicada do início ao fim' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-green-700/30 shrink-0">
                  <Icon className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">{label}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
