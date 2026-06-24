const stats = [
  { value: '500+', label: 'Financiamentos aprovados' },
  { value: 'R$ 120M+', label: 'Em crédito captado' },
  { value: '98%', label: 'Clientes satisfeitos' },
  { value: '10+', label: 'Anos de mercado' },
]

export default function StatsSection() {
  return (
    <section style={{ background: '#B39533' }}>
      <div className="container mx-auto px-4 lg:px-8 py-14">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-10 text-center">
          {stats.map((stat, i) => (
            <div key={stat.label}>
              {i > 0 && (
                <div className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 h-8 w-px"
                  style={{ background: 'rgba(255,255,255,0.25)' }} />
              )}
              <p className="text-3xl lg:text-4xl font-light mb-1" style={{ color: '#FFFFFF', fontFamily: 'Georgia, serif' }}>
                {stat.value}
              </p>
              <p className="text-xs tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.7)' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
