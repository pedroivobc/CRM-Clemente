import type { Metadata } from 'next'
import BlogCard from '@/components/blog/BlogCard'
import { BlogPost } from '@/types'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Artigos sobre financiamento imobiliário, MCMV, FGTS e mercado imobiliário. Fique por dentro das melhores dicas para conquistar seu imóvel.',
}

// Static seed posts — in production these come from Supabase
const seedPosts: BlogPost[] = [
  {
    id: '1',
    title: 'Como usar o FGTS na compra do seu imóvel',
    slug: 'como-usar-fgts-compra-imovel',
    excerpt: 'O FGTS pode ser utilizado como entrada, para amortizar o saldo devedor ou reduzir parcelas. Saiba exatamente como funciona e quais as regras atuais.',
    content: '',
    cover_url: '',
    author: 'Clemente Assessoria',
    published_at: '2024-11-10T00:00:00Z',
    tags: ['FGTS', 'Financiamento', 'Dicas'],
  },
  {
    id: '2',
    title: 'Minha Casa Minha Vida 2024: quem pode participar?',
    slug: 'minha-casa-minha-vida-2024-quem-pode-participar',
    excerpt: 'O programa MCMV passou por mudanças importantes. Entenda as faixas de renda, limites de valor do imóvel e condições atualizadas para 2024.',
    content: '',
    cover_url: '',
    author: 'Clemente Assessoria',
    published_at: '2024-10-22T00:00:00Z',
    tags: ['MCMV', 'Habitação', 'Governo Federal'],
  },
  {
    id: '3',
    title: 'Correspondente bancário: o que é e como ele pode te ajudar',
    slug: 'correspondente-bancario-o-que-e',
    excerpt: 'Entenda o papel do correspondente bancário no processo de financiamento imobiliário e por que contar com esse profissional pode acelerar sua aprovação.',
    content: '',
    cover_url: '',
    author: 'Clemente Assessoria',
    published_at: '2024-09-15T00:00:00Z',
    tags: ['Correspondente Bancário', 'Crédito', 'Financiamento'],
  },
  {
    id: '4',
    title: 'Documentos necessários para financiar um imóvel',
    slug: 'documentos-necessarios-para-financiar-imovel',
    excerpt: 'Lista completa com todos os documentos pessoais, do imóvel e do vendedor que o banco vai solicitar. Monte seu dossiê sem estresse.',
    content: '',
    cover_url: '',
    author: 'Clemente Assessoria',
    published_at: '2024-08-30T00:00:00Z',
    tags: ['Documentação', 'Dicas', 'Financiamento'],
  },
  {
    id: '5',
    title: 'Taxa SELIC em queda: o que muda no seu financiamento?',
    slug: 'taxa-selic-queda-financiamento',
    excerpt: 'Quando a SELIC cai, as taxas de crédito imobiliário tendem a seguir. Entenda o impacto nas parcelas do financiamento habitacional.',
    content: '',
    cover_url: '',
    author: 'Clemente Assessoria',
    published_at: '2024-07-18T00:00:00Z',
    tags: ['Economia', 'Taxa de Juros', 'Mercado'],
  },
  {
    id: '6',
    title: 'Análise de crédito: como aumentar suas chances de aprovação',
    slug: 'analise-credito-aumentar-chances-aprovacao',
    excerpt: 'Renda, score, histórico bancário — saiba o que os bancos analisam e como se preparar para ter seu crédito imobiliário aprovado com mais facilidade.',
    content: '',
    cover_url: '',
    author: 'Clemente Assessoria',
    published_at: '2024-06-05T00:00:00Z',
    tags: ['Crédito', 'Score', 'Aprovação'],
  },
]

export default function BlogPage() {
  return (
    <div style={{ background: '#F7F4EF', minHeight: '100vh' }}>
      <section className="py-20 relative" style={{ background: '#0D0B09' }}>
        <div className="h-px absolute top-0 left-0 right-0" style={{ background: 'linear-gradient(90deg, transparent, #B39533, transparent)' }} />
        <div className="container mx-auto px-4 lg:px-8 text-center">
          <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#B39533' }}>CONTEÚDO GRATUITO</p>
          <h1 className="text-4xl lg:text-5xl font-light mb-4" style={{ color: '#FFFFFF', fontFamily: 'Georgia, serif' }}>Blog</h1>
          <p className="text-sm max-w-xl mx-auto" style={{ color: '#7A7068' }}>
            Dicas, orientações e notícias do mercado imobiliário para você tomar as melhores decisões.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {seedPosts.map((post) => (
              <BlogCard key={post.id} post={post} />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
