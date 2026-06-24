'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X, Home, FileText, Info, BookOpen, Phone, Calculator } from 'lucide-react'
import { LinkButton } from '@/components/ui/link-button'

const navLinks = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/servicos', label: 'Serviços', icon: FileText },
  { href: '/simulador', label: 'Simulador', icon: Calculator },
  { href: '/blog', label: 'Blog', icon: BookOpen },
  { href: '/sobre', label: 'Sobre', icon: Info },
  { href: '/contato', label: 'Contato', icon: Phone },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-gray-100 shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-green-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">CA</span>
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-bold text-gray-900 text-base">Clemente</span>
            <span className="text-green-600 text-xs font-medium tracking-wide">Assessoria</span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-green-700 hover:bg-green-50 rounded-md transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <LinkButton href="/simulador" size="sm" className="ml-4 bg-green-600 hover:bg-green-700 text-white border-green-600">
            Simular Financiamento
          </LinkButton>
        </nav>

        <button
          className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4">
          {navLinks.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors"
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            )
          })}
          <LinkButton
            href="/simulador"
            className="mt-4 bg-green-600 hover:bg-green-700 border-green-600 text-white w-full justify-center"
          >
            Simular Financiamento
          </LinkButton>
        </div>
      )}
    </header>
  )
}
