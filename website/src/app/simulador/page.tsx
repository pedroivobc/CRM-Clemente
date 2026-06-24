import type { Metadata } from 'next'
import SimulatorForm from '@/components/simulator/SimulatorForm'

export const metadata: Metadata = {
  title: 'Simulador de Financiamento Imobiliário',
  description: 'Simule seu financiamento imobiliário gratuitamente. Descubra o valor da parcela, programa elegível e as melhores condições para seu perfil.',
}

export default function SimuladorPage() {
  return (
    <div className="bg-gray-50 min-h-screen py-16">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-green-600 font-semibold text-sm tracking-wide uppercase mb-2">Simulação Gratuita</p>
          <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            Simulador de Financiamento Imobiliário
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            Preencha os dados abaixo para receber uma estimativa personalizada.
            Nossa equipe entra em contato para dar continuidade ao processo.
          </p>
        </div>

        <SimulatorForm />
      </div>
    </div>
  )
}
