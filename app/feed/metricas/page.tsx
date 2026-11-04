import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { skipSeparation, summarize, winners } from "@/lib/feed/insights";
import { recentReels } from "@/lib/feed/service";
import { refreshMetricsAction } from "../actions";
import { day, firstLine, Head, moment, NoAccount, num, pct, secs } from "../ui";

export default async function MetricasPage() {
  const { account } = await feedContext();
  if (!account) return <NoAccount />;
  const reels = await recentReels(account.id);
  const ordenados = [...reels].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  const resumen = summarize(reels);
  const separacion = skipSeparation(reels);
  const ganadores = new Set(winners(reels).map((r) => r.instagramMediaId));
  const ultima = await prisma.feedMediaMetric.findFirst({
    where: { instagramAccountId: account.id },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true },
  });

  return (
    <>
      <Head
        back={{ href: "/feed", label: "Hoy" }}
        eye={`@${account.username} · Últimos ${reels.length} Reels${ultima ? ` · Leído ${moment(ultima.capturedAt)}` : ""}`}
        actions={
          <>
            <form action={refreshMetricsAction}><button className="btn" type="submit">Actualizar de Meta</button></form>
            <Link className="btn" href="/feed/ideas">Convertir ganadores en ideas</Link>
          </>
        }
      >
        {separacion ? <>Quien pasa de los 3 segundos <i>se queda</i></> : <>Lo que pasó en <i>tus Reels</i></>}
      </Head>

      {reels.length === 0 ? <p className="aviso">Todavía no hay métricas de esta cuenta. Usa Actualizar de Meta.</p> : null}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <div className="plano" style={{ gap: 8 }}><span className="rot">Vistas, mediana</span><span className="kpi">{num(resumen.medianViews)}</span></div>
        <div className="plano" style={{ gap: 8 }}><span className="rot">Tiempo medio, mediana</span><span className="kpi">{secs(resumen.medianWatchMs)}</span></div>
        <div className="plano" style={{ gap: 8 }}><span className="rot">Tasa de salto, mediana</span><span className="kpi">{pct(resumen.medianSkip)}</span></div>
      </div>

      {separacion ? (
        <div className="card" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
          <span className="tag sen">Lo que separa a los ganadores</span>
          <span style={{ flex: "1 1 420px" }}>
            Los {separacion.topCount} Reels con más vistas saltaron {pct(separacion.topMaxSkip)} o menos. Los otros {separacion.restCount} saltaron {pct(separacion.restMinSkip)} o más y no pasaron de {num(separacion.restMaxViews)} vistas.
          </span>
        </div>
      ) : null}

      {reels.length > 0 ? (
        <section className="plano">
          <div className="caja">
            <table className="tb">
              <thead><tr><th>Reel</th><th>Fecha</th><th>Vistas</th><th>Alcance</th><th>Guardados</th><th>Compartidos</th><th>Tiempo medio</th><th>Tasa de salto</th></tr></thead>
              <tbody>
                {ordenados.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <a href={r.permalink ?? "#"} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 260, color: "inherit", textDecoration: "none" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {r.thumbnailUrl ? <img className="th" src={r.thumbnailUrl} alt="" /> : <span className="th" />}
                        <span>{firstLine(r.caption, 46)}</span>
                      </a>
                    </td>
                    <td className="n">{day(r.publishedAt, { day: "numeric", month: "short" })}</td>
                    <td className="n">{num(r.views)}</td>
                    <td className="n">{num(r.reach)}</td>
                    <td className="n">{num(r.saved)}</td>
                    <td className="n">{num(r.shares)}</td>
                    <td className="n">{secs(r.avgWatchMs)}</td>
                    <td>
                      <div className="fila" style={{ gap: 10, alignItems: "center", flexWrap: "nowrap" }}>
                        <span className="mono" style={{ width: 54, flex: "none" }}>{pct(r.skipRate)}</span>
                        <div className="barra" style={{ flex: 1 }}><div className={ganadores.has(r.instagramMediaId) ? "sen" : undefined} style={{ width: `${r.skipRate ?? 0}%` }} /></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ fontSize: 13 }}>La curva segundo a segundo no llega por la API: para ubicar dónde se va la gente, sigue saliendo de Meta Business Suite.</p>
        </section>
      ) : null}
    </>
  );
}
