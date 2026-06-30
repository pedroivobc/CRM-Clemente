"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);

const COLORS = ["#3b82f6", "#10b981", "#f59e0b"];

interface PageData {
  tipologia: { tipologia: string; count: number; volume: number; ticketMedio: number }[];
  faixas: { faixa: string; count: number }[];
  mensal: { mes: string; count: number; volume: number }[];
}

export default function TipologiaPage() {
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
        <h1 className="text-2xl font-bold text-gray-900">Análise por Tipologia</h1>
        <p className="text-sm text-gray-500 mt-1">
          Comparativo entre apartamentos, casas e terrenos/outros
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {data.tipologia.map((t, i) => (
          <div
            key={t.tipologia}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
          >
            <div
              className="w-2 h-8 rounded mb-3"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <p className="text-sm text-gray-500 font-medium">{t.tipologia}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {t.count.toLocaleString("pt-BR")}
            </p>
            <p className="text-sm text-gray-400 mt-0.5">transações</p>
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Volume</span>
                <span className="font-medium text-gray-800">{fmt(t.volume)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Ticket médio</span>
                <span className="font-medium text-gray-800">{fmt(t.ticketMedio)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Volume por Tipologia</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data.tipologia}
                dataKey="volume"
                nameKey="tipologia"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) =>
                  `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={true}
              >
                {data.tipologia.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmt(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Ticket Médio por Tipologia</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.tipologia}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="tipologia" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Bar dataKey="ticketMedio" name="Ticket Médio">
                {data.tipologia.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Distribuição por Faixa de Valor</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.faixas}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="faixa" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" name="Transações" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
