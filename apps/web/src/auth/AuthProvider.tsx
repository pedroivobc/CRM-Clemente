import type { Session } from "@supabase/supabase-js";
import * as React from "react";

import { applyBranding } from "@/lib/branding";
import { api, ApiError } from "@/lib/api";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import type { Me, TenantPublic } from "@/lib/types";

type AuthState = {
  session: Session | null;
  me: Me | null;
  tenant: TenantPublic | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  can: (module: string, action: string) => boolean;
  hasModule: (module: string) => boolean;
};

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [me, setMe] = React.useState<Me | null>(null);
  const [tenant, setTenant] = React.useState<TenantPublic | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // A identidade visual vem antes do login: quem abre o endereço da
  // imobiliária já vê a marca dela na tela de entrada.
  React.useEffect(() => {
    api
      .get<TenantPublic>("/session/tenant")
      .then((data) => {
        setTenant(data);
        applyBranding(data.branding);
      })
      .catch(() => setTenant(null));
  }, []);

  const loadMe = React.useCallback(async () => {
    try {
      setMe(await api.get<Me>("/session/me"));
      setError(null);
    } catch (err) {
      setMe(null);
      if (err instanceof ApiError && err.status === 403) {
        setError("Este acesso não está vinculado a nenhuma imobiliária.");
      }
    }
  }, []);

  React.useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      setError("Autenticação não configurada. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.");
      return;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await loadMe();
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next) {
        await loadMe();
      } else {
        setMe(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [loadMe]);

  const signIn = React.useCallback(
    async (email: string, password: string) => {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        throw new Error(
          signInError.message === "Invalid login credentials"
            ? "E-mail ou senha incorretos."
            : signInError.message,
        );
      }
      await loadMe();
    },
    [loadMe],
  );

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
    setMe(null);
  }, []);

  const value = React.useMemo<AuthState>(
    () => ({
      session,
      me,
      tenant,
      loading,
      error,
      signIn,
      signOut,
      refreshMe: loadMe,
      can: (module, action) =>
        Boolean(me && (me.roles.includes("Admin") || me.permissions.includes(`${module}:${action}`))),
      hasModule: (module) => Boolean(me?.modules.includes(module)),
    }),
    [session, me, tenant, loading, error, signIn, signOut, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return context;
}
