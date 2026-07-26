import * as React from "react";
import { NavLink, Link } from "react-router-dom";

import { useSite } from "./App";

/** Cabeçalho, navegação e rodapé — comuns a todas as páginas. */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const { config } = useSite();
  const initial = config.display_name.charAt(0).toUpperCase();
  const wa = config.whatsapp
    ? `https://wa.me/${config.whatsapp.replace(/\D/g, "")}`
    : null;

  return (
    <>
      <header className="topbar">
        <div className="inner">
          <Link to="/" className="brand">
            {config.logo_url ? (
              <img src={config.logo_url} alt={config.display_name} style={{ height: 36 }} />
            ) : (
              <span className="brand-mark">{initial}</span>
            )}
            <span>{config.display_name}</span>
          </Link>
          <nav>
            <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
              Início
            </NavLink>
            <NavLink to="/imoveis" className={({ isActive }) => (isActive ? "active" : "")}>
              Imóveis
            </NavLink>
            <NavLink to="/contato" className={({ isActive }) => (isActive ? "active" : "")}>
              Contato
            </NavLink>
          </nav>
          {wa ? (
            <a className="wa" href={wa} target="_blank" rel="noopener">
              WhatsApp
            </a>
          ) : null}
        </div>
      </header>

      <main>{children}</main>

      <footer className="site-footer">
        <div className="inner">
          <span>
            © {new Date().getFullYear()} {config.display_name}. Todos os direitos reservados.
          </span>
          <span>Vitrine gerada pelo sistema de gestão da imobiliária.</span>
        </div>
      </footer>
    </>
  );
}
