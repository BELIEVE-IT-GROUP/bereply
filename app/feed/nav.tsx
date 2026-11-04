"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["Hoy", "/feed"],
  ["Semana", "/feed/semana"],
  ["Estudio", "/feed/estudio"],
  ["Métricas", "/feed/metricas"],
  ["Ideas", "/feed/ideas"],
  ["Cierres", "/feed/cierre"],
  ["Marca", "/feed/marca"],
  ["Cuentas", "/feed/cuentas"],
  ["Agente", "/feed/agente"],
] as const;

export function FeedNav({ pendientes }: { pendientes: number }) {
  const path = usePathname();
  const activo = (href: string) =>
    href === "/feed"
      ? path === href
      : path.startsWith(href) || (href === "/feed/semana" && path.startsWith("/feed/pieza"));
  return (
    <nav className="nav" aria-label="Principal">
      {ITEMS.map(([label, href]) => (
        <Link key={href} href={href} className={activo(href) ? "on" : undefined} aria-current={activo(href) ? "page" : undefined}>
          {label}
          {href === "/feed" && pendientes > 0 ? <em>{pendientes}</em> : null}
        </Link>
      ))}
    </nav>
  );
}
