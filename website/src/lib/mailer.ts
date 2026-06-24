import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendContactEmail(data: {
  name: string
  email: string
  phone: string
  subject: string
  message: string
}) {
  await transporter.sendMail({
    from: `"Clemente Assessoria" <${process.env.EMAIL_FROM}>`,
    to: process.env.EMAIL_TO,
    subject: `Novo contato: ${data.subject}`,
    html: `
      <h2>Novo contato pelo site</h2>
      <p><strong>Nome:</strong> ${data.name}</p>
      <p><strong>E-mail:</strong> ${data.email}</p>
      <p><strong>Telefone:</strong> ${data.phone}</p>
      <p><strong>Assunto:</strong> ${data.subject}</p>
      <p><strong>Mensagem:</strong></p>
      <p>${data.message.replace(/\n/g, '<br>')}</p>
    `,
  })
}

export async function sendSimulationEmail(data: {
  name: string
  email: string
  phone: string
  city: string
  propertyValue: number
  downPayment: number
  income: number
  term: number
  hasFgts: boolean
  firstProperty: boolean
  bank: string
  estimatedInstallment: number
  financedValue: number
  downPaymentPercent: number
  program: string
}) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  await transporter.sendMail({
    from: `"Clemente Assessoria" <${process.env.EMAIL_FROM}>`,
    to: process.env.EMAIL_TO,
    subject: `Nova simulação de financiamento — ${data.name}`,
    html: `
      <h2>Nova simulação recebida</h2>
      <h3>Dados do Lead</h3>
      <p><strong>Nome:</strong> ${data.name}</p>
      <p><strong>E-mail:</strong> ${data.email}</p>
      <p><strong>Telefone:</strong> ${data.phone}</p>
      <p><strong>Cidade/UF:</strong> ${data.city}</p>
      <h3>Dados da Simulação</h3>
      <p><strong>Valor do imóvel:</strong> ${fmt(data.propertyValue)}</p>
      <p><strong>Valor de entrada:</strong> ${fmt(data.downPayment)} (${data.downPaymentPercent.toFixed(1)}%)</p>
      <p><strong>Renda familiar bruta:</strong> ${fmt(data.income)}</p>
      <p><strong>Prazo desejado:</strong> ${data.term} meses</p>
      <p><strong>Possui FGTS:</strong> ${data.hasFgts ? 'Sim' : 'Não'}</p>
      <p><strong>Primeiro imóvel:</strong> ${data.firstProperty ? 'Sim' : 'Não'}</p>
      <p><strong>Banco de interesse:</strong> ${data.bank}</p>
      <h3>Resultado da Simulação</h3>
      <p><strong>Valor financiado estimado:</strong> ${fmt(data.financedValue)}</p>
      <p><strong>Parcela aproximada:</strong> ${fmt(data.estimatedInstallment)}/mês</p>
      <p><strong>Programa sugerido:</strong> ${data.program}</p>
    `,
  })
}
