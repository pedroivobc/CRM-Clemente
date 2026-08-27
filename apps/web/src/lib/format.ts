/** Formatação brasileira: moeda, datas, documentos e telefone. */

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

const DATETIME = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const MONTH = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

export function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return BRL.format(Number(value));
}

/** Datas do backend chegam como `YYYY-MM-DD`; evita o deslocamento de fuso. */
export function date(value: string | null | undefined): string {
  if (!value) return "—";
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return DATE.format(new Date(plain ? `${value}T12:00:00` : value));
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return DATETIME.format(new Date(value));
}

/** "Julho de 2026" — só a inicial em maiúscula, como se escreve em português. */
export function monthLabel(value: string): string {
  const label = MONTH.format(new Date(`${value.slice(0, 7)}-01T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function document(digits: string | null | undefined): string {
  if (!digits) return "—";
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return digits;
}

export function phone(value: string | null | undefined): string {
  if (!value) return "—";
  const d = value.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return value;
}

export function cep(value: string | null | undefined): string {
  if (!value) return "—";
  const d = value.replace(/\D/g, "");
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, "$1-$2") : value;
}

export function shortAddress(address: Record<string, string> | null | undefined): string {
  if (!address) return "—";
  const street = [address.logradouro, address.numero].filter(Boolean).join(", ");
  const city = [address.bairro, address.cidade].filter(Boolean).join(" · ");
  return [street, city].filter(Boolean).join(" — ") || "—";
}

/** "hoje", "em 3 dias", "há 12 dias" — para prazos e vencimentos. */
export function relativeDays(days: number): string {
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  return days > 0 ? `em ${days} dias` : `há ${Math.abs(days)} dias`;
}

/**
 * Dinheiro em campo de formulário.
 *
 * A interface é toda em português, então o usuário digita `1.480,50`; a API
 * espera `1480.50`. As duas funções abaixo fazem a ponte, e por isso o valor
 * guardado no estado do campo está **sempre** na forma brasileira.
 */
export function toDecimalInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value).replace(".", ",");
}

export function toDecimalString(value: string): string {
  const clean = value.trim().replace(/\s/g, "");
  if (!clean) return "";
  return clean.replace(/\./g, "").replace(",", ".");
}
