import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendContactEmail } from '@/lib/mailer'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, email, phone, subject, message } = body

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })
    }

    // Save to Supabase
    try {
      const supabase = createServiceClient()
      await supabase.from('contact_leads').insert({ name, email, phone, subject, message })
    } catch (dbErr) {
      console.error('Supabase error:', dbErr)
    }

    // Send email
    await sendContactEmail({ name, email, phone, subject, message })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
