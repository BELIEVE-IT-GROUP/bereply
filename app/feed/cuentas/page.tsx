import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { recentReels } from "@/lib/feed/service";
import { chooseAccountAction } from "../actions";
import { day, Head } from "../ui";

export default async function CuentasPage() {
  const { accounts, account } = await feedContext();
  const filas = await Promise.all(
    accounts.map(async (a) => ({
      a,
      reels: (await recentReels(a.id)).length,
      perfil: await prisma.feedBrandProfile.findUnique({ where: { instagramAccountId: a.id }, select: { id: true } }),
    }))
  );

  return (
    <>
      <Head
        eye="Instagram, por la API oficial de Meta"
        actions={<a className="btn pri" href="/api/instagram/connect">Conectar Instagram</a>}
      >
        {accounts.length === 1 ? "Una cuenta conectada" : `${accounts.length} cuentas conectadas`}
      </Head>

      <section className="plano">
        <div className="caja">
          <table className="tb">
            <thead><tr><th>Cuenta</th><th>Marca en Maasy</th><th>Métricas</th><th>Arranque</th><th>Token vence</th><th></th></tr></thead>
            <tbody>
              {filas.map(({ a, reels, perfil }) => (
                <tr key={a.id}>
                  <td className="n">@{a.username}</td>
                  <td>{a.maasyProjectId ? <span className="tag ok">Vinculada</span> : <span className="tag">Por vincular</span>}</td>
                  <td>{reels > 0 ? "Entran" : <span className="mute">Sin leer</span>}</td>
                  <td>{perfil ? <span className="tag ok">Hecho</span> : <span className="tag">Falta</span>}</td>
                  <td className="n">{a.tokenExpiresAt ? day(a.tokenExpiresAt, { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                  <td>
                    {a.id === account?.id ? <span className="tag ok">En uso</span> : (
                      <form action={chooseAccountAction}>
                        <input type="hidden" name="accountId" value={a.id} />
                        <button className="btn" type="submit">Usar esta</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 28, alignItems: "start" }}>
        <section className="card">
          <h2 className="s">Cuentas que opera Believe</h2>
          <div className="pasos">
            <div className="paso"><b>1. Invitar</b><small>En el panel de Meta</small></div>
            <div className="paso"><b>2. Aceptar</b><small>En Instagram web</small></div>
            <div className="paso"><b>3. Conectar</b><small>Aquí</small></div>
          </div>
          <p className="sub" style={{ fontSize: 13 }}>Funciona hoy, con métricas completas. La invitación se hace como Evaluador de Instagram.</p>
        </section>
        <section className="card">
          <h2 className="s">Clientes que se conectan solos</h2>
          <div className="fila" style={{ gap: 8, alignItems: "center" }}><span className="tag freno">Depende de Meta</span></div>
          <p className="sub" style={{ fontSize: 13 }}>El App Review en curso no incluye métricas. Hay que pedir ese permiso aparte antes de abrir esta opción.</p>
        </section>
      </div>
    </>
  );
}
