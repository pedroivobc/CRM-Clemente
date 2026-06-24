import type { Metadata } from 'next'
import { MapPin, Phone, Mail, Clock, CalendarCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { AnchorButton } from '@/components/ui/link-button'
import ContactForm from '@/components/sections/ContactForm'

export const metadata: Metadata = {
  title: 'Contato',
  description: 'Entre em contato com a Clemente Assessoria. Atendimento presencial e online para financiamento imobiliário.',
}

const contactInfo = [
  { icon: MapPin, label: 'Endereço', value: 'São Paulo, SP — Brasil' },
  { icon: Phone, label: 'WhatsApp', value: 'Disponível via botão no site' },
  { icon: Mail, label: 'E-mail', value: 'contato@clementeassessoria.com.br' },
  { icon: Clock, label: 'Atendimento', value: 'Seg–Sex: 8h–18h | Sáb: 9h–13h' },
]

export default function ContatoPage() {
  return (
    <div style={{ background: '#F7F4EF', minHeight: '100vh' }}>
      <section className="py-20 relative" style={{ background: '#0D0B09' }}>
        <div className="h-px absolute top-0 left-0 right-0" style={{ background: 'linear-gradient(90deg, transparent, #B39533, transparent)' }} />
        <div className="container mx-auto px-4 lg:px-8 text-center">
          <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#B39533' }}>FALE CONOSCO</p>
          <h1 className="text-4xl lg:text-5xl font-light mb-4" style={{ color: '#FFFFFF', fontFamily: 'Georgia, serif' }}>Contato</h1>
          <p className="max-w-xl mx-auto text-sm mb-8" style={{ color: '#7A7068' }}>
            Tem dúvidas ou quer iniciar um financiamento? Estamos aqui para ajudar.
          </p>
          {/* Scheduling CTA */}
          <AnchorButton
            href="https://calendar.app.google/AgKHtxDWpGcoZE3m9"
            target="_blank"
            rel="noopener noreferrer"
            size="lg"
            className="font-medium px-8 text-white"
            style={{ background: '#B39533', borderColor: '#B39533' } as React.CSSProperties}
          >
            <CalendarCheck className="mr-2 h-4 w-4" />
            Agendar Atendimento Online ou Presencial
          </AnchorButton>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Contact info */}
            <div className="space-y-4">
              {contactInfo.map(({ icon: Icon, label, value }) => (
                <div key={label} className="p-4 bg-white flex items-start gap-3" style={{ outline: '1px solid #E8E3DC' }}>
                  <div className="p-2 rounded-full shrink-0" style={{ background: 'rgba(179,149,51,0.1)' }}>
                    <Icon className="h-4 w-4" style={{ color: '#B39533' }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wider uppercase" style={{ color: '#B39533' }}>{label}</p>
                    <p className="text-sm mt-0.5" style={{ color: '#5E5651' }}>{value}</p>
                  </div>
                </div>
              ))}

              {/* Scheduling card */}
              <div className="p-5 text-white" style={{ background: '#0D0B09', outline: '1px solid #2A2520' }}>
                <CalendarCheck className="h-5 w-5 mb-3" style={{ color: '#B39533' }} />
                <p className="font-medium mb-1 text-sm">Prefere agendar?</p>
                <p className="text-xs mb-4" style={{ color: '#7A7068' }}>Escolha o melhor horário para atendimento presencial ou por videochamada.</p>
                <a
                  href="https://calendar.app.google/AgKHtxDWpGcoZE3m9"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase transition-colors"
                  style={{ color: '#B39533' }}
                >
                  Abrir agendamento →
                </a>
              </div>
            </div>

            {/* Form */}
            <Card className="lg:col-span-2 bg-white" style={{ outline: '1px solid #E8E3DC' }}>
              <CardContent className="p-6 lg:p-8">
                <h2 className="text-xl font-light mb-6" style={{ color: '#1A1612', fontFamily: 'Georgia, serif' }}>Envie uma mensagem</h2>
                <ContactForm />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  )
}
