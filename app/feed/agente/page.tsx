import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { TOOLS } from "@/lib/feed/mcp";
import { revokeTokenAction } from "../actions";
import { Head, moment } from "../ui";
import { TokenForm } from "./token-form";

const PERMISO: Record<string, { label: string; className: string }> = {
  marcas: { label: "Solo lee", className: "tag" },
  metricas: { label: "Solo lee", className: "tag" },
  marca: { label: "Solo lee", className: "tag" },
  estado_semana: { label: "Solo lee", className: "tag" },
  ultimo_cierre: { label: "Solo lee", className: "tag" },
  guardar_marca: { label: "Escribe borrador", className: "tag ok" },
  crear_semana: { label: "Escribe borrador", className: "tag ok" },
  guardar_pieza: { label: "Escribe borrador", className: "tag ok" },
  pasar_a_filtros: { label: "Pide revisión", className: "tag ok" },
  frenar_pieza: { label: "Escribe borrador", className: "tag ok" },
  adjuntar_video: { label: "Escribe borrador", className: "tag ok" },
  pedir_reel: { label: "Gasta dinero", className: "tag azul" },
  generar_semana: { label: "Gasta dinero", className: "tag azul" },
  asignar_pieza: { label: "Escribe borrador", className: "tag ok" },
  metodo: { label: "Solo lee", className: "tag" },
  crear_pieza_de_pauta: { label: "Escribe borrador", className: "tag ok" },
  guardar_anuncio: { label: "Escribe borrador", className: "tag ok" },
  pedidos: { label: "Solo lee", className: "tag" },
};

export default async function AgentePage() {
  const { workspaceId } = await feedContext();
  const [tokens, eventos, skills] = await Promise.all([
    prisma.feedAgentToken.findMany({ where: { workspaceId, revokedAt: null }, orderBy: { createdAt: "asc" } }),
    prisma.feedEvent.findMany({ where: { workspaceId, actorType: "agent" }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.feedSkillVersion.findMany({ orderBy: { name: "asc" } }),
  ]);
  const url = `${(process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "")}/api/mcp`;

  return (
    <>
      <Head back={{ href: "/feed", label: "Hoy" }} eye="Claude o George, con el mismo motor">
        El agente propone. <i>La puerta la abres tú</i>
      </Head>

      <div className="dos">
        <section className="card">
          <h2 className="s">Conéctalo una vez</h2>
          <TokenForm url={url} />
          <p className="sub" style={{ fontSize: 13 }}>Cada acceso firma lo que hace. Nadie instala llaves ni herramientas en su Mac.</p>
        </section>
        <section className="plano">
          <h2 className="s">Quién tiene acceso</h2>
          {tokens.length === 0 ? <p className="sub">Nadie todavía.</p> : null}
          <div className="lista">
            {tokens.map((t) => (
              <div key={t.id}>
                <span style={{ flex: "1 1 200px" }}>{t.label}<br /><span className="mute" style={{ fontSize: 13 }}>{t.lastUsedAt ? `Lo usó ${moment(t.lastUsedAt)}` : "Sin usar"}</span></span>
                <form action={revokeTokenAction}><input type="hidden" name="id" value={t.id} /><button className="btn" type="submit">Revocar</button></form>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="plano">
        <h2 className="s">Con qué método trabaja</h2>
        {skills.length === 0 ? <p className="sub">Todavía no ha llegado ningún skill.</p> : null}
        <div className="lista">
          {skills.map((s) => (
            <div key={s.name}>
              <span style={{ flex: "1 1 200px" }}>{s.name}<br /><span className="mute" style={{ fontSize: 13 }}>Se actualizó {moment(s.syncedAt)}</span></span>
              <span className="tag ok">{s.version}</span>
              <span className="mono mute">{s.sha.slice(0, 7)}</span>
            </div>
          ))}
        </div>
        <p className="sub" style={{ fontSize: 13 }}>Cada mejora que llega a GitHub entra aquí sola en cerca de un minuto.</p>
      </section>

      <section className="plano">
        <h2 className="s">Qué puede hacer</h2>
        <div className="caja">
          <table className="tb">
            <thead><tr><th>Herramienta</th><th>Para qué</th><th>Permiso</th></tr></thead>
            <tbody>
              {Object.entries(TOOLS).map(([name, t]) => (
                <tr key={name}>
                  <td className="n">{name}</td>
                  <td>{t.description.split(". ")[0].replace(/\.$/, "")}</td>
                  <td><span className={PERMISO[name]?.className ?? "tag"}>{PERMISO[name]?.label ?? "—"}</span></td>
                </tr>
              ))}
              <tr><td className="n">aprobar · publicar</td><td>Abrir una puerta o publicar en Instagram</td><td><span className="tag freno">No existen para el agente</span></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="plano">
        <h2 className="s">Todo lo que hizo queda aquí</h2>
        {eventos.length === 0 ? <p className="sub">Todavía no ha hecho nada.</p> : null}
        <div className="lista">
          {eventos.map((e) => (
            <div key={e.id}>
              <span className="mono mute" style={{ width: 120 }}>{moment(e.createdAt)}</span>
              <span style={{ flex: "1 1 300px" }}>{e.actorName} · <span className="mono">{e.action}</span>{e.detail ? ` ${e.detail}` : ""}</span>
              {e.outcome !== "ok" ? <span className="tag freno">{e.outcome}</span> : null}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
