"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import { TrendingUp, DollarSign, MapPin, Home } from "lucide-react";
import KpiCard from "@/components/KpiCard";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

interface DashboardData {
  kpis: {
    totalTransacoes: number;
    volumeTotal: number;
    ticketMedio: number;
    totalBairros: number;
  };
  bairros: { bairro: string; count: number; volume: number; ticketMedio: number }[];
  mensal: { mes: string; count: number; volume: number; ticketMedio: number }[];
  tipologia: { tipologia: string; count: number; volume: number }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/itbi")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        Carregando dados do mercado…
      </div>
    );
  if (!data) return null;

  const { kpis, bairros, mensal, tipologia } = data;

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Mercado imobiliário — Juiz de Fora/MG · Dados ITBI públicos
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Transações de Mercado"
          value={kpis.totalTransacoes.toLocaleString("pt-BR")}
          sub="Somente is_mercado = true"
          icon={<TrendingUp size={20} />}
          color="blue"
        />
        <KpiCard
          title="Volume Total"
          value={fmt(kpis.volumeTotal)}
          sub="Soma de todos os valores"
          icon={<DollarSign size={20} />}
          color="green"
        />
        <KpiCard
          title="Ticket Médio"
          value={fmt(kpis.ticketMedio)}
          icon={<Home size={20} />}
          color="purple"
        />
        <KpiCard
          title="Bairros Ativos"
          value={kpis.totalBairros.toLocaleString("pt-BR")}
          sub="Com pelo menos 1 transação"
          icon={<MapPin size={20} />}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Volume Mensal (R$)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={mensal}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Line
                type="monotone"
                dataKey="volume"
                name="Volume"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Transações por Tipologia</h2>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie
                  data={tipologia}
                  dataKey="count"
                  nameKey="tipologia"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                >
                  {tipologia.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => Number(v).toLocaleString("pt-BR")} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 flex-1">
              {tipologia.map((t, i) => (
                <div key={t.tipologia} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-gray-600 flex-1">{t.tipologia}</span>
                  <span className="font-semibold text-gray-800">
                    {t.count.toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-4">
          Top 20 Bairros por Nº de Transações
        </h2>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={bairros} layout="vertical" margin={{ left: 165, right: 20 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey="bairro" type="category" tick={{ fontSize: 11 }} width={160} />
            <Tooltip />
            <Bar dataKey="count" name="Transações" fill="#3b82f6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
