import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { createAdPieceAction } from "../../actions";
import { AnuncioFields } from "../../anuncio-form";
import { ErrorNote, Head, NoAccount } from "../../ui";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function NuevaPiezaPage({ searchParams }: { searchParams: Promise<{ error?: string; dia?: string; pedido?: string }> }) {
  const { error, dia, pedido: pedidoId } = await searchParams;
  const { account, workspaceId } = await feedContext();
  if (!account) return <NoAccount />;
  const pedido = pedidoId
    ? await prisma.feedAdRequest.findFirst({ where: { id: pedidoId, workspaceId }, include: { instagramAccount: { select: { username: true } } } })
    : null;
  const desde = pedido?.para ? iso(pedido.para) : dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : iso(new Date());
  const hasta = iso(new Date(new Date(desde).getTime() + 6 * 86_400_000));
  return (
    <>
      <Head back={{ href: "/feed/semana", label: "Semana" }} eye={`@${pedido?.instagramAccount.username ?? account.username}`}>Nueva pieza de <i>pauta</i></Head>
      <ErrorNote error={error} />
      {pedido ? <p className="aviso">Pedido de BeAds ({pedido.motivo}, {pedido.versiones} {pedido.versiones === 1 ? "versión" : "versiones"}): {pedido.brief}</p> : null}
      <form action={createAdPieceAction} className="card" style={{ maxWidth: 620 }}>
        {pedido ? <input type="hidden" name="pedido" value={pedido.id} /> : null}
        <label className="rot" htmlFor="title">Nombre de la pieza</label>
        <input className="input" id="title" name="title" required />
        <label className="rot" htmlFor="format">Formato</label>
        <select className="input" id="format" name="format" defaultValue="REEL">
          <option value="REEL">Reel</option>
          <option value="POST">Post</option>
          <option value="CARRUSEL">Carrusel</option>
          <option value="HISTORIAS">Historias</option>
        </select>
        <label className="rot" htmlFor="dia">Día de entrega</label>
        <input className="input" id="dia" name="dia" type="date" required defaultValue={desde} />
        <AnuncioFields desde={desde} hasta={hasta} />
        <p className="sub" style={{ fontSize: 13 }}>Lo aprueba Daniela y después el cliente, en el tablero. BeAds solo la toma cuando el cliente la aprueba.</p>
        <button className="btn pri" type="submit">Crear pieza de pauta</button>
      </form>
    </>
  );
}
