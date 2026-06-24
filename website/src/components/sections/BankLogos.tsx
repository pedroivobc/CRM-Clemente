import Image from 'next/image'

const banks = [
  { name: 'Caixa Econômica Federal', src: '/banks/caixa.svg', width: 120, height: 40 },
  { name: 'Itaú', src: '/banks/itau.svg', width: 52, height: 52 },
  { name: 'Inter', src: '/banks/inter.svg', width: 100, height: 40 },
  { name: 'Santander', src: '/banks/santander.svg', width: 160, height: 40 },
  { name: 'Bradesco', src: '/banks/bradesco.svg', width: 150, height: 50 },
]

export default function BankLogos() {
  return (
    <section className="py-14 border-y" style={{ background: '#FFFFFF', borderColor: '#E8E3DC' }}>
      <div className="container mx-auto px-4 lg:px-8">
        <p className="text-center text-xs font-semibold tracking-widest mb-10 uppercase"
          style={{ color: '#9B9490' }}>
          Bancos parceiros com os quais operamos
        </p>
        <div className="flex flex-wrap items-center justify-center gap-10 lg:gap-16">
          {banks.map((bank) => (
            <div key={bank.name} className="flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity">
              <Image
                src={bank.src}
                alt={bank.name}
                width={bank.width}
                height={bank.height}
                className="object-contain"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
