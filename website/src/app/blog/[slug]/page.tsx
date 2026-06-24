import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { LinkButton } from '@/components/ui/link-button'

const posts: Record<string, { title: string; content: string; author: string; published_at: string; tags: string[] }> = {
  'como-usar-fgts-compra-imovel': {
    title: 'Como usar o FGTS na compra do seu imóvel',
    author: 'Clemente Assessoria',
    published_at: '2024-11-10T00:00:00Z',
    tags: ['FGTS', 'Financiamento', 'Dicas'],
    content: `
      <p>O Fundo de Garantia do Tempo de Serviço (FGTS) é um dos maiores aliados de quem deseja comprar um imóvel. Mas muita gente não sabe exatamente como utilizá-lo.</p>
      <h2>Quem pode usar?</h2>
      <p>Para usar o FGTS na compra do imóvel, você precisa: ter pelo menos 3 anos de trabalho com carteira assinada (somados ou não), não possuir outro imóvel residencial na mesma cidade, e o imóvel deve ser residencial e estar localizado na cidade onde você mora ou trabalha.</p>
      <h2>Como posso usar?</h2>
      <ul>
        <li><strong>Como entrada:</strong> O valor do FGTS pode ser usado para compor a entrada do financiamento</li>
        <li><strong>Amortização:</strong> Reduz o saldo devedor, diminuindo parcelas ou prazo</li>
        <li><strong>Liquidação:</strong> Em alguns casos, é possível quitar o financiamento com o FGTS</li>
      </ul>
      <h2>Documentos necessários</h2>
      <p>Para movimentar o FGTS, você precisará de: extrato do FGTS, comprovante de residência e trabalho, documentos do imóvel e declaração de primeiro imóvel (se aplicável).</p>
      <p>Nossa equipe pode te ajudar com todo esse processo. <a href="/contato">Entre em contato</a> e fale com um especialista.</p>
    `,
  },
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = posts[slug]
  return {
    title: post?.title || 'Artigo não encontrado',
    description: post?.title,
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = posts[slug]

  if (!post) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Artigo não encontrado</h1>
        <LinkButton href="/blog" className="bg-green-600 hover:bg-green-700 border-green-600 text-white">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao Blog
        </LinkButton>
      </div>
    )
  }

  return (
    <article className="bg-white min-h-screen">
      <div className="bg-gray-900 text-white py-16">
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
          <Link href="/blog" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Voltar ao Blog
          </Link>
          <h1 className="text-3xl lg:text-4xl font-bold mb-4">{post.title}</h1>
          <div className="flex items-center gap-4 text-gray-400 text-sm">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(post.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </span>
            <span>{post.author}</span>
          </div>
          {post.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="bg-green-700/30 text-green-300 border-green-600/30">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 lg:px-8 max-w-3xl py-12">
        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        <div className="mt-12 p-6 bg-green-50 rounded-2xl border border-green-100">
          <h3 className="font-bold text-gray-900 mb-2">Precisa de ajuda especializada?</h3>
          <p className="text-gray-600 text-sm mb-4">
            Nossa equipe está pronta para analisar seu caso e te ajudar a conquistar seu imóvel.
          </p>
          <div className="flex gap-3">
            <LinkButton href="/simulador" className="bg-green-600 hover:bg-green-700 border-green-600 text-white">
              Simular Financiamento
            </LinkButton>
            <LinkButton href="/contato" variant="outline">
              Falar com consultor
            </LinkButton>
          </div>
        </div>
      </div>
    </article>
  )
}
