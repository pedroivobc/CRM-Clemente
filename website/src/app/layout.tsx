import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import WhatsAppButton from '@/components/layout/WhatsAppButton'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'Clemente Assessoria | Financiamento Imobiliário e Despachante',
    template: '%s | Clemente Assessoria',
  },
  description:
    'Assessoria imobiliária especializada em financiamento habitacional, correspondente bancário e despachante imobiliário. Realizamos o sonho da casa própria em São Paulo e região.',
  keywords: [
    'assessoria imobiliária',
    'financiamento imobiliário',
    'correspondente bancário',
    'despachante imobiliário',
    'MCMV',
    'Minha Casa Minha Vida',
    'FGTS',
    'São Paulo',
  ],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: process.env.NEXT_PUBLIC_SITE_URL,
    siteName: 'Clemente Assessoria',
    title: 'Clemente Assessoria | Financiamento Imobiliário',
    description: 'Especialistas em assessoria imobiliária e financiamento habitacional.',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <Navbar />
        <main>{children}</main>
        <Footer />
        <WhatsAppButton />
      </body>
    </html>
  )
}
