import { Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const testimonials = [
  {
    name: 'Marcos Oliveira',
    city: 'São Paulo, SP',
    text: 'A Clemente Assessoria me ajudou a conquistar meu apartamento em tempo recorde. Eles cuidaram de tudo — documentação, banco, cartório. Recomendo muito!',
    rating: 5,
  },
  {
    name: 'Ana Paula Costa',
    city: 'Guarulhos, SP',
    text: 'Tentei sozinha por meses sem sucesso. Com a equipe da Clemente, em 45 dias meu financiamento estava aprovado. Atendimento impecável do início ao fim.',
    rating: 5,
  },
  {
    name: 'Rafael Santos',
    city: 'Santo André, SP',
    text: 'Ótima assessoria! Me orientaram sobre o MCMV, consegui usar meu FGTS e ainda tive a melhor taxa. Profissionais sérios e comprometidos.',
    rating: 5,
  },
]

export default function TestimonialsSection() {
  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-14">
          <p className="text-green-600 font-semibold text-sm tracking-wide uppercase mb-2">Depoimentos</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            O que nossos clientes dizem
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <Card key={t.name} className="border border-gray-100 hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">&ldquo;{t.text}&rdquo;</p>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                  <p className="text-gray-400 text-xs">{t.city}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
