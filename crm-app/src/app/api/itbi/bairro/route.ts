import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import Papa from "papaparse";
import type { ItbiTransacao } from "@/types/itbi";
import { computeMensal, computeFaixas } from "@/lib/processItbi";

let allData: ItbiTransacao[] | null = null;

async function getData(): Promise<ItbiTransacao[]> {
  if (allData) return allData;
  const csvPath = path.join(process.cwd(), "public", "itbi_transacoes.csv");
  const raw = await fs.readFile(csvPath, "utf-8");
  const { data } = Papa.parse<ItbiTransacao>(raw, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  allData = data;
  return data;
}

export async function GET(req: NextRequest) {
  const bairro = req.nextUrl.searchParams.get("bairro");
  if (!bairro) return NextResponse.json({ error: "Missing bairro" }, { status: 400 });

  const data = await getData();
  const filtered = data.filter((t) => t.bairro === bairro && t.is_mercado);

  const volume = filtered.reduce((s, t) => s + t.valor, 0);

  return NextResponse.json({
    bairro,
    count: filtered.length,
    volume,
    ticketMedio: filtered.length ? volume / filtered.length : 0,
    mensal: computeMensal(filtered),
    faixas: computeFaixas(filtered),
    transacoes: filtered
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
      .slice(0, 50),
  });
}
