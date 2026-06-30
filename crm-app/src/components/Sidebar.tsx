"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  MapPin,
  Building2,
  TrendingUp,
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/mercado", label: "Mercado ITBI", icon: TrendingUp },
  { href: "/bairros", label: "Por Bairro", icon: MapPin },
  { href: "/tipologia", label: "Por Tipologia", icon: Building2 },
  { href: "/empresa", label: "Minha Empresa", icon: BarChart3 },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 bg-white border-r border-gray-100 flex flex-col min-h-screen">
      <div className="px-6 py-5 border-b border-gray-100">
        <span className="text-lg font-bold text-gray-900">Clemente</span>
        <span className="text-sm text-blue-600 font-medium block -mt-0.5">Assessoria Imobiliária</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-4 border-t border-gray-100 text-xs text-gray-400">
        Dados ITBI — Juiz de Fora/MG
      </div>
    </aside>
  );
}
