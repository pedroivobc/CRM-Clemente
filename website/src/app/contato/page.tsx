import type { Metadata } from 'next'
import { MapPin, Phone, Mail, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import ContactForm from '@/components/sections/ContactForm'

export const metadata: Metadata = {
  title: 'Contato',
  description: 'Entre em contato com a Clemente Assessoria. Estamos prontos para tirar suas dúvidas sobre financiamento imobiliário e assessoria habitacional.',
}

const contactInfo = [
  { icon: MapPin, label: 'Endereço', value: 'São Paulo, SP — Brasil' },
  { icon: Phone, label: 'WhatsApp', value: 'Disponível via botão no site' },
  { icon: Mail, label: 'E-mail', value: 'contato@clementeassessoria.com.br' },
  { icon: Clock, label: 'Atendimento', value: 'Seg–Sex: 8h–18h | Sáb: 9h–13h' },
]

export default function ContatoPage() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <section className="bg-gray-900 text-white py-20">
        <div className="container mx-auto px-4 lg:px-8 text-center">
          <p className="text-green-400 font-semibold text-sm tracking-wide uppercase mb-2">Fale conosco</p>
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">Contato</h1>
          <p className="text-gray-400 max-w-xl mx-auto">
            Tem dúvidas? Quer iniciar um financiamento? Estamos aqui para ajudar.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Contact info */}
            <div className="space-y-4">
              {contactInfo.map(({ icon: Icon, label, value }) => (
                <Card key={label} className="border border-gray-100">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-green-50 shrink-0">
                      <Icon className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-medium">{label}</p>
                      <p className="text-sm text-gray-700 mt-0.5">{value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Form */}
            <Card className="lg:col-span-2 border border-gray-100 shadow-sm">
              <CardContent className="p-6 lg:p-8">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Envie uma mensagem</h2>
                <ContactForm />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  )
}
