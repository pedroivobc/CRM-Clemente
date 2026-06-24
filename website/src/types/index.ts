export interface SimulationFormData {
  name: string
  phone: string
  email: string
  city: string
  propertyValue: number
  downPayment: number
  income: number
  term: number
  hasFgts: boolean
  firstProperty: boolean
  bank: string
}

export interface SimulationResult {
  financedValue: number
  estimatedInstallment: number
  downPaymentPercent: number
  program: 'MCMV' | 'SBPE' | 'INDEFINIDO'
  programLabel: string
}

export interface ContactFormData {
  name: string
  email: string
  phone: string
  subject: string
  message: string
}

export interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  cover_url: string
  author: string
  published_at: string
  tags: string[]
}
