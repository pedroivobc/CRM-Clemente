import Link from 'next/link'
import { Calendar, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { BlogPost } from '@/types'

export default function BlogCard({ post }: { post: BlogPost }) {
  return (
    <article className="bg-white rounded-2xl border border-gray-100 hover:shadow-md transition-shadow overflow-hidden group">
      {post.cover_url && (
        <div className="aspect-video bg-gray-100 overflow-hidden">
          <img
            src={post.cover_url}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}
      {!post.cover_url && (
        <div className="aspect-video bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center">
          <span className="text-white text-4xl font-bold opacity-20">{post.title[0]}</span>
        </div>
      )}
      <div className="p-5">
        <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(post.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <span>{post.author}</span>
        </div>
        <h3 className="font-bold text-gray-900 mb-2 leading-snug group-hover:text-green-700 transition-colors">
          <Link href={`/blog/${post.slug}`}>{post.title}</Link>
        </h3>
        <p className="text-gray-500 text-sm line-clamp-2 mb-4">{post.excerpt}</p>
        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs bg-green-50 text-green-700">
                <Tag className="h-2.5 w-2.5 mr-1" />{tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
