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

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);

interface PageData {
  mensal: { mes: string; count: number; volume: number; ticketMedio: number }[];
  faixas: { faixa: string; count: number }[];
  tipologia: { tipologia: string; count: number; volume: number; ticketMedio: number }[];
}

export default function MercadoPage() {
  const [data, setData] = useState<PageData | null>(null);

  useEffect(() => {
    fetch("/api/itbi")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data)
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        Carregando…
      </div>
    );

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mercado ITBI</h1>
        <p className="text-sm text-gray-500 mt-1">
          Análise temporal das transações registradas em Juiz de Fora/MG
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Nº de Transações por Mês</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.mensal}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="Transações" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Ticket Médio por Mês</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.mensal}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Line
                type="monotone"
                dataKey="ticketMedio"
                name="Ticket Médio"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Distribuição por Faixa de Valor</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.faixas}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="faixa" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="Transações" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Ticket Médio por Tipologia</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Tipologia</th>
                  <th className="pb-2 font-medium text-right">Transações</th>
                  <th className="pb-2 font-medium text-right">Volume</th>
                  <th className="pb-2 font-medium text-right">Ticket Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.tipologia.map((t) => (
                  <tr key={t.tipologia}>
                    <td className="py-2.5 text-gray-700">{t.tipologia}</td>
                    <td className="py-2.5 text-right text-gray-600">
                      {t.count.toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2.5 text-right text-gray-600">{fmt(t.volume)}</td>
                    <td className="py-2.5 text-right font-semibold text-gray-800">
                      {fmt(t.ticketMedio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
