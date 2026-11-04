import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { Head, NoAccount } from "../ui";

type Profile = {
  belief?: string;
  north?: string;
  pillars?: Array<{ name: string; weight: number }>;
  tone?: string[];
  example?: string;
  prohibited?: string[];
  fear?: string;
};
type Clash = { topic?: string; sourceA?: string; sourceB?: string; decider?: string };
type Source = { name: string; date: string };

export default async function MarcaPage() {
  const { account } = await feedContext();
  if (!account) return <NoAccount />;
  const row = await prisma.feedBrandProfile.findUnique({ where: { instagramAccountId: account.id } });
  if (!row) {
    return (
      <>
        <Head back={{ href: "/feed", label: "Hoy" }} eye={`@${account.username} · Lo que el agente sabe de esta marca`}>Esta marca aún no tiene <i>arranque</i></Head>
        <p className="aviso">Pídele al agente el arranque de cuenta: lee la estrategia en MAAS2 y la voz en Maasy, y lo deja aquí con <span className="mono">guardar_marca</span>.</p>
      </>
    );
  }
  const p = row.profile as Profile;
  const clashes = row.clashes as Clash[];
  const sources = row.sources as Source[];
  const maximo = Math.max(1, ...(p.pillars ?? []).map((x) => x.weight));

  return (
    <>
      <Head back={{ href: "/feed", label: "Hoy" }} eye={`@${account.username} · Lo que el agente sabe de esta marca`}>{p.belief ?? <>El perfil de <i>la marca</i></>}</Head>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 28, alignItems: "start" }}>
        <section className="plano">
          <h2 className="s">Norte</h2>
          <p style={{ margin: 0 }}>{p.north ?? "Sin definir"}</p>
          {p.pillars?.length ? <h2 className="s" style={{ marginTop: 8 }}>Pilares</h2> : null}
          <div>
            {(p.pillars ?? []).map((x) => (
              <div key={x.name} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 44px minmax(80px, 1fr)", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: "1px solid #1f3170" }}>
                <span>{x.name}</span>
                <span className="mono">{x.weight} %</span>
                <div className="barra"><div style={{ width: `${(x.weight / maximo) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="plano">
          <h2 className="s">Voz</h2>
          <div className="fila" style={{ gap: 6 }}>{(p.tone ?? []).map((t) => <span className="tag" key={t}>{t}</span>)}</div>
          {p.example ? <blockquote style={{ margin: 0, font: "italic 500 19px/1.35 Fraunces, Georgia, serif" }}>{p.example}</blockquote> : null}
          {p.prohibited?.length ? <><span className="rot" style={{ marginTop: 6 }}>Palabras prohibidas</span><p style={{ margin: 0, color: "#c9d0e6" }}>{p.prohibited.join(" · ")}</p></> : null}
          {p.fear ? <><span className="rot" style={{ marginTop: 6 }}>Miedo que hay que quitar</span><p style={{ margin: 0 }}>{p.fear}</p></> : null}
        </section>

        <section className="plano">
          <h2 className="s">De dónde sale</h2>
          <div className="lista">
            {sources.map((s) => <div key={s.name}><span>{s.name}</span><span className="mono mute">{s.date}</span></div>)}
          </div>
        </section>
      </div>

      {clashes.length > 0 ? (
        <section className="plano">
          <div className="fila" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="s">Datos que chocan</h2>
            <span className="tag sen">No se publican hasta decidir</span>
          </div>
          <div className="caja">
            <table className="tb">
              <thead><tr><th>Dato</th><th>Una fuente dice</th><th>Otra dice</th><th>Decide</th></tr></thead>
              <tbody>{clashes.map((c, i) => <tr key={i}><td>{c.topic}</td><td>{c.sourceA}</td><td>{c.sourceB}</td><td>{c.decider}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
