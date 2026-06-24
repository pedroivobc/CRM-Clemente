import { ArrowRight } from 'lucide-react'
import { LinkButton } from '@/components/ui/link-button'

export default function CTABanner() {
  return (
    <section className="py-20 bg-gray-900 text-white">
      <div className="container mx-auto px-4 lg:px-8 text-center">
        <h2 className="text-3xl lg:text-4xl font-bold mb-4">
          Pronto para conquistar seu imóvel?
        </h2>
        <p className="text-gray-400 max-w-xl mx-auto mb-8">
          Faça uma simulação gratuita agora e descubra o quanto você pode financiar.
          Nossa equipe entra em contato para cuidar de tudo por você.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <LinkButton
            href="/simulador"
            size="lg"
            className="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 border-green-600"
          >
            Simular agora <ArrowRight className="ml-2 h-4 w-4" />
          </LinkButton>
          <LinkButton
            href="/contato"
            size="lg"
            variant="outline"
            className="border-white/30 text-white hover:bg-white/10 px-8"
          >
            Falar com consultor
          </LinkButton>
        </div>
      </div>
    </section>
  )
}
