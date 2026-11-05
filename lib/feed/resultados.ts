/**
 * Lo que rindió cada anuncio, leído de BeAds una vez por hora. BeAds mide; aquí no se
 * recalcula nada, solo se une con la pieza para aprender qué ángulo gana.
 */
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { median } from "./insights";

const filaSchema = z.object({
  maas2_asset_id: z.string().nullish(),
  befeed_piece_id: z.string().nullish(),
  anuncio_id: z.string(),
  nombre: z.string().nullish(),
  objetivo: z.string().nullish(),
  titular: z.string().nullish(),
  mensaje: z.string().nullish(),
  campana: z.string().nullish(),
  formato: z.string().nullish(),
  estado: z.string().nullish(),
  moneda: z.string(),
  gasto: z.number().default(0),
  impresiones: z.number().default(0),
  resultados: z.number().default(0),
  costo_por_resultado: z.number().nullish(),
  frecuencia: z.number().nullish(),
  fatiga: z.boolean().default(false),
  ultimo_dato: z.string().nullish(),
});
const respuestaSchema = z.object({ piezas: z.array(filaSchema) });

const DIAS = 90;

export async function syncAdResults() {
  const key = process.env.BEADS_BEFEED_KEY;
  if (!key) return { skipped: "sin llave de BeAds" };
  const base = (process.env.BEADS_BEFEED_URL ?? "https://ads.believe-global.com").replace(/\/$/, "");
  const accounts = await prisma.instagramAccount.findMany({ where: { maas2ProjectId: { not: null } }, select: { id: true, username: true, maas2ProjectId: true } });
  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString().slice(0, 10);
  let filas = 0;
  for (const account of accounts) {
    const res = await fetch(`${base}/api/v1/befeed/resultados?maas2_proyecto_id=${account.maas2ProjectId}&desde=${desde}`, {
      headers: { "X-Beads-Befeed-Key": key },
      signal: AbortSignal.timeout(30_000),
    });
    // Una marca sin mandato o vínculo no tiene resultados: no frena a las demás.
    if (res.status === 404 || res.status === 422) continue;
    if (!res.ok) throw new Error(`BeAds respondió ${res.status} en @${account.username}.`);
    const { piezas } = respuestaSchema.parse(await res.json());
    for (const p of piezas) {
      const data = {
        instagramAccountId: account.id,
        maasAssetId: p.maas2_asset_id ?? null,
        befeedPieceId: p.befeed_piece_id ?? null,
        nombre: p.nombre ?? null,
        objetivo: p.objetivo ?? null,
        titular: p.titular ?? null,
        mensaje: p.mensaje ?? null,
        campana: p.campana ?? null,
        formato: p.formato ?? null,
        estado: p.estado ?? null,
        moneda: p.moneda,
        gasto: p.gasto,
        impresiones: Math.round(p.impresiones),
        resultados: Math.round(p.resultados),
        costoPorResultado: p.costo_por_resultado ?? null,
        frecuencia: p.frecuencia ?? null,
        fatiga: p.fatiga,
        ultimoDato: p.ultimo_dato ?? null,
        syncedAt: new Date(),
      };
      await prisma.feedAdResult.upsert({ where: { anuncioId: p.anuncio_id }, update: data, create: { anuncioId: p.anuncio_id, ...data } });
      filas += 1;
    }
  }
  return { filas };
}

export type AdRow = { moneda: string; objetivo?: string | null; resultados: number; gasto: number; costoPorResultado: number | null };

const MIN_RESULTADOS = 10;
const FACTOR_GANADOR = 0.7;

/**
 * Un ganador cuesta menos del 70 % de la mediana de la propia marca, con al menos 10 resultados.
 * Se compara solo dentro de la misma moneda y el mismo objetivo: un clic y un lead no cuestan lo mismo.
 */
export function adWinners<T extends AdRow>(rows: T[]) {
  const validas = rows.filter((r) => r.resultados >= MIN_RESULTADOS && r.costoPorResultado != null);
  return validas.filter((r) => {
    const mismas = validas.filter((o) => o.moneda === r.moneda && (o.objetivo ?? null) === (r.objetivo ?? null));
    const mediana = median(mismas.map((o) => o.costoPorResultado));
    return mismas.length >= 3 && mediana != null && (r.costoPorResultado as number) < mediana * FACTOR_GANADOR;
  });
}

/** Los ganadores de una marca con el título de su pieza, para Ideas y para el generador. */
export async function adWinnersOf(accountId: string) {
  const rows = await prisma.feedAdResult.findMany({ where: { instagramAccountId: accountId } });
  const top = adWinners(rows);
  const assets = top.map((t) => t.maasAssetId).filter((a): a is string => Boolean(a));
  const piezas = assets.length ? await prisma.feedPiece.findMany({ where: { maasAssetId: { in: assets } }, select: { id: true, maasAssetId: true, title: true, ad: true } }) : [];
  return top.map((r) => {
    const pieza = piezas.find((p) => p.maasAssetId === r.maasAssetId);
    return { ...r, pieceId: pieza?.id ?? null, titulo: (pieza?.ad as { titular?: string } | null)?.titular ?? pieza?.title ?? r.titular ?? r.nombre ?? r.campana ?? "Anuncio" };
  });
}
