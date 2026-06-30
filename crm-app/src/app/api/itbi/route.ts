import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import Papa from "papaparse";
import type { ItbiTransacao } from "@/types/itbi";
import {
  computeKpis,
  computeBairros,
  computeMensal,
  computeTipologia,
  computeFaixas,
} from "@/lib/processItbi";

let cached: ReturnType<typeof buildResponse> | null = null;

function buildResponse(data: ItbiTransacao[]) {
  return {
    kpis: computeKpis(data),
    bairros: computeBairros(data, 20),
    mensal: computeMensal(data),
    tipologia: computeTipologia(data),
    faixas: computeFaixas(data),
    anos: [...new Set(data.map((t) => t.ano))].sort(),
    bairrosList: [
      ...new Set(data.filter((t) => t.bairro).map((t) => t.bairro)),
    ].sort(),
  };
}

export async function GET() {
  if (cached) return NextResponse.json(cached);

  const csvPath = path.join(process.cwd(), "public", "itbi_transacoes.csv");
  const raw = await fs.readFile(csvPath, "utf-8");

  const { data } = Papa.parse<ItbiTransacao>(raw, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  cached = buildResponse(data);
  return NextResponse.json(cached);
}
