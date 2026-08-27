import * as React from "react";
import { Link, useNavigate } from "react-router-dom";

import { supabase } from "@/lib/supabase";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

type Plan = "autonomo" | "imobiliaria";

type Form = {
  display_name: string;
  full_name: string;
  email: string;
  phone: string;
  password: string;
  subdomain: string;
  plan: Plan;
};

const INITIAL: Form = {
  display_name: "",
  full_name: "",
  email: "",
  phone: "",
  password: "",
  subdomain: "",
  plan: "imobiliaria",
};

type SubStatus = "idle" | "checking" | "ok" | "bad";

/**
 * Cadastro público em uma tela só — hesitação mata conversão. Sugestão
 * automática do subdomínio a partir do nome da imobiliária; verificação
 * em tempo real do que está livre.
 *
 * Ao concluir, cria auth user + tenant + admin no backend, faz login
 * no Supabase pelo mesmo email/senha e joga direto no painel.
 */
export function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = React.useState<Form>(INITIAL);
  const [subStatus, setSubStatus] = React.useState<SubStatus>("idle");
  const [subMessage, setSubMessage] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  // Sugestão do subdomínio a partir do nome, sem sobrescrever se o usuário
  // já digitou algo próprio.
  React.useEffect(() => {
    if (form.subdomain) return;
    const guess = slugify(form.display_name).slice(0, 30);
    if (guess) set("subdomain", guess);
  }, [form.display_name, form.subdomain]);

  // Debounce da verificação: 400ms depois de parar de digitar consulta a API.
  React.useEffect(() => {
    if (!form.subdomain || form.subdomain.length < 3) {
      setSubStatus("idle");
      setSubMessage(null);
      return;
    }
    setSubStatus("checking");
    const handle = window.setTimeout(async () => {
      try {
        const resp = await fetch(
          `${API_BASE}/public/signup/check-subdomain?subdomain=${encodeURIComponent(form.subdomain)}`,
        );
        const data = (await resp.json()) as { available: boolean; reason?: string };
        setSubStatus(data.available ? "ok" : "bad");
        setSubMessage(data.reason ?? null);
      } catch {
        setSubStatus("idle");
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [form.subdomain]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (subStatus === "bad") {
      setError("Escolha outro endereço para a vitrine.");
      return;
    }
    setSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/public/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.detail ?? "Não foi possível concluir o cadastro.");
      }
      // Já logamos por baixo dos panos — o corretor cai no painel novo em folha.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (signInError) throw new Error(signInError.message);
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const strong = form.password.length >= 8;
  const canSubmit =
    form.display_name.length >= 2 &&
    form.full_name.length >= 2 &&
    /.+@.+\..+/.test(form.email) &&
    strong &&
    subStatus === "ok" &&
    !submitting;

  return (
    <div className="min-h-dvh bg-[color:var(--sunken)]">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-display text-[16px] font-semibold text-ink">
            <span className="grid size-7 place-items-center rounded-md bg-ink text-white">C</span>
            Clemente
          </div>
          <Link to="/entrar" className="text-[13px] text-muted hover:text-ink">
            Já tenho conta →
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="mb-1 text-[12px] font-medium tracking-widest text-muted uppercase">
          Comece grátis
        </p>
        <h1 className="mb-2 font-display text-3xl font-semibold text-ink">
          Crie sua imobiliária em 2 minutos.
        </h1>
        <p className="mb-8 text-[14px] text-muted">
          14 dias grátis, sem cartão. Cancelamento em um clique.
        </p>

        <form
          onSubmit={submit}
          className="space-y-5 rounded-xl border border-line bg-surface p-6 shadow-sm"
        >
          <PlanPicker value={form.plan} onChange={(p) => set("plan", p)} />

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBlock label="Nome da imobiliária" hint="Aparece na vitrine e nos e-mails.">
              <TextInput
                required
                minLength={2}
                value={form.display_name}
                onChange={(e) => set("display_name", e.target.value)}
                placeholder="Aurora Imóveis"
              />
            </FieldBlock>
            <FieldBlock label="Seu nome" hint="Vai ser o Admin da conta.">
              <TextInput
                required
                minLength={2}
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="Fernanda Aurora"
              />
            </FieldBlock>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBlock label="E-mail">
              <TextInput
                required
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="voce@auroraimoveis.com.br"
              />
            </FieldBlock>
            <FieldBlock label="WhatsApp" hint="Opcional — pra te avisarmos de tudo.">
              <TextInput
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="(32) 99999-0000"
              />
            </FieldBlock>
          </div>

          <FieldBlock
            label="Senha"
            hint={strong ? "Forte o suficiente." : "Mínimo 8 caracteres."}
          >
            <TextInput
              required
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="Escolha uma senha"
            />
          </FieldBlock>

          <FieldBlock
            label="Endereço da vitrine"
            hint={subMessage ?? "Você pode trocar por um domínio próprio depois."}
          >
            <div className="flex items-stretch overflow-hidden rounded-md border border-line focus-within:border-[var(--brand-primary)]">
              <input
                className="min-w-0 flex-1 px-3 py-2 text-[14px] outline-none font-mono"
                value={form.subdomain}
                onChange={(e) =>
                  set("subdomain", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                placeholder="aurora"
                minLength={3}
                maxLength={40}
              />
              <span className="flex items-center bg-sunken px-3 text-[13px] text-muted font-mono">
                .imob.br
              </span>
              <span
                className={`grid w-10 place-items-center text-[13px] ${
                  subStatus === "ok"
                    ? "text-positive"
                    : subStatus === "bad"
                      ? "text-critical"
                      : "text-muted"
                }`}
              >
                {subStatus === "checking" ? "…" : subStatus === "ok" ? "✓" : subStatus === "bad" ? "✕" : ""}
              </span>
            </div>
          </FieldBlock>

          {error ? (
            <p className="rounded-md border border-critical/25 bg-critical-soft px-3 py-2 text-[13px] text-critical">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-md bg-ink px-4 py-3 text-[14px] font-medium text-white transition-opacity disabled:opacity-50"
          >
            {submitting ? "Criando sua imobiliária…" : "Criar minha imobiliária grátis"}
          </button>
          <p className="text-center text-[12px] text-muted">
            Ao criar, você concorda com nossos termos e política de privacidade.
          </p>
        </form>
      </div>
    </div>
  );
}

/* ── Componentes internos ────────────────────────────────────────────── */
function PlanPicker({ value, onChange }: { value: Plan; onChange: (p: Plan) => void }) {
  const options: { key: Plan; title: string; hint: string; price: string }[] = [
    {
      key: "autonomo",
      title: "Corretor autônomo",
      hint: "Sozinho ou com um parceiro. Só vendas.",
      price: "R$ 39/mês",
    },
    {
      key: "imobiliaria",
      title: "Imobiliária",
      hint: "Até 5 usuários. Vendas + locação.",
      price: "R$ 149/mês",
    },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`rounded-md border p-3 text-left transition-colors ${
            value === opt.key
              ? "border-[var(--brand-primary)] bg-[color-mix(in_srgb,var(--brand-primary)_5%,white)] shadow-sm"
              : "border-line bg-surface hover:border-ink-soft/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-medium text-ink">{opt.title}</span>
            <span className="text-[12px] font-mono text-muted">{opt.price}</span>
          </div>
          <p className="mt-1 text-[12px] text-muted">{opt.hint}</p>
        </button>
      ))}
    </div>
  );
}

function FieldBlock({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11.5px] text-muted">{hint}</span> : null}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-md border border-line bg-surface px-3 py-2 text-[14px] outline-none focus:border-[var(--brand-primary)]"
    />
  );
}

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
