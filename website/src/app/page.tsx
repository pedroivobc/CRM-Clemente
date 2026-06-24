import type { Metadata } from 'next'
import Hero from '@/components/sections/Hero'
import BankLogos from '@/components/sections/BankLogos'
import ServicesOverview from '@/components/sections/ServicesOverview'
import StatsSection from '@/components/sections/StatsSection'
import HowItWorks from '@/components/sections/HowItWorks'
import GoogleReviews from '@/components/sections/GoogleReviews'
import CTABanner from '@/components/sections/CTABanner'

export const metadata: Metadata = {
  title: 'Clemente Assessoria | Financiamento Imobiliário e Despachante',
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <BankLogos />
      <ServicesOverview />
      <StatsSection />
      <HowItWorks />
      <GoogleReviews />
      <CTABanner />
    </>
  )
}
