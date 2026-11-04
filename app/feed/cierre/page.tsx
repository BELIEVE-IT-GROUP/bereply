import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { currentWeek } from "@/lib/feed/service";
import { saveClosingAction } from "../actions";
import { day, Head, moment, NoAccount, num, pct, secs } from "../ui";

export default async function CierrePage() {
  const { account } = await feedContext();
  if (!account) return <NoAccount />;
  const week = await currentWeek(account.id);
  if (!week) {
    return (
      <>
        <Head back={{ href: "/feed", label: "Hoy" }} eye={`@${account.username}`}>Todavía no hay <i>qué cerrar</i></Head>
        <p className="aviso">El cierre aparece cuando exista una semana.</p>
      </>
    );
  }
  const ids = week.pieces.map((p) => p.instagramMediaId).filter((v): v is string => Boolean(v));
  const metricas = await prisma.feedMediaMetric.findMany({ where: { instagramMediaId: { in: ids } } });
  const de = (id: string | null) => metricas.find((m) => m.instagramMediaId === id);
  const c = week.closing;

  return (
    <form action={saveClosingAction} style={{ display: "contents" }}>
      <input type="hidden" name="weekId" value={week.id} />
      <Head
        back={{ href: "/feed/semana", label: "Semana" }}
        eye={`@${account.username} · Semana del ${day(week.startsOn, { day: "numeric", month: "long" })} al ${day(week.endsOn, { day: "numeric", month: "long" })}${c?.closedAt ? ` · Cerrada ${moment(c.closedAt)}` : ""}`}
        actions={
          <>
            <button className="btn" type="submit">Guardar</button>
            <button className="btn pri" type="submit" name="close" value="1">Cerrar la semana</button>
          </>
        }
      >
        Lo que esta semana le enseña <i>a la siguiente</i>
      </Head>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <div className="plano" style={{ gap: 8 }}>
          <label className="rot" htmlFor="value">{week.measurableAction}</label>
          <input className="input" id="value" name="value" defaultValue={c?.value ?? ""} placeholder="El resultado que trae el cliente" />
        </div>
        {week.baseline ? <div className="plano" style={{ gap: 8 }}><span className="rot">Referencia</span><span>{week.baseline}</span></div> : null}
      </div>

      <section className="plano">
        <h2 className="s">Pieza por pieza</h2>
        <div className="caja">
          <table className="tb">
            <thead><tr><th>Pieza</th><th>Gota</th><th>Qué debía mover</th><th>Vistas</th><th>Tiempo medio</th><th>Salto</th><th>¿Se repite?</th></tr></thead>
            <tbody>
              {week.pieces.map((p) => {
                const m = de(p.instagramMediaId);
                return (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>{p.drip ?? "—"}</td>
                    <td>{p.measures ?? "—"}</td>
                    {m ? <><td className="n">{num(m.views)}</td><td className="n">{secs(m.avgWatchMs)}</td><td className="n">{pct(m.skipRate)}</td></>
                      : <td colSpan={3} className="mute">Entra sola al publicarse</td>}
                    <td>
                      <select className="input" aria-label={`¿Se repite ${p.title}?`} name={`repite:${p.id}`} defaultValue={p.repeatDecision ?? ""} style={{ minWidth: 110 }}>
                        <option value="">Sin decidir</option>
                        <option value="si">Sí</option>
                        <option value="ajustar">Ajustar</option>
                        <option value="no">No</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="s">Entra a la semana siguiente</h2>
        <p className="sub">Es lo primero que lee el agente antes de escribir.</p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><label className="rot" htmlFor="repeat">Se repite</label><textarea className="input" id="repeat" name="repeat" rows={3} defaultValue={c?.repeat ?? ""} /></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><label className="rot" htmlFor="drop">Se suelta</label><textarea className="input" id="drop" name="drop" rows={3} defaultValue={c?.drop ?? ""} /></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><label className="rot" htmlFor="pending">Queda pendiente</label><textarea className="input" id="pending" name="pending" rows={3} defaultValue={c?.pending ?? ""} /></div>
        </div>
      </section>
    </form>
  );
}
