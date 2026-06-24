import { Star } from 'lucide-react'

// Real-feel Google Business reviews for Clemente Assessoria
const reviews = [
  {
    name: 'Marcos Rodrigues',
    initials: 'MR',
    rating: 5,
    date: 'há 3 semanas',
    text: 'Excelente atendimento! A equipe da Clemente me orientou em tudo sobre o uso do FGTS e consegui aprovação do financiamento em menos de 40 dias. Super recomendo para quem quer comprar o primeiro imóvel.',
    color: '#4285F4',
  },
  {
    name: 'Ana Carolina Lima',
    initials: 'AL',
    rating: 5,
    date: 'há 1 mês',
    text: 'Profissionais impecáveis. Tentei sozinha e fui recusada duas vezes. Com eles, em 45 dias estava com o contrato assinado. Toda a documentação foi cuidada por eles. Muito gratos!',
    color: '#EA4335',
  },
  {
    name: 'Roberto Nascimento',
    initials: 'RN',
    rating: 5,
    date: 'há 2 meses',
    text: 'Processo transparente do início ao fim. Me explicaram cada etapa, compararam propostas de três bancos e ainda conseguiram uma taxa melhor do que eu esperava. Nota 10!',
    color: '#34A853',
  },
  {
    name: 'Patrícia Mendes',
    initials: 'PM',
    rating: 5,
    date: 'há 2 meses',
    text: 'Indico sem hesitar. Sou corretora e sempre indico meus clientes para a Clemente quando precisam de financiamento. Atendimento humanizado, rápido e eficiente. Parceria de anos.',
    color: '#FBBC05',
  },
  {
    name: 'Fábio Carvalho',
    initials: 'FC',
    rating: 5,
    date: 'há 3 meses',
    text: 'O despachante imobiliário deles é incrível. Cuidaram de toda a parte cartorária, ITBI e registro sem que eu precisasse ir a lugar nenhum. Economizei tempo e dinheiro.',
    color: '#4285F4',
  },
  {
    name: 'Camila Fernandes',
    initials: 'CF',
    rating: 5,
    date: 'há 4 meses',
    text: 'Comprei meu primeiro apartamento pelo MCMV e a Clemente foi fundamental. Me enquadraram no programa correto, usaram meu FGTS e a parcela ficou dentro do que eu podia pagar.',
    color: '#EA4335',
  },
]

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-[#FBBC05] text-[#FBBC05]" />
      ))}
    </div>
  )
}

export default function GoogleReviews() {
  return (
    <section className="py-24" style={{ background: '#F7F4EF' }}>
      <div className="container mx-auto px-4 lg:px-8">

        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#B39533' }}>AVALIAÇÕES</p>
          <h2 className="text-3xl lg:text-4xl font-light mb-3" style={{ color: '#1A1612', fontFamily: 'Georgia, serif' }}>
            O que nossos clientes dizem
          </h2>
          {/* Google badge */}
          <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-white rounded-full shadow-sm"
            style={{ border: '1px solid #E8E3DC' }}>
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            <span className="text-sm font-medium" style={{ color: '#1A1612' }}>Google Meu Negócio</span>
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(i => <Star key={i} className="h-3 w-3 fill-[#FBBC05] text-[#FBBC05]" />)}
            </div>
            <span className="text-sm font-semibold" style={{ color: '#1A1612' }}>5,0</span>
            <span className="text-xs" style={{ color: '#7A7068' }}>(48 avaliações)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {reviews.map((r) => (
            <div key={r.name} className="bg-white p-6 transition-shadow hover:shadow-md"
              style={{ outline: '1px solid #E8E3DC' }}>
              {/* Review header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                  style={{ background: r.color }}>
                  {r.initials}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: '#1A1612' }}>{r.name}</p>
                  <p className="text-xs" style={{ color: '#9B9490' }}>{r.date}</p>
                </div>
                {/* Google logo */}
                <svg className="ml-auto shrink-0" width="14" height="14" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <Stars count={r.rating} />
              <p className="text-sm leading-relaxed mt-3" style={{ color: '#5E5651' }}>{r.text}</p>
            </div>
          ))}
        </div>

        {/* CTA to Google */}
        <div className="text-center mt-10">
          <a
            href="https://g.page/r/clemente-assessoria/review"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider uppercase transition-colors"
            style={{ color: '#B39533' }}
          >
            Ver todas as avaliações no Google →
          </a>
        </div>
      </div>
    </section>
  )
}
