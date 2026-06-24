import type { Metadata } from 'next'
import React from 'react'
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
        <h1 className="text-2xl font-light mb-4" style={{ color: '#1A1612', fontFamily: 'Georgia, serif' }}>Artigo não encontrado</h1>
        <LinkButton href="/blog" className="text-white" style={{ background: '#B39533', borderColor: '#B39533' } as React.CSSProperties}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao Blog
        </LinkButton>
      </div>
    )
  }

  return (
    <article style={{ background: '#FFFFFF', minHeight: '100vh' }}>
      <div className="py-16 relative" style={{ background: '#0D0B09' }}>
        <div className="h-px absolute top-0 left-0 right-0" style={{ background: 'linear-gradient(90deg, transparent, #B39533, transparent)' }} />
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm mb-6 transition-opacity hover:opacity-70"
            style={{ color: '#7A7068' }}>
            <ArrowLeft className="h-4 w-4" /> Voltar ao Blog
          </Link>
          <h1 className="text-3xl lg:text-4xl font-light mb-4" style={{ color: '#FFFFFF', fontFamily: 'Georgia, serif' }}>{post.title}</h1>
          <div className="flex items-center gap-4 text-sm" style={{ color: '#7A7068' }}>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(post.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </span>
            <span>{post.author}</span>
          </div>
          {post.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="secondary"
                  style={{ background: 'rgba(179,149,51,0.15)', color: '#8C7425', borderColor: 'transparent' }}>
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

        <div className="mt-12 p-6 rounded" style={{ background: '#F7F4EF', outline: '1px solid #E8E3DC' }}>
          <h3 className="font-semibold mb-2" style={{ color: '#1A1612', fontFamily: 'Georgia, serif' }}>Precisa de ajuda especializada?</h3>
          <p className="text-sm mb-4" style={{ color: '#7A7068' }}>
            Nossa equipe está pronta para analisar seu caso e te ajudar a conquistar seu imóvel.
          </p>
          <div className="flex gap-3 flex-wrap">
            <LinkButton href="/simulador" className="text-white"
              style={{ background: '#B39533', borderColor: '#B39533' } as React.CSSProperties}>
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
