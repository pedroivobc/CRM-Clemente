const steps = [
  {
    number: '01',
    title: 'Simulação Online',
    description: 'Preencha o simulador com seus dados e receba uma estimativa imediata de financiamento.',
  },
  {
    number: '02',
    title: 'Análise Personalizada',
    description: 'Nossa equipe analisa seu perfil e identifica o banco e programa ideal para você.',
  },
  {
    number: '03',
    title: 'Documentação Completa',
    description: 'Cuidamos de toda a burocracia: checagem documental, análise jurídica e submissão ao banco.',
  },
  {
    number: '04',
    title: 'Aprovação e Registro',
    description: 'Acompanhamos a aprovação, assinatura do contrato e registro em cartório até a entrega das chaves.',
  },
]

export default function HowItWorks() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-14">
          <p className="text-green-600 font-semibold text-sm tracking-wide uppercase mb-2">Como funciona</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            Do primeiro contato até as chaves na mão
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Um processo transparente, guiado por especialistas em cada etapa da sua jornada.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <div key={step.number} className="relative">
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-full w-full h-0.5 bg-green-200 z-0 -translate-x-4" />
              )}
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-green-600 text-white flex items-center justify-center text-xl font-bold mb-4 shadow-md shadow-green-200">
                  {step.number}
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
