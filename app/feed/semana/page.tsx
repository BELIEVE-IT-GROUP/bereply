import Link from "next/link";
import { feedContext } from "@/lib/feed/context";
import { currentWeek, gateState, stageFor } from "@/lib/feed/service";
import { FEED_STAGES, nextGate } from "@/lib/feed/stages";
import { FORMAT_LABEL, GATE_LABEL, STAGE_EMPTY, STAGE_LABEL } from "../gates";
import { day, Head, NoAccount } from "../ui";

export default async function SemanaPage() {
  const { account } = await feedContext();
  if (!account) return <NoAccount />;
  const week = await currentWeek(account.id);

  if (!week) {
    return (
      <>
        <Head eye={`@${account.username}`}>Todavía no hay <i>semana</i></Head>
        <p className="aviso">Pídesela al agente: escribe la semana con la estrategia de la marca y la deja aquí, en guion. Herramienta <span className="mono">crear_semana</span>.</p>
      </>
    );
  }

  return (
    <>
      <Head
        eye={`@${account.username} · ${day(week.startsOn, { day: "numeric", month: "long" })} a ${day(week.endsOn, { day: "numeric", month: "long" })}`}
        actions={<Link className="btn" href="/feed/cierre">Ver el cierre</Link>}
      >
        {week.theme}
      </Head>

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
    </>
  );
}
