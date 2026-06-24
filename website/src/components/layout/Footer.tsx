import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Phone, Mail, Clock } from 'lucide-react'

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
    <footer style={{ background: '#0D0B09', color: '#9B9490' }}>
      <div className="container mx-auto px-4 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">

          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="mb-5">
              {/* White version of logo for dark bg */}
              <div className="flex items-center gap-3">
                <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="20" cy="24" r="17" stroke="#B39533" strokeWidth="4" fill="none"
                    strokeDasharray="88 20" strokeLinecap="round"
                    transform="rotate(-30 20 24)" />
                </svg>
                <div>
                  <p style={{ color: '#FFFFFF', fontFamily: 'Georgia, serif', fontSize: '1.125rem', lineHeight: 1, fontWeight: 400 }}>clemente</p>
                  <p style={{ color: '#B39533', fontSize: '0.65rem', letterSpacing: '0.12em', marginTop: 3 }}>ASSESSORIA IMOB.</p>
                </div>
              </div>
            </div>
            <p className="text-sm leading-relaxed mb-5" style={{ color: '#7A7068' }}>
              Especialistas em assessoria imobiliária, correspondente bancário e
              despachante. Realizamos o sonho da casa própria com transparência e cuidado.
            </p>
            {/* Divider ornament */}
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 max-w-8" style={{ background: '#B39533' }} />
              <span style={{ color: '#B39533', fontSize: '0.65rem', letterSpacing: '0.15em' }}>DESDE 2014</span>
              <div className="h-px flex-1 max-w-8" style={{ background: '#B39533' }} />
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-xs font-semibold tracking-widest mb-4 uppercase" style={{ color: '#B39533' }}>Serviços</h3>
            <ul className="space-y-2.5">
              {services.map((s) => (
                <li key={s.href}>
                  <Link href={s.href} className="text-sm hover:text-white transition-colors" style={{ color: '#7A7068' }}>
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-xs font-semibold tracking-widest mb-4 uppercase" style={{ color: '#B39533' }}>Empresa</h3>
            <ul className="space-y-2.5">
              {company.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} className="text-sm hover:text-white transition-colors" style={{ color: '#7A7068' }}>
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-semibold tracking-widest mb-4 uppercase" style={{ color: '#B39533' }}>Contato</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5 text-sm" style={{ color: '#7A7068' }}>
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#B39533' }} />
                <span>São Paulo, SP — Brasil</span>
              </li>
              <li>
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 text-sm hover:text-white transition-colors" style={{ color: '#7A7068' }}>
                  <Phone className="h-4 w-4 shrink-0" style={{ color: '#B39533' }} />
                  <span>WhatsApp</span>
                </a>
              </li>
              <li>
                <a href="mailto:contato@clementeassessoria.com.br"
                  className="flex items-center gap-2.5 text-sm hover:text-white transition-colors" style={{ color: '#7A7068' }}>
                  <Mail className="h-4 w-4 shrink-0" style={{ color: '#B39533' }} />
                  <span>contato@clementeassessoria.com.br</span>
                </a>
              </li>
              <li className="flex items-start gap-2.5 text-sm" style={{ color: '#7A7068' }}>
                <Clock className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#B39533' }} />
                <span>Seg–Sex 8h–18h · Sáb 9h–13h</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="container mx-auto px-4 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs" style={{ color: '#4A4540' }}>
          <p>© {new Date().getFullYear()} Clemente Assessoria Imobiliária. Todos os direitos reservados.</p>
          <Link href="/politica-de-privacidade" className="hover:text-white transition-colors">
            Política de Privacidade
          </Link>
        </div>
      </div>
    </footer>
  )
}
