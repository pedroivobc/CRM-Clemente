import type { Metadata } from 'next'
import SimulatorForm from '@/components/simulator/SimulatorForm'

export const metadata: Metadata = {
  title: 'Simulador de Financiamento Imobiliário',
  description: 'Simule seu financiamento imobiliário gratuitamente. Descubra a parcela estimada, programa elegível e as melhores condições para seu perfil.',
}

export default function SimuladorPage() {
  return (
    <div style={{ background: '#F7F4EF', minHeight: '100vh' }}>
      {/* Header */}
      <section className="py-16 relative" style={{ background: '#0D0B09' }}>
        <div className="h-px absolute top-0 left-0 right-0" style={{ background: 'linear-gradient(90deg, transparent, #B39533, transparent)' }} />
        <div className="container mx-auto px-4 lg:px-8 text-center">
          <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#B39533' }}>GRATUITO E SEM COMPROMISSO</p>
          <h1 className="text-4xl font-light mb-4" style={{ color: '#FFFFFF', fontFamily: 'Georgia, serif' }}>
            Simulador de Financiamento
          </h1>
          <p className="text-sm max-w-xl mx-auto" style={{ color: '#7A7068' }}>
            Preencha os dados abaixo e receba uma estimativa personalizada.
            Um especialista entra em contato para dar continuidade.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="container mx-auto px-4 lg:px-8">
          <SimulatorForm />
        </div>
      </section>
    </div>
  )
}
