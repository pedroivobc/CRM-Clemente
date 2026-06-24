'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, CheckCircle2, Loader2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnchorButton } from '@/components/ui/link-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SimulationResult } from '@/types'

const schema = z.object({
  name: z.string().min(3, 'Informe seu nome completo'),
  phone: z.string().min(10, 'Telefone inválido'),
  email: z.string().email('E-mail inválido'),
  city: z.string().min(2, 'Informe sua cidade e UF'),
  propertyValue: z.number().min(50000, 'Valor mínimo R$ 50.000'),
  downPayment: z.number().min(1, 'Informe o valor de entrada'),
  income: z.number().min(1000, 'Renda mínima R$ 1.000'),
  term: z.number().min(12).max(420),
  hasFgts: z.enum(['sim', 'nao']),
  firstProperty: z.enum(['sim', 'nao']),
  bank: z.string().min(1, 'Selecione um banco'),
}).refine(d => d.downPayment < d.propertyValue, {
  message: 'A entrada deve ser menor que o valor do imóvel',
  path: ['downPayment'],
}).refine(d => d.downPayment / d.propertyValue >= 0.10, {
  message: 'A entrada mínima é 10% do valor do imóvel',
  path: ['downPayment'],
})

type FormData = z.infer<typeof schema>

const banks = [
  'Caixa Econômica Federal',
  'Bradesco',
  'Itaú',
  'Santander',
  'Banco do Brasil',
  'Sem preferência',
]

const terms = [60, 120, 180, 240, 300, 360, 420]

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function CurrencyInput({
  value,
  onChange,
  id,
  placeholder,
}: {
  value: number
  onChange: (v: number) => void
  id?: string
  placeholder?: string
}) {
  const display = value ? (value / 1).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '')
    onChange(Number(raw) / 100)
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">R$</span>
      <Input
        id={id}
        className="pl-9"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        inputMode="numeric"
      />
    </div>
  )
}

