import { SimulationFormData, SimulationResult } from '@/types'

// SAC-simplified approximation using Price table (constant installment)
function calcInstallmentPrice(pv: number, rate: number, n: number): number {
  if (rate === 0) return pv / n
  return (pv * rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1)
}

export function runSimulation(data: SimulationFormData): SimulationResult {
  const financedValue = data.propertyValue - data.downPayment
  const downPaymentPercent = (data.downPayment / data.propertyValue) * 100

  // Determine program
  let program: SimulationResult['program'] = 'SBPE'
  let annualRate = 0.1199 // 11.99% a.a. default SBPE
  let programLabel = 'SBPE'

  const incomeMCMV = data.income <= 8000
  const valueMCMV = data.propertyValue <= 350000

  if (incomeMCMV && valueMCMV && data.firstProperty) {
    program = 'MCMV'
    // MCMV rates vary by income bracket
    if (data.income <= 2640) annualRate = 0.04
    else if (data.income <= 4400) annualRate = 0.05
    else if (data.income <= 8000) annualRate = 0.0699
    programLabel = 'Minha Casa Minha Vida (MCMV)'
  } else {
    programLabel = 'SBPE / Crédito Imobiliário'
  }

  const monthlyRate = annualRate / 12
  const estimatedInstallment = calcInstallmentPrice(financedValue, monthlyRate, data.term)

  return {
    financedValue,
    estimatedInstallment,
    downPaymentPercent,
    program,
    programLabel,
  }
}
