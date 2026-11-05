import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { winners, worstHook } from "@/lib/feed/insights";
import { adWinnersOf } from "@/lib/feed/resultados";
import { currentWeek, recentReels } from "@/lib/feed/service";
import { addReferenceAction, pieceFromWinnerAction, removeReferenceAction } from "../actions";
import { firstLine, Head, NoAccount, pct, secs } from "../ui";

export default async function IdeasPage() {
  const { account } = await feedContext();
  if (!account) return <NoAccount />;
  const [reels, week, referencias, ganadoresPauta] = await Promise.all([
    recentReels(account.id),
    currentWeek(account.id),
    prisma.feedReference.findMany({ where: { instagramAccountId: account.id }, orderBy: { createdAt: "asc" } }),
    adWinnersOf(account.id),
  ]);
  const top = winners(reels);
  const peor = worstHook(reels);
  const crear = (title: string) =>
    week ? (
      <form action={pieceFromWinnerAction} style={{ marginTop: 10 }}>
        <input type="hidden" name="weekId" value={week.id} />
        <input type="hidden" name="title" value={title} />
        <button className="btn" type="submit">Crear pieza</button>
      </form>
    ) : null;

  return (
    <>
      <Head back={{ href: "/feed", label: "Hoy" }} eye={`@${account.username} · Ganadores propios y cuentas de referencia`}>
        Primero repite lo que <i>ya te funcionó</i>
      </Head>

      {ganadoresPauta.length > 0 ? (
        <section className="plano">
          <h2 className="s">Lo que ganó en pauta</h2>
          <p className="sub" style={{ fontSize: 13 }}>Cuesta menos del 70 % de la mediana de la marca, con al menos 10 resultados. Lo mide BeAds. El generador de semana también lo lee.</p>
          <div className="lista">
            {ganadoresPauta.map((r) => (
              <div key={r.anuncioId}>
                <span style={{ flex: "1 1 280px" }}><b style={{ fontWeight: 500 }}>{r.titulo}</b><br /><span className="mute">{r.resultados} resultados a {Math.round(r.costoPorResultado as number).toLocaleString("es-CO")} {r.moneda} cada uno</span></span>
                {crear(r.titulo)}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="plano">
        <h2 className="s">Tus ganadores</h2>
        {top.length === 0 ? <p className="sub">Un ganador supera el doble de la mediana de vistas de la cuenta. Todavía no hay ninguno entre los últimos Reels.</p> : null}
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 24 }}>
          {top.map((r) => (
            <article key={r.id} style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.thumbnailUrl ? <img src={r.thumbnailUrl} alt="" style={{ width: 84, aspectRatio: "9/16", objectFit: "cover", borderRadius: 2, display: "block" }} /> : <span />}
              <div>
                <span className="tag sen">{r.multiple.toString().replace(".", ",")}× la mediana</span>
                <h3 style={{ font: "500 15px/1.3 Inter, sans-serif", margin: "8px 0 0" }}>{firstLine(r.caption, 60)}</h3>
                <p className="mute" style={{ margin: "6px 0 0", fontSize: 13 }}>{secs(r.avgWatchMs)} de tiempo medio · {pct(r.skipRate)} de salto</p>
                {crear(firstLine(r.caption, 50))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="dos">
        <section className="plano">
          <h2 className="s">Lo que dicen tus datos</h2>
          <div className="lista">
            {peor && peor.skipRate != null ? (
              <div>
                <div style={{ flex: "1 1 300px" }}>
                  <b style={{ fontWeight: 500 }}>Rehacer el gancho de: {firstLine(peor.caption, 50)}</b>
                  <br />
                  <span className="mute" style={{ fontSize: 13 }}>{pct(peor.skipRate)} de salto y {secs(peor.avgWatchMs)} de tiempo medio: el problema está al inicio</span>
                </div>
                <span className="tag">Sale de tus datos</span>
              </div>
            ) : <div><span className="mute">Sin datos todavía.</span></div>}
          </div>
          {!week ? <p className="sub" style={{ fontSize: 13 }}>Para crear piezas desde aquí, primero tiene que existir una semana.</p> : null}
        </section>
        <section className="plano">
          <h2 className="s">Cuentas de referencia</h2>
          <p className="sub">Solo cuentas públicas de empresa o creador. Se copia la fórmula, nunca el video ni el guion. El agente las lee con el skill.</p>
          <div className="lista">
            {referencias.map((r) => (
              <div key={r.id}>
                <span style={{ flex: "1 1 200px" }}><span className="mono">@{r.username}</span>{r.note ? <><br /><span className="mute" style={{ fontSize: 13 }}>{r.note}</span></> : null}</span>
                <form action={removeReferenceAction}><input type="hidden" name="id" value={r.id} /><button className="btn" type="submit">Quitar</button></form>
              </div>
            ))}
          </div>
          <form action={addReferenceAction} className="fila" style={{ gap: 8 }}>
            <label htmlFor="username" className="rot" style={{ flexBasis: "100%" }}>Agregar cuenta</label>
            <input className="input" id="username" name="username" placeholder="usuario" required style={{ flex: "1 1 160px", width: "auto" }} />
            <input className="input" aria-label="Por qué sirve" name="note" placeholder="Por qué sirve" style={{ flex: "2 1 200px", width: "auto" }} />
            <button className="btn" type="submit">Agregar</button>
          </form>
        </section>
      </div>
    </>
  );
}
