import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { gateState, stageFor } from "@/lib/feed/service";
import { GATES, nextGate, type Gate } from "@/lib/feed/stages";
import { approveAction, blockAction, changesAction, publishAction, submitAction } from "../../actions";
import { FORMAT_LABEL, GATE_HINT, GATE_LABEL, STAGE_LABEL } from "../../gates";
import { day, ErrorNote, firstLine, Head, moment } from "../../ui";

type Hook = { score?: number; text: string; chosen?: boolean };
type Row = { time: string; voice: string; screen: string };

export default async function PiezaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { workspaceId } = await feedContext();
  const piece = await prisma.feedPiece.findFirst({
    where: { id, week: { workspaceId } },
    include: { week: true, job: true, events: { orderBy: { createdAt: "desc" }, take: 8 } },
  });
  if (!piece) notFound();

  const state = gateState(piece);
  const stage = stageFor(state);
  const gate = nextGate(state);
  const hooks = (piece.hooks ?? []) as Hook[];
  const script = (piece.script ?? []) as Row[];
  const gates: Gate[] = GATES.filter((g) => g !== "MP4" || piece.needsVideo);
  const sinUsar =
    stage === "LISTA"
      ? await prisma.feedMediaMetric.findMany({
          where: { instagramAccountId: piece.week.instagramAccountId },
          orderBy: { publishedAt: "desc" },
          take: 10,
        })
      : [];
  const hidden = <input type="hidden" name="pieceId" value={piece.id} />;

  return (
    <>
      <Head
        eye={<><Link href="/feed/semana" style={{ color: "inherit" }}>Semana</Link> / {day(piece.publishOn)} / {piece.drip ? `${piece.drip} / ` : ""}{FORMAT_LABEL[piece.format]}</>}
        actions={
          <>
            {piece.needsVideo ? <Link className="btn" href={`/feed/estudio/${piece.id}`}>Abrir en estudio</Link> : null}
            {stage === "GUION" ? (
              <form action={submitAction}>{hidden}<button className="btn pri" type="submit">Pasar a filtros</button></form>
            ) : gate && stage !== "PUBLICADA" ? (
              <form action={approveAction}>{hidden}<input type="hidden" name="gate" value={gate} /><button className="btn pri" type="submit">{GATE_LABEL[gate]}: aprobar</button></form>
            ) : null}
          </>
        }
      >
        {piece.title}
      </Head>

      <ErrorNote error={error} />
      {piece.blockedBy ? <p className="err">Frenada: la tiene <b>{piece.blockedBy}</b>{piece.blockedReason ? `. ${piece.blockedReason}` : ""}</p> : null}

      <div className="tres">
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {piece.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={piece.thumbnailUrl} alt="" style={{ width: "100%", aspectRatio: "9/16", objectFit: "cover", borderRadius: 2, display: "block" }} />
          ) : null}
          {piece.videoUrl ? <a className="btn" href={piece.videoUrl} target="_blank" rel="noreferrer">Ver el MP4</a> : null}
          <div className="fila" style={{ gap: 6 }}>
            <span className="tag">{STAGE_LABEL[stage]}</span>
            {piece.linterClean ? <span className="tag ok">Linter limpio</span> : <span className="tag freno">Linter pendiente</span>}
          </div>
          {piece.measures ? <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span className="rot">Qué mide</span><span>{piece.measures}</span></div> : null}
          {piece.firstThree ? <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span className="rot">Primeros 3 s</span><span style={{ fontSize: 13 }}>{piece.firstThree}</span></div> : null}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
          {script.length > 0 ? (
            <div className="plano">
              <h2 className="s">Guion</h2>
              <div className="caja">
                <table className="tb">
                  <thead><tr><th>Tiempo</th><th>Voz</th><th>En pantalla</th></tr></thead>
                  <tbody>{script.map((r, i) => <tr key={i}><td className="n">{r.time}</td><td>{r.voice}</td><td className="n">{r.screen}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}
          {hooks.length > 0 ? (
            <div className="plano" style={{ gap: 2 }}>
              <h2 className="s" style={{ marginBottom: 6 }}>Ganchos</h2>
              <div className="lista">
                {hooks.map((h, i) => (
                  <div key={i} style={{ flexWrap: "nowrap" }}>
                    <span className={`mono ${h.chosen ? "" : "mute"}`} style={{ width: 26, flex: "none" }}>{h.score ?? ""}</span>
                    <span className={h.chosen ? undefined : "mute"} style={{ flex: 1 }}>{h.text}</span>
                    {h.chosen ? <span className="tag ok">Elegido</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {piece.caption ? <div className="plano"><h2 className="s">Caption</h2><p style={{ margin: 0, maxWidth: "62ch", whiteSpace: "pre-line" }}>{piece.caption}</p></div> : null}
          {piece.stories ? <div className="plano"><h2 className="s">Historias</h2><p style={{ margin: 0, maxWidth: "62ch", whiteSpace: "pre-line" }}>{piece.stories}</p></div> : null}
          {script.length === 0 && !piece.caption ? <p className="aviso">Esta pieza aún no tiene texto. Pídeselo al agente con <span className="mono">guardar_pieza</span>.</p> : null}
          <div className="plano" style={{ gap: 2 }}>
            <h2 className="s" style={{ marginBottom: 6 }}>Historial</h2>
            <div className="lista">
              {piece.events.map((e) => (
                <div key={e.id}>
                  <span style={{ flex: "1 1 280px" }}><span className="rot">{moment(e.createdAt)} · {e.actorName}</span><br />{e.action.replaceAll("_", " ")}{e.detail ? `: ${e.detail}` : ""}</span>
                  {e.outcome !== "ok" ? <span className="tag freno">{e.outcome}</span> : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="card" style={{ gap: 2 }}>
            <h2 className="s" style={{ marginBottom: 8 }}>Puertas</h2>
            {gates.map((g) => {
              const abierta = piece.gatesPassed.includes(g);
              return (
                <div className="pt" key={g}>
                  <span className={`m ${abierta ? "ok" : g === gate && stage !== "GUION" ? "ahora" : ""}`} />
                  <div><b style={{ fontWeight: 500 }}>{GATE_LABEL[g]}</b><br /><span className="mute" style={{ fontSize: 13 }}>{abierta ? "Aprobado" : GATE_HINT[g]}</span></div>
                </div>
              );
            })}
            <div className="pt"><span className={`m ${stage === "PUBLICADA" ? "ok" : stage === "LISTA" ? "ahora" : ""}`} /><div><b style={{ fontWeight: 500 }}>Publicación</b><br /><span className="mute" style={{ fontSize: 13 }}>La hace una persona, el {day(piece.publishOn, { day: "numeric", month: "long" })}</span></div></div>
          </section>

          {stage === "LISTA" ? (
            <form action={publishAction} className="card">
              {hidden}
              <h2 className="s">Ya la publicaste</h2>
              <p className="sub" style={{ fontSize: 13 }}>Elige la publicación, para unirla con sus métricas.</p>
              <label className="rot" htmlFor="mediaId">Publicación</label>
              <select className="input" id="mediaId" name="mediaId" required>
                {sinUsar.map((m) => <option key={m.instagramMediaId} value={m.instagramMediaId}>{day(m.publishedAt, { day: "numeric", month: "short" })}: {firstLine(m.caption, 40)}</option>)}
              </select>
              <button className="btn pri" type="submit">Marcar como publicada</button>
            </form>
          ) : null}

          {stage !== "GUION" && stage !== "PUBLICADA" ? (
            <form action={changesAction} className="card">
              {hidden}
              <label className="s" htmlFor="note">Pedir cambios</label>
              <textarea className="input" id="note" name="note" rows={3} placeholder="Qué hay que cambiar" />
              <p className="sub" style={{ fontSize: 13 }}>Vuelve a guion y se cierran las puertas.</p>
              <button className="btn" type="submit">Pedir cambios</button>
            </form>
          ) : null}

          {stage !== "PUBLICADA" ? (
            <form action={blockAction} className="card">
              {hidden}
              <label className="s" htmlFor="who">{piece.blockedBy ? "Quién la tiene" : "¿Espera a alguien?"}</label>
              <input className="input" id="who" name="who" defaultValue={piece.blockedBy ?? ""} placeholder="Nombre" />
              <label className="rot" htmlFor="reason">Qué falta</label>
              <input className="input" id="reason" name="reason" defaultValue={piece.blockedReason ?? ""} placeholder="El dato que falta" />
              <button className="btn" type="submit">{piece.blockedBy ? "Guardar. Vacío la suelta" : "Frenar la pieza"}</button>
            </form>
          ) : null}
        </aside>
      </div>
    </>
  );
}
