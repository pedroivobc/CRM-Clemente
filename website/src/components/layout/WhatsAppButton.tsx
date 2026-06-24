'use client'

import { MessageCircle } from 'lucide-react'

export default function WhatsAppButton() {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '5511999999999'
  const message = encodeURIComponent('Olá! Vim pelo site da Clemente Assessoria e gostaria de mais informações.')

  return (
    <a
      href={`https://wa.me/${number}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar pelo WhatsApp"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-0 overflow-hidden rounded-full shadow-xl group transition-all duration-300"
      style={{ background: '#25D366' }}
    >
      <span className="max-w-0 group-hover:max-w-xs overflow-hidden transition-all duration-300 ease-in-out">
        <span className="pl-4 pr-2 text-white text-sm font-medium whitespace-nowrap">WhatsApp</span>
      </span>
      <span className="p-4 flex items-center justify-center" style={{ background: '#25D366' }}>
        <MessageCircle className="h-6 w-6 text-white" />
      </span>
    </a>
  )
}
