import {
  Building2,
  ChevronDown,
  ClipboardCheck,
  Handshake,
  KanbanSquare,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  ScrollText,
  Trophy,
  Settings,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { useBrandedPwa } from "@/lib/useBrandedPwa";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: [string, string];
  module?: string;
};

type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "Operação",
    items: [
      { to: "/", label: "Painel", icon: LayoutDashboard },
      { to: "/clientes", label: "Clientes", icon: Users, permission: ["clientes", "view"] },
      { to: "/imoveis", label: "Imóveis", icon: Building2, permission: ["imoveis", "view"] },
      {
        to: "/chaves",
        label: "Chaves",
        icon: KeyRound,
        module: "module_rentals",
        permission: ["chaves", "view"],
      },
      {
        to: "/vistorias",
        label: "Vistorias",
        icon: ClipboardCheck,
        module: "module_rentals",
        permission: ["vistorias", "view"],
      },
      {
        to: "/chamados",
        label: "Manutenção",
        icon: Wrench,
        module: "module_rentals",
        permission: ["manutencao", "view"],
      },
    ],
  },
  {
    label: "Locação",
    items: [
      {
        to: "/funil",
        label: "Funil",
        icon: KanbanSquare,
        module: "module_rentals",
        permission: ["locacao", "view"],
      },
      {
        to: "/contratos",
        label: "Contratos",
        icon: ScrollText,
        module: "module_rentals",
        permission: ["locacao", "view"],
      },
      {
        to: "/cobrancas",
        label: "Cobranças",
        icon: Receipt,
        module: "module_rentals",
        permission: ["financeiro", "view"],
      },
    ],
  },
  {
    label: "Vendas",
    items: [
      {
        to: "/vendas/funil",
        label: "Funil",
        icon: KanbanSquare,
        module: "module_sales",
        permission: ["vendas", "view"],
      },
      {
        to: "/vendas/propostas",
        label: "Propostas",
        icon: Handshake,
        module: "module_sales",
        permission: ["vendas", "view"],
      },
      {
        to: "/vendas/negocios",
        label: "Negócios",
        icon: Trophy,
        module: "module_sales",
        permission: ["vendas", "view"],
      },
    ],
  },
  {
    label: "Gestão",
    items: [
      { to: "/financeiro", label: "Financeiro", icon: Wallet, permission: ["financeiro", "view"] },
      {
        to: "/configuracoes",
        label: "Configurações",
        icon: Settings,
        permission: ["configuracoes", "view"],
      },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, tenant, signOut, can, hasModule } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => setMobileOpen(false), [location.pathname]);
  useBrandedPwa(tenant?.branding.color_primary, tenant?.branding.display_name);

  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (!item.permission || can(item.permission[0], item.permission[1])) &&
        (!item.module || hasModule(item.module)),
    ),
  })).filter((group) => group.items.length > 0);

  const displayName = tenant?.branding.display_name ?? me?.tenant_name ?? "Imobiliária";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[236px_1fr]">
      {/* Rail lateral */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col border-r border-line bg-surface transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
          <span
            className="grid size-7 shrink-0 place-items-center rounded font-display text-[13px] font-bold"
            style={{ background: "var(--brand-primary)", color: "var(--brand-contrast)" }}
            aria-hidden
          >
            {displayName.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate font-display text-[14px] font-semibold text-ink">
            {displayName}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1.5 px-2 font-mono text-[10px] tracking-widest text-muted uppercase">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={to === "/"}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] transition-colors",
                          isActive
                            ? "bg-[color-mix(in_srgb,var(--brand-primary)_10%,white)] font-medium text-[var(--brand-primary)]"
                            : "text-ink-soft hover:bg-sunken hover:text-ink",
                        )
                      }
                    >
                      <Icon className="size-4 shrink-0" />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-sunken">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sunken font-mono text-[11px] font-medium text-ink-soft">
                {initials(me?.full_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">
                  {me?.full_name}
                </span>
                <span className="block truncate text-[11px] text-muted">
                  {me?.roles.join(" · ") || "Sem papel"}
                </span>
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-1 px-2 pb-1">
              <p className="truncate py-1 text-[11px] text-muted">{me?.email}</p>
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
                <LogOut />
                Sair
              </Button>
            </div>
          </details>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-ink/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen((v) => !v)}>
            {mobileOpen ? <X /> : <Menu />}
            <span className="sr-only">Menu</span>
          </Button>
          <span className="font-display text-[14px] font-semibold">{displayName}</span>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
        <InstallPrompt />
      </div>
    </div>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Prompt discreto de instalação. Chrome/Edge no Android disparam
 * `beforeinstallprompt`; iOS/Safari não, mas o navegador tem "Adicionar à
 * tela de início" no menu — o botão fica escondido lá. Ignora se o usuário
 * já dispensou nesta sessão.
 */
function InstallPrompt() {
  const [event, setEvent] = React.useState<InstallEvent | null>(null);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("pwa-dismissed") === "1") return;
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!event) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-xl border border-line bg-surface p-3 shadow-lg lg:right-6 lg:left-auto lg:mx-0">
      <p className="text-[13px] text-ink">
        Instale o painel na tela de início para abrir mais rápido.
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button
          className="px-2 py-1 text-[12.5px] text-muted"
          onClick={() => {
            sessionStorage.setItem("pwa-dismissed", "1");
            setEvent(null);
          }}
        >
          Agora não
        </button>
        <button
          className="rounded bg-[var(--brand-primary)] px-3 py-1 text-[12.5px] font-medium text-white"
          onClick={async () => {
            await event.prompt();
            setEvent(null);
          }}
        >
          Instalar
        </button>
      </div>
    </div>
  );
}

function initials(name: string | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}
