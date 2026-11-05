/**
 * Los pedidos de piezas que hace BeAds. Un pedido no gasta nada: aparece en Hoy y una
 * persona decide si se produce. La clave evita duplicados aunque la fatiga se detecte a diario.
 */
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { logEvent } from "./service";
import { GateError, stageFor, type PieceGateState } from "./stages";

export const pedidoSchema = z.object({
  clave: z.string().min(3).max(200),
  canal: z.literal("meta"),
  maas2_proyecto_id: z.uuid(),
  motivo: z.string().min(1).max(60),
  campana_id: z.string().max(60).nullish(),
  conjunto_id: z.string().max(60).nullish(),
  objetivo: z.string().max(300).nullish(),
  brief: z.string().min(1).max(4000),
  formatos: z.array(z.string().max(10)).max(4).default([]),
  versiones: z.number().int().min(1).max(10).default(1),
  para: z.iso.datetime({ offset: true }).nullish(),
  pedido_por: z.string().min(1).max(60),
});

export function authorizedKey(given: string | null, expected: string | undefined) {
  if (!expected) return false;
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type EstadoPedido = "RECIBIDO" | "EN_PRODUCCION" | "EN_CLIENTE" | "LISTO" | "RECHAZADO" | "CANCELADO";

/** El estado sale de sus piezas, no se guarda a mano: así no se contradice con el tablero. */
export function requestState(cerrado: string | null, pieces: PieceGateState[]): EstadoPedido {
  if (cerrado === "RECHAZADO" || cerrado === "CANCELADO") return cerrado;
  if (pieces.length === 0) return "RECIBIDO";
  const stages = pieces.map(stageFor);
  if (stages.every((s) => s === "LISTA" || s === "PUBLICADA")) return "LISTO";
  return stages.some((s) => s === "CLIENTE" || s === "VIDEO" || s === "LISTA") ? "EN_CLIENTE" : "EN_PRODUCCION";
}

const gate = (p: { stage: PieceGateState["stage"]; gatesPassed: string[]; needsVideo: boolean; linterClean: boolean; blockedBy: string | null; videoUrl: string | null; instagramMediaId: string | null; destination: string }): PieceGateState => p;

export async function requestView(clave: string) {
  const pedido = await prisma.feedAdRequest.findUnique({ where: { clave } });
  if (!pedido) return null;
  const piezas = await prisma.feedPiece.findMany({ where: { adRequestKey: clave } });
  return {
    id: pedido.id,
    estado: requestState(pedido.cerrado, piezas.map(gate)),
    piezas: piezas.map((p) => ({ maas2_asset_id: p.maasAssetId, stage: p.maasStage })),
    motivo_rechazo: pedido.motivoRechazo,
  };
}

/** Recibe un pedido. Repetir la clave devuelve el que ya existe. */
export async function receiveRequest(input: z.infer<typeof pedidoSchema>) {
  const existente = await requestView(input.clave);
  if (existente) return { creado: false, view: existente };
  const account = await prisma.instagramAccount.findFirst({ where: { maas2ProjectId: input.maas2_proyecto_id }, orderBy: { connectedAt: "asc" } });
  if (!account) return null;
  const pedido = await prisma.feedAdRequest.create({
    data: {
      clave: input.clave,
      workspaceId: account.workspaceId,
      instagramAccountId: account.id,
      canal: input.canal,
      motivo: input.motivo,
      campanaId: input.campana_id,
      conjuntoId: input.conjunto_id,
      objetivo: input.objetivo,
      brief: input.brief,
      formatos: input.formatos,
      versiones: input.versiones,
      para: input.para ? new Date(input.para) : null,
      pedidoPor: input.pedido_por,
    },
  });
  await logEvent(account.workspaceId, { type: "agent", name: "BeAds" }, "pedido_de_pieza", { detail: `@${account.username}: ${input.motivo}` });
  return { creado: true, view: { id: pedido.id, estado: "RECIBIDO" as EstadoPedido, piezas: [], motivo_rechazo: null } };
}

export async function closeRequest(workspaceId: string, id: string, cerrado: "RECHAZADO" | "CANCELADO", motivo: string | null, actor: { type: "person" | "agent"; name: string }) {
  if (cerrado === "RECHAZADO" && !motivo) throw new GateError("Di por qué se rechaza: BeAds lo lee.");
  const { count } = await prisma.feedAdRequest.updateMany({ where: { id, workspaceId }, data: { cerrado, motivoRechazo: motivo } });
  if (count === 0) throw new GateError("Ese pedido no existe en este espacio.");
  await logEvent(workspaceId, actor, "cerrar_pedido", { detail: `${cerrado}${motivo ? `: ${motivo}` : ""}` });
}
