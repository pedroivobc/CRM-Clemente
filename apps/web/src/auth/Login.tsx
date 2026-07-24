import * as React from "react";

import { useAuth } from "@/auth/AuthProvider";
import { Button, ErrorNote, Field, Input } from "@/components/ui";

export function Login() {
  const { signIn, tenant } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setSubmitting(false);
    }
  }

  const name = tenant?.branding.display_name ?? "Gestão Imobiliária";

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_460px]">
      {/* Painel de marca: a cor do tenant ocupa a lateral inteira. */}
      <aside
        className="relative hidden flex-col justify-between p-10 lg:flex"
        style={{
          background: `linear-gradient(155deg, var(--brand-primary), var(--brand-secondary))`,
          color: "var(--brand-contrast)",
        }}
      >
        <div className="flex items-center gap-3">
          {tenant?.branding.logo_url ? (
            <img src={tenant.branding.logo_url} alt={name} className="max-h-10 w-auto" />
          ) : (
            <span className="font-display text-lg font-semibold">{name}</span>
          )}
        </div>

        <div>
          <p className="font-mono text-[11px] tracking-widest uppercase opacity-70">
            Locação · Vendas
          </p>
          <p className="mt-3 max-w-md font-display text-3xl leading-tight font-semibold">
            A carteira inteira em um lugar só: imóveis, contratos, repasses e chamados.
          </p>
        </div>

        <p className="font-mono text-[11px] opacity-70">
          {tenant ? `${tenant.subdomain}.sistema.com.br` : "sistema.com.br"}
        </p>
      </aside>

      <main className="flex items-center justify-center bg-surface px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            {tenant?.branding.logo_url ? (
              <img src={tenant.branding.logo_url} alt={name} className="mb-4 max-h-10 w-auto" />
            ) : null}
          </div>

          <h1 className="font-display text-2xl font-semibold text-ink">Entrar</h1>
          <p className="mt-1 text-[13px] text-muted">Acesse com seu e-mail de colaborador.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <Field label="E-mail" required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
                placeholder="voce@imobiliaria.com.br"
              />
            </Field>

            <Field label="Senha" required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <Button type="submit" className="w-full" loading={submitting} size="lg">
              Entrar
            </Button>
          </form>

          <p className="mt-6 text-[12px] text-muted">
            Esqueceu a senha? Fale com o administrador da sua imobiliária.
          </p>
        </div>
      </main>
    </div>
  );
}
