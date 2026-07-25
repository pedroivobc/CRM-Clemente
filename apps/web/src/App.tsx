import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { Login } from "@/auth/Login";
import { AppShell } from "@/components/AppShell";
import { Card, ErrorNote, Spinner } from "@/components/ui";
import { ClienteDetalhe } from "@/pages/ClienteDetalhe";
import { Clientes } from "@/pages/Clientes";
import { Cobrancas } from "@/pages/Cobrancas";
import { ContratoDetalhe, Contratos } from "@/pages/Contratos";
import { Configuracoes } from "@/pages/Configuracoes";
import { Dashboard } from "@/pages/Dashboard";
import { Imoveis } from "@/pages/Imoveis";
import { ImovelDetalhe } from "@/pages/ImovelDetalhe";
import { Financeiro } from "@/pages/Financeiro";
import { Funil } from "@/pages/Funil";
import { Negocios } from "@/pages/vendas/Negocios";
import { FunilVendas } from "@/pages/vendas/FunilVendas";
import { Propostas } from "@/pages/vendas/Propostas";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function Gate() {
  const { session, me, loading, error } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!session) return <Login />;

  // Autenticado no Supabase, mas sem vínculo com uma imobiliária ativa.
  if (!me) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <Card className="max-w-md p-6">
          <h1 className="font-display text-lg font-semibold text-ink">Acesso não liberado</h1>
          <p className="mt-1 mb-4 text-[13px] text-muted">
            Este e-mail ainda não está vinculado a nenhuma imobiliária. Peça ao administrador para
            cadastrá-lo como colaborador.
          </p>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </Card>
      </div>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/clientes/:id" element={<ClienteDetalhe />} />
        <Route path="/imoveis" element={<Imoveis />} />
        <Route path="/imoveis/:id" element={<ImovelDetalhe />} />
        <Route path="/financeiro" element={<Financeiro />} />
        <Route path="/funil" element={<ModuleRoute module="module_rentals" element={<Funil />} />} />
        <Route
          path="/contratos"
          element={<ModuleRoute module="module_rentals" element={<Contratos />} />}
        />
        <Route
          path="/contratos/:id"
          element={<ModuleRoute module="module_rentals" element={<ContratoDetalhe />} />}
        />
        <Route
          path="/cobrancas"
          element={<ModuleRoute module="module_rentals" element={<Cobrancas />} />}
        />
        <Route
          path="/vendas/funil"
          element={<ModuleRoute module="module_sales" element={<FunilVendas />} />}
        />
        <Route
          path="/vendas/propostas"
          element={<ModuleRoute module="module_sales" element={<Propostas />} />}
        />
        <Route
          path="/vendas/negocios"
          element={<ModuleRoute module="module_sales" element={<Negocios />} />}
        />
        <Route path="/vendas" element={<Navigate to="/vendas/funil" replace />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function ModuleRoute({ module, element }: { module: string; element: React.ReactNode }) {
  const { hasModule } = useAuth();
  return hasModule(module) ? <>{element}</> : <Navigate to="/" replace />;
}
