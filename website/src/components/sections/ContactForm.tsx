'use client'

import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const schema = z.object({
  name: z.string().min(3, 'Informe seu nome'),
  email: z.string().email('E-mail inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
  subject: z.string().min(1, 'Selecione um assunto'),
  message: z.string().min(10, 'Mensagem muito curta'),
})

type FormData = z.infer<typeof schema>

const subjects = [
  'Simulação de financiamento',
  'Correspondente bancário',
  'Despachante imobiliário',
  'Assessoria imobiliária',
  'Outros',
]

export default function ContactForm() {
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, setValue, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSuccess(true)
      reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar mensagem')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-4 rounded-full mb-4" style={{ background: 'rgba(179,149,51,0.12)' }}>
          <CheckCircle2 className="h-10 w-10" style={{ color: '#B39533' }} />
        </div>
        <h3 className="text-xl font-semibold mb-2" style={{ color: '#1A1612', fontFamily: 'Georgia, serif' }}>Mensagem enviada!</h3>
        <p className="text-sm max-w-sm" style={{ color: '#7A7068' }}>
          Recebemos seu contato e nossa equipe retornará em breve. Obrigado!
        </p>
        <Button variant="outline" className="mt-6" onClick={() => setSuccess(false)}>
          Enviar outra mensagem
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome completo *</Label>
          <Input id="name" placeholder="Seu nome" {...register('name')} />
          {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Telefone *</Label>
          <Input id="phone" placeholder="(11) 99999-9999" {...register('phone')} />
          {errors.phone && <p className="text-red-500 text-xs">{errors.phone.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail *</Label>
        <Input id="email" type="email" placeholder="seu@email.com" {...register('email')} />
        {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Assunto *</Label>
        <Select onValueChange={(v: string | null) => setValue('subject', v ?? '')}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o assunto" />
          </SelectTrigger>
          <SelectContent>
            {subjects.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.subject && <p className="text-red-500 text-xs">{errors.subject.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="message">Mensagem *</Label>
        <Textarea
          id="message"
          placeholder="Como podemos te ajudar?"
          rows={5}
          {...register('message')}
        />
        {errors.message && <p className="text-red-500 text-xs">{errors.message.message}</p>}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Button type="submit" disabled={loading} size="lg" className="w-full text-white font-semibold"
        style={{ background: '#B39533', borderColor: '#B39533' } as React.CSSProperties}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</> : 'Enviar mensagem'}
      </Button>
    </form>
  )
}
