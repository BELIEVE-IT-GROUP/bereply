import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { summarize } from "@/lib/feed/insights";
import { currentWeek, gateState, recentReels, stageFor } from "@/lib/feed/service";
import { nextGate } from "@/lib/feed/stages";
import { requestState } from "@/lib/feed/pedidos";
import { rejectRequestAction } from "./actions";
import { GATE_LABEL } from "./gates";
import { day, Head, moment, NoAccount, pct, secs } from "./ui";

export default async function HoyPage() {
  const { workspaceId, accounts } = await feedContext();
  const today = new Date(new Date().toISOString().slice(0, 10));
  const pieces = await prisma.feedPiece.findMany({
    where: { week: { workspaceId, endsOn: { gte: today } } },
    include: { week: { include: { instagramAccount: { select: { username: true } } } } },
    orderBy: { publishOn: "asc" },
  });
  const frenadas = pieces.filter((p) => p.blockedBy);
  const puertas = pieces
    .filter((p) => !p.blockedBy && p.stage !== "GUION" && !p.instagramMediaId)
    .map((p) => ({ piece: p, gate: nextGate(gateState(p)) }))
    .filter((x) => x.gate);
  const eventos = await prisma.feedEvent.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 6 });

  const marcas = await Promise.all(
    accounts.map(async (a) => {
      const [reels, week, perfil] = await Promise.all([
        recentReels(a.id),
        currentWeek(a.id),
        prisma.feedBrandProfile.findUnique({ where: { instagramAccountId: a.id }, select: { id: true } }),
      ]);
      const resumen = summarize(reels);
      const ultimo = reels[0];
      const alto = ultimo?.skipRate != null && resumen.medianSkip != null && ultimo.skipRate >= resumen.medianSkip + 10;
      return { a, week, resumen, ultimo, alto, tienePerfil: Boolean(perfil) };
    })
  );

  const pedidos = await prisma.feedAdRequest.findMany({
    where: { workspaceId, cerrado: null },
    include: { instagramAccount: { select: { username: true } } },
    orderBy: { createdAt: "asc" },
    take: 30,
  });
  const conPieza = new Set(
    (await prisma.feedPiece.findMany({ where: { adRequestKey: { in: pedidos.map((p) => p.clave) } }, select: { adRequestKey: true } })).map((p) => p.adRequestKey)
  );
  const nuevos = pedidos.filter((p) => requestState(p.cerrado, []) === "RECIBIDO" && !conPieza.has(p.clave));
  const total = frenadas.length + puertas.length + nuevos.length;
  return (
    <>
      <Head
        eye={new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" }).format(new Date())}
        actions={<Link className="btn" href="/feed/agente">Abrir en Claude o George</Link>}
      >
        {total === 0 ? <>Nada frena <i>esta semana</i></> : <>{total === 1 ? "Una cosa frena" : `${total} cosas frenan`} <i>esta semana</i></>}
      </Head>

      {accounts.length === 0 ? <NoAccount /> : null}

      {nuevos.length > 0 ? (
        <section className="plano">
          <h2 className="s">Pedidos de BeAds</h2>
          <div className="lista">
            {nuevos.map((p) => (
              <div key={p.id}>
                <span style={{ flex: "1 1 280px" }}>
                  <b style={{ fontWeight: 500 }}>{p.brief}</b>
                  <br />
                  <span className="mute">@{p.instagramAccount.username} · {p.motivo} · {p.versiones} {p.versiones === 1 ? "versión" : "versiones"}{p.para ? ` · Para el ${day(p.para)}` : ""}</span>
                </span>
                <Link className="btn pri" href={`/feed/pieza/nueva?pedido=${p.id}`}>Crear pieza</Link>
                <form action={rejectRequestAction} className="fila" style={{ gap: 6 }}>
                  <input type="hidden" name="id" value={p.id} />
                  <input className="input" name="motivo" required placeholder="Por qué no" aria-label="Por qué se rechaza" />
                  <button className="btn" type="submit">Rechazar</button>
                </form>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="dos">
        <section className="plano">
          <h2 className="s">Lo que está esperando a alguien</h2>
          {total === 0 ? <p className="sub">Nadie está esperando nada.</p> : null}
          <div className="lista">
            {puertas.map(({ piece: p, gate }) => (
              <Link key={p.id} href={`/feed/pieza/${p.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                <div>
                  <b style={{ fontWeight: 500 }}>{p.title}</b>
                  <br />
                  <span className="mute">@{p.week.instagramAccount.username} · Sale el {day(p.publishOn)}</span>
                </div>
                <span className="tag azul">{GATE_LABEL[gate!]}</span>
              </Link>
            ))}
            {frenadas.map((p) => (
              <Link key={p.id} href={`/feed/pieza/${p.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                <div>
                  <b style={{ fontWeight: 500 }}>{p.blockedReason ?? p.title}</b>
                  <br />
                  <span className="mute">@{p.week.instagramAccount.username} · {p.title}</span>
                </div>
                <span className="tag freno">{p.blockedBy}</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="plano">
          <h2 className="s">Lo último que pasó</h2>
          {eventos.length === 0 ? <p className="sub">Aquí aparece todo lo que hagan las personas y el agente.</p> : null}
          <div className="lista">
            {eventos.map((e) => (
              <div key={e.id}>
                <div>
                  <span className="rot">{moment(e.createdAt)} · {e.actorName}</span>
                  <br />
                  {e.action.replaceAll("_", " ")}{e.detail ? `: ${e.detail}` : ""}
                </div>
                {e.outcome !== "ok" ? <span className="tag freno">{e.outcome}</span> : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="plano">
        <h2 className="s">Tus marcas</h2>
        <div className="caja">
          <table className="tb">
            <thead><tr><th>Cuenta</th><th>Semana</th><th>Listas para publicar</th><th>Tiempo medio</th><th>Tasa de salto</th><th>Lo que hay que mirar</th></tr></thead>
            <tbody>
              {marcas.map(({ a, week, resumen, ultimo, alto, tienePerfil }) => (
                <tr key={a.id}>
                  <td className="n">@{a.username}</td>
                  <td className={week ? undefined : "mute"}>{week ? `${day(week.startsOn, { day: "numeric", month: "short" })} a ${day(week.endsOn, { day: "numeric", month: "short" })}` : "Sin semana"}</td>
                  <td className="n">{week ? `${week.pieces.filter((p) => stageFor(gateState(p)) === "LISTA").length} de ${week.pieces.length}` : "—"}</td>
                  <td className="n">{secs(resumen.medianWatchMs)}</td>
                  <td className="n">{pct(resumen.medianSkip)}</td>
                  <td>
                    {alto ? <span className="tag sen">Salto de {pct(ultimo.skipRate)} en el último Reel</span>
                      : !tienePerfil ? <span className="tag">Falta el arranque de cuenta</span>
                      : resumen.count === 0 ? <span className="tag">Sin métricas todavía</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ fontSize: 13 }}>Medianas de los últimos 8 Reels de cada cuenta.</p>
      </section>
    </>
  );
}
