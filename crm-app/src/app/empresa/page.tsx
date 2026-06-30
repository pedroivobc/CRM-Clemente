"use client";

import { Building2, Plus, FileText, TrendingUp, Users } from "lucide-react";

const placeholders = [
  {
    title: "Meus Imóveis em Carteira",
    description: "Cadastre os imóveis captados pela Clemente Assessoria e acompanhe o status de cada um.",
    icon: Building2,
    color: "blue",
  },
  {
    title: "Transações da Empresa",
    description: "Registre as vendas realizadas e compare o seu desempenho com o mercado ITBI.",
    icon: TrendingUp,
    color: "green",
  },
  {
    title: "Clientes",
    description: "Gerencie compradores e vendedores, histórico de contato e preferências.",
    icon: Users,
    color: "purple",
  },
  {
    title: "Relatórios",
    description: "Gere relatórios de performance da carteira e comparativos com o mercado.",
    icon: FileText,
    color: "orange",
  },
];

const colors: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  purple: "bg-purple-50 text-purple-600",
  orange: "bg-orange-50 text-orange-600",
};

export default function EmpresaPage() {
  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Minha Empresa</h1>
        <p className="text-sm text-gray-500 mt-1">
          Área reservada para os dados da Clemente Assessoria Imobiliária
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Plus size={20} className="text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-blue-800">Em construção</p>
            <p className="text-sm text-blue-700 mt-1">
              Esta seção será preenchida com os dados reais da Clemente Assessoria ao longo da semana.
              Os módulos abaixo representam as funcionalidades planejadas.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {placeholders.map(({ title, description, icon: Icon, color }) => (
          <div
            key={title}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 opacity-75 cursor-not-allowed"
          >
            <div className={`rounded-lg p-3 w-fit ${colors[color]} mb-4`}>
              <Icon size={22} />
            </div>
            <h3 className="font-semibold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-500 mt-1.5">{description}</p>
            <div className="mt-4">
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                Em breve
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Dados que serão integrados</h2>
        <div className="space-y-3 text-sm text-gray-600">
          {[
            "Captações próprias — imóveis com endereço, tipologia, valor pedido e data de captação",
            "Transações fechadas — comparação com o ticket médio do mercado ITBI por bairro",
            "Funil de vendas — leads, visitas agendadas, propostas e fechamentos",
            "Metas mensais vs. realizado — volume e nº de transações",
            "Análise de preço pedido vs. preço de mercado por bairro e tipologia",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