export default function SimulatorForm() {
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [formSnapshot, setFormSnapshot] = useState<FormData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      propertyValue: 0,
      downPayment: 0,
      income: 0,
      term: 360,
      bank: '',
      hasFgts: 'nao',
      firstProperty: 'nao',
    },
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao processar simulação')
      setResult(json.result as SimulationResult)
      setFormSnapshot(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  function buildWhatsAppMessage() {
    if (!result || !formSnapshot) return ''
    const msg = `Olá! Fiz uma simulação no site e gostaria de continuar.

*Dados da Simulação:*
• Nome: ${formSnapshot.name}
• Cidade: ${formSnapshot.city}
• Valor do imóvel: ${formatBRL(formSnapshot.propertyValue)}
• Entrada: ${formatBRL(formSnapshot.downPayment)} (${result.downPaymentPercent.toFixed(1)}%)
• Prazo: ${formSnapshot.term} meses
• Renda: ${formatBRL(formSnapshot.income)}
• Banco: ${formSnapshot.bank}

*Resultado estimado:*
• Valor financiado: ${formatBRL(result.financedValue)}
• Parcela aproximada: ${formatBRL(result.estimatedInstallment)}/mês
• Programa: ${result.programLabel}`
    return encodeURIComponent(msg)
  }

  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '5511999999999'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
      {/* Form */}
      <Card className="lg:col-span-3 bg-white" style={{ outline: '1px solid #E8E3DC' }}>
        <CardContent className="p-6 lg:p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome completo *</Label>
                <Input id="name" placeholder="Seu nome" {...register('name')} />
                {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefone / WhatsApp *</Label>
                <Input id="phone" placeholder="(11) 99999-9999" {...register('phone')} />
                {errors.phone && <p className="text-red-500 text-xs">{errors.phone.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail *</Label>
                <Input id="email" type="email" placeholder="seu@email.com" {...register('email')} />
                {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">Cidade / UF *</Label>
                <Input id="city" placeholder="São Paulo, SP" {...register('city')} />
                {errors.city && <p className="text-red-500 text-xs">{errors.city.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="propertyValue">Valor do imóvel *</Label>
                <Controller
                  name="propertyValue"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput id="propertyValue" value={field.value} onChange={field.onChange} placeholder="300.000,00" />
                  )}
                />
                {errors.propertyValue && <p className="text-red-500 text-xs">{errors.propertyValue.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="downPayment">Valor de entrada *</Label>
                <Controller
                  name="downPayment"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput id="downPayment" value={field.value} onChange={field.onChange} placeholder="60.000,00" />
                  )}
                />
                {errors.downPayment && <p className="text-red-500 text-xs">{errors.downPayment.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="income">Renda familiar bruta *</Label>
                <Controller
                  name="income"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput id="income" value={field.value} onChange={field.onChange} placeholder="5.000,00" />
                  )}
                />
                {errors.income && <p className="text-red-500 text-xs">{errors.income.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="term">Prazo desejado *</Label>
                <Controller
                  name="term"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                      <SelectTrigger id="term">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {terms.map((t) => (
                          <SelectItem key={t} value={String(t)}>
                            {t} meses ({Math.round(t / 12)} anos)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Possui FGTS? *</Label>
                <Controller
                  name="hasFgts"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">Sim</SelectItem>
                        <SelectItem value="nao">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Primeiro imóvel? *</Label>
                <Controller
                  name="firstProperty"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">Sim</SelectItem>
                        <SelectItem value="nao">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Banco de interesse *</Label>
                <Controller
                  name="bank"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {banks.map((b) => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.bank && <p className="text-red-500 text-xs">{errors.bank.message}</p>}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              size="lg"
              className="w-full text-white font-semibold"
              style={{ background: '#B39533', borderColor: '#B39533' } as React.CSSProperties}
            >
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculando...</>
              ) : (
                'Simular Financiamento'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Result */}
      <div className="lg:col-span-2">
        {!result ? (
          <Card className="h-full" style={{ border: '2px dashed #E8E3DC', background: '#FAFAF8' }}>
            <CardContent className="flex flex-col items-center justify-center h-full py-16 text-center">
              <div className="p-4 rounded-full mb-4" style={{ background: '#F0EDE8' }}>
                <CheckCircle2 className="h-8 w-8" style={{ color: '#C9AA3E', opacity: 0.4 }} />
              </div>
              <p className="font-medium" style={{ color: '#5E5651' }}>Preencha o formulário</p>
              <p className="text-sm mt-1" style={{ color: '#9B9490' }}>O resultado aparecerá aqui</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card style={{ border: '1px solid #E8E3DC', background: '#FAFAF8' }}>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <CheckCircle2 className="h-5 w-5" style={{ color: '#B39533' }} />
                  <h3 className="font-semibold" style={{ color: '#1A1612' }}>Resultado da Simulação</h3>
                </div>

                <div className="space-y-0">
                  {[
                    { label: 'Valor financiado estimado', value: formatBRL(result.financedValue) },
                    { label: 'Parcela aproximada', value: `${formatBRL(result.estimatedInstallment)}/mês`, highlight: true },
                    { label: 'Percentual de entrada', value: `${result.downPaymentPercent.toFixed(1)}%` },
                  ].map(({ label, value, highlight }) => (
                    <div key={label} className="flex justify-between items-center py-3" style={{ borderBottom: '1px solid #E8E3DC' }}>
                      <span className="text-sm" style={{ color: '#7A7068' }}>{label}</span>
                      <span className={`font-semibold ${highlight ? 'text-lg' : ''}`}
                        style={{ color: highlight ? '#B39533' : '#1A1612' }}>{value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-3">
                    <span className="text-sm" style={{ color: '#7A7068' }}>Programa sugerido</span>
                    <Badge variant="secondary"
                      className={result.program === 'MCMV' ? '' : ''}
                      style={{ background: 'rgba(179,149,51,0.12)', color: '#8C7425', borderColor: 'transparent' }}>
                      {result.program}
                    </Badge>
                  </div>
                </div>

                <p className="text-xs mt-4 p-3 rounded" style={{ color: '#9B9490', background: '#F0EDE8' }}>
                  ⚠️ Simulação preliminar. Os valores reais dependem de análise bancária,
                  avaliação do imóvel e condições contratuais.
                </p>
              </CardContent>
            </Card>

            <AnchorButton
              href={`https://wa.me/${whatsapp}?text=${buildWhatsAppMessage()}`}
              target="_blank"
              rel="noopener noreferrer"
              size="lg"
              className="w-full text-white font-semibold justify-center"
              style={{ background: '#25D366', borderColor: '#25D366' } as React.CSSProperties}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Continuar pelo WhatsApp
            </AnchorButton>

            <p className="text-center text-xs" style={{ color: '#9B9490' }}>
              Um especialista analisará sua simulação e entrará em contato
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
