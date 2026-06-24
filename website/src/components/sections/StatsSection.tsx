const stats = [
  { value: '500+', label: 'Financiamentos aprovados' },
  { value: 'R$ 120M+', label: 'Em crédito captado' },
  { value: '98%', label: 'Clientes satisfeitos' },
  { value: '10+', label: 'Anos de mercado' },
]

export default function StatsSection() {
  return (
    <section className="bg-green-700 text-white py-14">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl lg:text-4xl font-bold mb-1">{stat.value}</p>
              <p className="text-green-200 text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
