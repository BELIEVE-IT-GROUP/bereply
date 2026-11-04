import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { generateWeekAction } from "../../actions";
import { day, ErrorNote, Head, moment, NoAccount } from "../../ui";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** El jueves siguiente: la semana de Believe va de jueves a miércoles. */
function nextThursday(from: Date) {
  return addDays(from, ((4 - from.getUTCDay() + 7) % 7) || 7);
}

const STATUS: Record<string, { label: string; className: string }> = {
  EN_COLA: { label: "En cola", className: "tag" },
  CORRIENDO: { label: "Escribiendo", className: "tag azul" },
  LISTO: { label: "Lista", className: "tag ok" },
  FALLO: { label: "Falló", className: "tag freno" },
};

export default async function GenerarPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { account } = await feedContext();
  if (!account) return <NoAccount />;
  const [ultima, pedidas] = await Promise.all([
    prisma.feedWeek.findFirst({ where: { instagramAccountId: account.id }, orderBy: { startsOn: "desc" }, select: { endsOn: true } }),
    prisma.feedWeekRequest.findMany({ where: { instagramAccountId: account.id }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const hoy = new Date(iso(new Date()));
  const desde = ultima && ultima.endsOn >= hoy ? addDays(ultima.endsOn, 1) : nextThursday(hoy);
  const activa = pedidas.some((r) => r.status === "EN_COLA" || r.status === "CORRIENDO");

  return (
    <>
      {/* Mientras escribe, la página se recarga sola para mostrar cuando termine. */}
      {activa ? <meta httpEquiv="refresh" content="20" /> : null}
      <Head back={{ href: "/feed/semana", label: "Semana" }} eye={`@${account.username}`}>Generar la <i>semana</i></Head>
      <ErrorNote error={error} />
      <div className="dos">
        <form action={generateWeekAction} className="card">
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="rot" htmlFor="desde">Desde</label>
              <input className="input" id="desde" name="desde" type="date" required defaultValue={iso(desde)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="rot" htmlFor="hasta">Hasta</label>
              <input className="input" id="hasta" name="hasta" type="date" required defaultValue={iso(addDays(desde, 6))} />
            </div>
          </div>
          <label className="rot" htmlFor="accion">Acción que se mide</label>
          <input className="input" id="accion" name="accion" required minLength={3} placeholder="Una sola. Por ejemplo, combos con código" />
          <label className="rot" htmlFor="materia">Materia prima real</label>
          <textarea className="input" id="materia" name="materia" rows={7} placeholder="Cartelera, promos vigentes, fotos o datos de la semana" />
          <p className="sub" style={{ fontSize: 13 }}>Lo que no esté aquí ni en la estrategia no se inventa: la pieza queda frenada con el dato que falta y quién lo tiene.</p>
          <button className="btn pri" type="submit">Generar</button>
        </form>
        <section className="plano">
          <h2 className="s">Pedidas</h2>
          {pedidas.length === 0 ? <p className="sub">Ninguna todavía.</p> : null}
          <div className="lista">
            {pedidas.map((r) => (
              <div key={r.id}>
                <span style={{ flex: "1 1 200px" }}>
                  {r.status === "LISTO" ? <a href={`/feed/semana?w=${iso(r.startsOn)}`}>{day(r.startsOn, { day: "numeric", month: "long" })}</a> : day(r.startsOn, { day: "numeric", month: "long" })}
                  <br /><span className="mute" style={{ fontSize: 13 }}>{r.requestedBy}, {moment(r.createdAt)}{r.log ? `. ${r.log}` : ""}</span>
                </span>
                <span className={STATUS[r.status]?.className ?? "tag"}>{STATUS[r.status]?.label ?? r.status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
