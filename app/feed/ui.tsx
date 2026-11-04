import Link from "next/link";
import type { ReactNode } from "react";

const NUM = new Intl.NumberFormat("es-CO");

export const num = (n: number | null | undefined) => (typeof n === "number" ? NUM.format(n) : "—");
export const secs = (ms: number | null | undefined) =>
  typeof ms === "number" ? `${(ms / 1000).toFixed(1).replace(".", ",")} s` : "—";
export const pct = (v: number | null | undefined) =>
  typeof v === "number" ? `${(Math.round(v * 10) / 10).toString().replace(".", ",")} %` : "—";

/** Las fechas de calendario se guardan a medianoche UTC: se leen en UTC para no correrse un día. */
export const day = (d: Date, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat("es-CO", { ...opts, timeZone: "UTC" }).format(d);
export const moment = (d: Date) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }).format(d);

export const firstLine = (text: string | null | undefined, max = 60) => {
  const line = (text ?? "").split("\n")[0].trim();
  if (!line) return "Sin texto";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};

export function Head({ eye, children, actions, back }: { eye: ReactNode; children: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="tope">
      <div>
        {back ? <Link className="volver" href={back.href}>← {back.label}</Link> : null}
        <p className="eye">{eye}</p>
        <h1 className="t">
          {children}
          <u>.</u>
        </h1>
      </div>
      {actions ? <div className="fila" style={{ gap: 8 }}>{actions}</div> : null}
    </header>
  );
}

export function NoAccount() {
  return (
    <p className="aviso">
      Todavía no hay cuentas de Instagram conectadas. <a href="/feed/cuentas" style={{ color: "inherit" }}>Conecta la primera</a>.
    </p>
  );
}

export function ErrorNote({ error }: { error?: string }) {
  return error ? <p className="err" role="alert">{error}</p> : null;
}
