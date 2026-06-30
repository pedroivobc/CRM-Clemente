"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { Search } from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);

interface BairroDetail {
  bairro: string;
  count: number;
  volume: number;
  ticketMedio: number;
  mensal: { mes: string; count: number; volume: number; ticketMedio: number }[];
  faixas: { faixa: string; count: number }[];
  transacoes: {
    data: string;
    valor: number;
    natureza: string;
    tipologia_proxy: string;
    endereco: string;
    complemento: string;
  }[];
}

interface ListData {
  bairros: { bairro: string; count: number; volume: number; ticketMedio: number }[];
}

export default function BairrosPage() {
  const [list, setList] = useState<ListData | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [detail, setDetail] = useState<BairroDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/itbi")
      .then((r) => r.json())
      .then(setList);
  }, []);

  const handleSelect = (bairro: string) => {
    setSelected(bairro);
    setLoadingDetail(true);
    fetch(`/api/itbi/bairro?bairro=${encodeURIComponent(bairro)}`)
      .then((r) => r.json())
      .then((d) => {
        setDetail(d);
        setLoadingDetail(false);
      });
  };

  const filtered = (list?.bairros ?? []).filter((b) =>
    b.bairro.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Análise por Bairro</h1>
        <p className="text-sm text-gray-500 mt-1">
          Selecione um bairro para ver o detalhamento completo
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de bairros */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 h-fit">
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar bairro…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1 max-h-[520px] overflow-y-auto">
            {filtered.map((b) => (
              <button
                key={b.bairro}
                onClick={() => handleSelect(b.bairro)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selected === b.bairro
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="truncate pr-2">{b.bairro}</span>
                  <span className="text-xs text-gray-400 shrink-0">{b.count}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detalhe */}
        <div className="lg:col-span-2 space-y-5">
          {!selected && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
              Selecione um bairro na lista para ver os dados
            </div>
          )}
          {loadingDetail && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
              Carregando…
            </div>
          )}
          {detail && !loadingDetail && (
            <>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Transações", value: detail.count.toLocaleString("pt-BR") },
                  { label: "Volume Total", value: fmt(detail.volume) },
                  { label: "Ticket Médio", value: fmt(detail.ticketMedio) },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
                  >
                    <p className="text-xs text-gray-500">{k.label}</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-semibold text-gray-800 mb-3">Transações por Mês</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={detail.mensal}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" name="Transações" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-semibold text-gray-800 mb-3">Distribuição por Faixa de Valor</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={detail.faixas}>
                    <XAxis dataKey="faixa" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Transações" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-semibold text-gray-800 mb-3">
                  Últimas Transações ({detail.transacoes.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="pb-2 font-medium">Data</th>
                        <th className="pb-2 font-medium">Endereço</th>
                        <th className="pb-2 font-medium">Tipo</th>
                        <th className="pb-2 font-medium text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {detail.transacoes.map((t, i) => (
                        <tr key={i}>
                          <td className="py-2 text-gray-500 whitespace-nowrap">
                            {new Date(t.data).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="py-2 text-gray-700 truncate max-w-[200px]">
                            {[t.endereco, t.complemento].filter(Boolean).join(", ") || "—"}
                          </td>
                          <td className="py-2 text-gray-500 capitalize">{t.tipologia_proxy}</td>
                          <td className="py-2 text-right font-semibold text-gray-800">
                            {fmt(t.valor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
