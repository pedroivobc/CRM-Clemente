'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { LinkButton } from '@/components/ui/link-button'

const navLinks = [
  { href: '/servicos', label: 'Serviços' },
  { href: '/simulador', label: 'Simulador' },
  { href: '/blog', label: 'Blog' },
  { href: '/sobre', label: 'Sobre' },
  { href: '/contato', label: 'Contato' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-[#E8E3DC] shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:px-8">

        <Link href="/" className="flex items-center shrink-0">
          <Image
            src="/logo.svg"
            alt="Clemente Assessoria"
            width={180}
            height={48}
            priority
            className="h-10 w-auto"
          />
        </Link>

        <nav className="hidden md:flex items-center gap-0.5">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-2 text-sm font-medium text-[#5E5651] hover:text-[#B39533] transition-colors rounded-md"
            >
              {link.label}
            </Link>
          ))}
          <LinkButton
            href="https://calendar.app.google/AgKHtxDWpGcoZE3m9"
            external
            className="ml-3 bg-[#B39533] hover:bg-[#8C7425] text-white border-[#B39533] font-medium text-sm px-4"
          >
            Agendar Atendimento
          </LinkButton>
        </nav>

        <button
          className="md:hidden p-2 rounded-lg text-[#3D3530] hover:bg-[#F0EDE8] transition-colors"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-[#E8E3DC] px-4 py-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 rounded-lg text-sm text-[#5E5651] hover:bg-[#F0EDE8] hover:text-[#B39533] transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <LinkButton
            href="https://calendar.app.google/AgKHtxDWpGcoZE3m9"
            external
            className="mt-3 w-full justify-center bg-[#B39533] hover:bg-[#8C7425] text-white border-[#B39533]"
          >
            Agendar Atendimento
          </LinkButton>
        </div>
      )}
    </header>
  )
}
