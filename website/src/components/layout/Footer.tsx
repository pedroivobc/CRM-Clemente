import Link from 'next/link'
import { MapPin, Phone, Mail, Share2 } from 'lucide-react'

const services = [
  { label: 'Correspondente Bancário', href: '/servicos#correspondente' },
  { label: 'Despachante Imobiliário', href: '/servicos#despachante' },
  { label: 'Assessoria Imobiliária', href: '/servicos#assessoria' },
  { label: 'Simulador de Financiamento', href: '/simulador' },
]

const company = [
  { label: 'Sobre Nós', href: '/sobre' },
  { label: 'Blog', href: '/blog' },
  { label: 'Contato', href: '/contato' },
  { label: 'Política de Privacidade', href: '/politica-de-privacidade' },
]

export default function Footer() {
  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '5511999999999'

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-9 w-9 rounded-lg bg-green-600 flex items-center justify-center">
                <span className="text-white font-bold">CA</span>
              </div>
              <div>
                <p className="font-bold text-white text-lg leading-none">Clemente</p>
                <p className="text-green-500 text-xs tracking-wide">Assessoria</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mb-4">
              Especialistas em assessoria imobiliária, correspondente bancário e
              despachante imobiliário. Realizamos o sonho da casa própria.
            </p>
            <div className="flex gap-3">
              <a href="#" aria-label="Redes sociais" className="p-2 rounded-full bg-gray-800 hover:bg-green-700 transition-colors">
                <Share2 className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="font-semibold text-white mb-4">Serviços</h3>
            <ul className="space-y-2">
              {services.map((s) => (
                <li key={s.href}>
                  <Link href={s.href} className="text-sm text-gray-400 hover:text-green-400 transition-colors">
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold text-white mb-4">Empresa</h3>
            <ul className="space-y-2">
              {company.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} className="text-sm text-gray-400 hover:text-green-400 transition-colors">
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-white mb-4">Contato</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-sm text-gray-400">
                <MapPin className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                <span>São Paulo, SP — Brasil</span>
              </li>
              <li>
                <a
                  href={`https://wa.me/${whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-green-400 transition-colors"
                >
                  <Phone className="h-4 w-4 text-green-500 shrink-0" />
                  <span>WhatsApp</span>
                </a>
              </li>
              <li>
                <a
                  href="mailto:contato@clementeassessoria.com.br"
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-green-400 transition-colors"
                >
                  <Mail className="h-4 w-4 text-green-500 shrink-0" />
                  <span>contato@clementeassessoria.com.br</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-800">
        <div className="container mx-auto px-4 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Clemente Assessoria. Todos os direitos reservados.</p>
          <Link href="/politica-de-privacidade" className="hover:text-gray-300 transition-colors">
            Política de Privacidade
          </Link>
        </div>
      </div>
    </footer>
  )
}
