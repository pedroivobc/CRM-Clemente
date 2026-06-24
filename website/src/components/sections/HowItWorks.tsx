const steps = [
  {
    number: '01',
    title: 'Simulação Online',
    description: 'Preencha nosso simulador e receba em segundos uma estimativa personalizada de financiamento.',
  },
  {
    number: '02',
    title: 'Análise Personalizada',
    description: 'Nossa equipe avalia seu perfil e identifica o banco e programa habitacional mais vantajoso.',
  },
  {
    number: '03',
    title: 'Documentação Completa',
    description: 'Cuidamos da checagem documental, análise jurídica e submissão da proposta ao banco.',
  },
  {
    number: '04',
    title: 'Aprovação e Registro',
    description: 'Acompanhamos a aprovação, assinatura do contrato e registro em cartório até a entrega das chaves.',
  },
]

export default function HowItWorks() {
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#B39533' }}>COMO FUNCIONA</p>
          <h2 className="text-3xl lg:text-4xl font-light mb-4" style={{ color: '#1A1612', fontFamily: 'Georgia, serif' }}>
            Do primeiro contato até as chaves na mão
          </h2>
          <div className="h-px w-16 mx-auto" style={{ background: '#B39533' }} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <div key={step.number} className="relative">
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-7 left-[calc(100%_-_16px)] w-8 h-px"
                  style={{ background: 'linear-gradient(90deg, #B39533, rgba(179,149,51,0.2))' }} />
              )}
              <div className="mb-5 inline-flex items-center justify-center w-14 h-14 rounded-full text-xl font-light"
                style={{ background: '#0D0B09', color: '#B39533', fontFamily: 'Georgia, serif', border: '1px solid #2A2520' }}>
                {step.number}
              </div>
              <h3 className="font-medium mb-2" style={{ color: '#1A1612' }}>{step.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#7A7068' }}>{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
