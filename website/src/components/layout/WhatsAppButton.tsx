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
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 group"
    >
      <span className="hidden group-hover:flex items-center px-4 py-3 text-sm font-medium whitespace-nowrap">
        Falar no WhatsApp
      </span>
      <span className="p-4 group-hover:pl-0">
        <MessageCircle className="h-6 w-6" />
      </span>
    </a>
  )
}
