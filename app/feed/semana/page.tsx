import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { currentWeek, gateState, stageFor, weekByStart } from "@/lib/feed/service";
import { FEED_STAGES, nextGate } from "@/lib/feed/stages";
import { deleteWeekAction } from "../actions";
import { FORMAT_LABEL, GATE_LABEL, STAGE_EMPTY, STAGE_LABEL } from "../gates";
import { day, ErrorNote, Head, NoAccount } from "../ui";

export default async function SemanaPage({ searchParams }: { searchParams: Promise<{ w?: string; error?: string }> }) {
  const { w, error } = await searchParams;
  const { account } = await feedContext();
  if (!account) return <NoAccount />;
  const valid = w && /^\d{4}-\d{2}-\d{2}$/.test(w);
  const week = (valid ? await weekByStart(account.id, w) : null) ?? (await currentWeek(account.id));
  const weeks = await prisma.feedWeek.findMany({
    where: { instagramAccountId: account.id },
    orderBy: { startsOn: "desc" },
    take: 8,
    select: { id: true, startsOn: true },
  });

  if (!week) {
    return (
      <>
        <Head back={{ href: "/feed", label: "Hoy" }} eye={`@${account.username}`}>Todavía no hay <i>semana</i></Head>
        <ErrorNote error={error} />
        <p className="aviso">Se genera con la estrategia de la marca y queda aquí, en guion. <Link href="/feed/semana/generar">Generar semana</Link></p>
      </>
    );
  }

  return (
    <>
      <Head
        back={{ href: "/feed", label: "Hoy" }}
        eye={`@${account.username} · ${day(week.startsOn, { day: "numeric", month: "long" })} a ${day(week.endsOn, { day: "numeric", month: "long" })}`}
        actions={
          <>
            <Link className="btn" href="/feed/cierre">Ver el cierre</Link>
            <Link className="btn pri" href="/feed/semana/generar">Generar semana</Link>
          </>
        }
      >
        {week.theme}
      </Head>

      <ErrorNote error={error} />
      {weeks.length > 1 ? (
        <nav className="fila" style={{ gap: 6 }} aria-label="Semanas">
          {weeks.map((x) => (
            <Link className={`tag ${x.id === week.id ? "azul" : ""}`} href={`/feed/semana?w=${x.startsOn.toISOString().slice(0, 10)}`} key={x.id}>
              {day(x.startsOn, { day: "numeric", month: "short" })}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <div className="plano" style={{ gap: 4 }}><span className="rot">Acción que se mide</span><span>{week.measurableAction}</span></div>
        {week.baseline ? <div className="plano" style={{ gap: 4 }}><span className="rot">Referencia</span><span>{week.baseline}</span></div> : null}
        {week.loopSummary ? <div className="plano" style={{ gap: 4 }}><span className="rot">Loop de la semana</span><span>{week.loopSummary}</span></div> : null}
      </div>

      <div className="caja">
        <div className="grid" style={{ gridTemplateColumns: "repeat(6, minmax(158px, 1fr))", gap: 12, minWidth: 1000, alignItems: "start" }}>
          {FEED_STAGES.map((stage) => {
            const pieces = week.pieces.filter((p) => stageFor(gateState(p)) === stage);
            return (
              <section className="col" key={stage}>
                <div className="colh"><span className="rot">{STAGE_LABEL[stage]}</span><span className="mono mute">{pieces.length}</span></div>
                {pieces.length === 0 ? <p className="mute" style={{ margin: 0, fontSize: 13 }}>{STAGE_EMPTY[stage]}</p> : null}
                {pieces.map((p) => {
                  const gate = nextGate(gateState(p));
                  return (
                    <Link className="tj" href={`/feed/pieza/${p.id}`} key={p.id}>
                      {p.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumbnailUrl} alt="" style={{ width: "100%", aspectRatio: "9/10", objectFit: "cover", borderRadius: 2, display: "block" }} />
                      ) : null}
                      <span className="rot">{day(p.publishOn, { weekday: "short", day: "numeric" })} · {FORMAT_LABEL[p.format]}</span>
                      <b>{p.title}</b>
                      {p.assigneeName || p.producedBy ? <span className="mute" style={{ fontSize: 12 }}>{p.assigneeName ?? "Estudio"}</span> : null}
                      {p.comments.length > 0 ? <span className="mute" style={{ fontSize: 12 }}>{p.comments.length} del cliente</span> : null}
                      {p.blockedBy ? <span className="tag freno">{p.blockedBy}</span>
                        : stage !== "GUION" && stage !== "PUBLICADA" && gate ? <span className="tag azul">{GATE_LABEL[gate]}</span>
                        : null}
                    </Link>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>

      <details>
        <summary className="mute" style={{ cursor: "pointer", fontSize: 13 }}>Borrar esta semana</summary>
        <form action={deleteWeekAction} className="fila" style={{ gap: 10, marginTop: 8, alignItems: "center" }}>
          <input type="hidden" name="weekId" value={week.id} />
          <span className="sub" style={{ fontSize: 13 }}>Borra sus {week.pieces.length} piezas. No se puede deshacer.</span>
          <button className="btn" type="submit">Borrar</button>
        </form>
      </details>
    </>
  );
}
