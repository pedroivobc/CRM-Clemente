import { NextResponse } from 'next/server'
import { runSimulation } from '@/lib/simulation'
import { createServiceClient } from '@/lib/supabase'
import { sendSimulationEmail } from '@/lib/mailer'

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const data = {
      name: body.name,
      phone: body.phone,
      email: body.email,
      city: body.city,
      propertyValue: Number(body.propertyValue),
      downPayment: Number(body.downPayment),
      income: Number(body.income),
      term: Number(body.term),
      hasFgts: body.hasFgts === 'sim',
      firstProperty: body.firstProperty === 'sim',
      bank: body.bank,
    }

    const result = runSimulation(data)

    // Save lead to Supabase
    try {
      const supabase = createServiceClient()
      await supabase.from('simulation_leads').insert({
        name: data.name,
        phone: data.phone,
        email: data.email,
        city: data.city,
        property_value: data.propertyValue,
        down_payment: data.downPayment,
        income: data.income,
        term: data.term,
        has_fgts: data.hasFgts,
        first_property: data.firstProperty,
        bank: data.bank,
        financed_value: result.financedValue,
        estimated_installment: result.estimatedInstallment,
        program: result.program,
      })
    } catch (dbErr) {
      console.error('Supabase error:', dbErr)
    }

    // Send email notification
    try {
      await sendSimulationEmail({
        ...data,
        ...result,
      })
    } catch (mailErr) {
      console.error('Mail error:', mailErr)
    }

    return NextResponse.json({ result })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
