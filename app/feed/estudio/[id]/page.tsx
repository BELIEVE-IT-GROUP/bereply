import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { assertCanProduce } from "@/lib/feed/stages";
import { continueJobAction, rebuildJobAction, retryJobAction, redoPlanAction } from "../../studio-actions";
import { ErrorNote, Head } from "../../ui";
import { PieceMedia } from "../../media";
import { JOB_LABEL, JOB_STEPS } from "../job";
import { FichaForm, type DraftFicha } from "./ficha-form";

type Plan = { id: string; imagen?: string; t?: number; texto?: Array<{ t: string }> };
type Audio = { lufs?: number; truePeakDb?: number; durationS?: number; earshot?: string };

export default async function EstudioPiezaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { workspaceId } = await feedContext();
  const piece = await prisma.feedPiece.findFirst({ where: { id, week: { workspaceId } }, include: { job: true } });
  if (!piece) notFound();
  const job = piece.job;
  const assets = (piece.assets ?? []) as Array<{ url: string; name?: string }>;
  let puedeProducir: string | null = null;
  try {
    assertCanProduce(piece);
  } catch (e) {
    puedeProducir = e instanceof Error ? e.message : "No se puede producir todavía.";
  }
  const planos = ((job?.ficha as { planos?: Plan[] } | undefined)?.planos ?? []) as Plan[];
  const audio = (job?.audio ?? null) as Audio | null;
  const hecho = (step: string) => {
    if (!job) return false;
    const orden: string[] = JOB_STEPS.map((s) => s.id);
    const actual = job.status === "LISTO" ? (piece.gatesPassed.includes("MP4") ? 5 : 4) : orden.indexOf(job.step);
    return orden.indexOf(step) < actual;
  };

  return (
    <>
      <Head
        back={{ href: `/feed/pieza/${piece.id}`, label: "Volver a la pieza" }}
        eye={<>{piece.title} / 9:16{audio?.durationS ? ` / ${audio.durationS.toFixed(1).replace(".", ",")} s` : ""}</>}
        actions={
          <>
            {job?.status === "ESPERA_REVISION" ? (
              <form action={continueJobAction}><input type="hidden" name="pieceId" value={piece.id} /><button className="btn pri" type="submit">Cuadros bien: producir clips</button></form>
            ) : null}
            {job?.status === "FALLO" ? (
              <form action={retryJobAction}><input type="hidden" name="pieceId" value={piece.id} /><button className="btn pri" type="submit">Reintentar</button></form>
            ) : null}
            {job?.status === "LISTO" ? (
              <form action={rebuildJobAction}><input type="hidden" name="pieceId" value={piece.id} /><button className="btn" type="submit">Volver a armar, gratis</button></form>
            ) : null}
            {piece.videoUrl && !piece.gatesPassed.includes("MP4") ? <Link className="btn pri" href={`/feed/pieza/${piece.id}`}>Ir a aprobar</Link> : null}
          </>
        }
      >
        Del guion al <i>MP4</i>
      </Head>

      {job?.status === "EN_COLA" || job?.status === "CORRIENDO" ? <meta httpEquiv="refresh" content="20" /> : null}
      <ErrorNote error={error} />
      {job?.status === "FALLO" && job.log ? <p className="err" role="alert">Falló: {job.log}</p> : null}

      {!job ? (
        <div className="dos">
          <section style={{ maxWidth: 340 }}>
            <PieceMedia pieceId={piece.id} videoUrl={piece.videoUrl} thumbnailUrl={piece.thumbnailUrl} assets={assets} />
          </section>
          <section className="plano">
            <h2 className="s">{piece.videoUrl ? "Este video se adjuntó" : "Todavía no hay ficha"}</h2>
            <p className="sub">{piece.videoUrl ? "No se produjo aquí, por eso no tiene planos ni etapas. Se aprueba desde la pieza." : "Abre la pieza y usa Enviar a Estudio: el borrador sale de su guion."}</p>
            <div><Link className="btn" href={`/feed/pieza/${piece.id}`}>Ir a la pieza</Link></div>
          </section>
        </div>
      ) : job.status === "BORRADOR" ? (
        <FichaForm
          pieceId={piece.id}
          ficha={job.ficha as DraftFicha}
          canProduce={puedeProducir === null}
          why={puedeProducir ?? undefined}
        />
      ) : (
        <>
          <div className="pasos" aria-label="Etapas de producción">
            {JOB_STEPS.map((s) => (
              <div key={s.id} className={`paso ${hecho(s.id) ? "ok" : job.step === s.id ? "ya" : ""}`}>
                <b>{s.label}</b>
                <small>{hecho(s.id) ? "Lista" : job.step === s.id ? JOB_LABEL[job.status] : s.paga ? "Paga" : "Gratis"}</small>
              </div>
            ))}
          </div>

          <div className="dos">
            <section style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
              {piece.videoUrl ? <div style={{ maxWidth: 340 }}><PieceMedia pieceId={piece.id} videoUrl={piece.videoUrl} thumbnailUrl={piece.thumbnailUrl} assets={[]} /></div> : null}
              <div className="caja">
                <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(planos.length, 1)}, minmax(92px, 1fr))`, gap: 10, minWidth: Math.max(planos.length, 1) * 102 }}>
                  {planos.map((p) => (
                    <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.imagen ? <img src={p.imagen} alt={`Plano ${p.id}`} style={{ width: "100%", aspectRatio: "9/16", objectFit: "cover", borderRadius: 2, display: "block" }} />
                        : <div style={{ width: "100%", aspectRatio: "9/16", background: "#0a1538", border: "1px dashed #1f3170", borderRadius: 2 }} />}
                      <span className="mono mute" style={{ fontSize: 11 }}>{p.id}</span>
                      <span style={{ fontSize: 13 }}>{p.texto?.map((x) => x.t).join(" ") ?? ""}</span>
                      {job.status === "ESPERA_REVISION" || job.status === "LISTO" ? (
                        <form action={redoPlanAction}>
                          <input type="hidden" name="pieceId" value={piece.id} />
                          <input type="hidden" name="plan" value={p.id} />
                          <button className="btn" type="submit" style={{ minHeight: 36, padding: "0 10px", fontSize: 12, width: "100%" }}>Rehacer</button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
              {job.status === "CORRIENDO" || job.status === "EN_COLA" ? <p className="sub">Se está produciendo. Esta pantalla se actualiza sola.</p> : null}
            </section>

            <aside className="card" style={{ gap: 2 }}>
              <h2 className="s" style={{ marginBottom: 6 }}>Escucha</h2>
              {audio ? (
                <div className="lista">
                  <div><span className="mute">Volumen</span><span className="mono">{audio.lufs?.toFixed(1).replace(".", ",")} LUFS</span></div>
                  <div><span className="mute">Pico</span><span className="mono">{audio.truePeakDb?.toFixed(1).replace(".", ",")} dBTP</span></div>
                  {audio.earshot ? <div><span className="mute">earshot</span><span className="mono">{audio.earshot}</span></div> : null}
                </div>
              ) : <p className="sub">Aparece al terminar el armado.</p>}
              <h2 className="s" style={{ margin: "16px 0 6px" }}>Costo</h2>
              <div className="lista"><div><span className="mute">Este Reel</span><span className="mono">{job.costUsd != null ? `${job.costUsd.toFixed(2)} USD` : "Sin medir"}</span></div></div>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
