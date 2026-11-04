/**
 * Las operaciones de BeFeed. Las usan igual las pantallas y el MCP: así el agente
 * pasa por las mismas reglas que una persona y todo queda en el registro.
 */
import type { FeedFormat, FeedPiece, Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { getMediaInsights, getUserMedia, PermissionError } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import { videoUrlSchema } from "./ficha";
import { pushPiece } from "./maas2";
import { makePoster } from "./media";
import {
  approve,
  GateError,
  markPublished,
  requestChanges,
  stageFor,
  submitForReview,
  type Actor,
  type Gate,
  type PieceGateState,
} from "./stages";

const REEL_METRICS = ["views", "reach", "saved", "shares", "ig_reels_avg_watch_time", "reels_skip_rate"];
const POST_METRICS = ["views", "reach", "saved", "shares"];
const MEDIA_TO_READ = 30;

export async function logEvent(
  workspaceId: string,
  actor: Actor,
  action: string,
  extra: { pieceId?: string; detail?: string; outcome?: string; costUsd?: number } = {}
) {
  await prisma.feedEvent.create({
    data: { workspaceId, actorType: actor.type, actorName: actor.name, action, ...extra },
  });
}

/** Copia al tablero sin frenar lo que estaba haciendo la persona. El ciclo de 5 minutos reintenta. */
export async function pushQuietly(pieceId: string, workspaceId: string) {
  try {
    await pushPiece(pieceId);
  } catch (error) {
    await logEvent(workspaceId, { type: "agent", name: "Tablero" }, "copiar_al_tablero", {
      pieceId,
      detail: error instanceof Error ? error.message.slice(0, 200) : "falló",
      outcome: "error",
    });
  }
}

export function gateState(p: FeedPiece): PieceGateState {
  return {
    stage: p.stage,
    gatesPassed: p.gatesPassed,
    needsVideo: p.needsVideo,
    linterClean: p.linterClean,
    blockedBy: p.blockedBy,
    videoUrl: p.videoUrl,
    instagramMediaId: p.instagramMediaId,
  };
}

export async function accountByUsername(workspaceId: string, username: string) {
  const account = await prisma.instagramAccount.findFirst({
    where: { workspaceId, username: username.replace(/^@/, "") },
  });
  if (!account) throw new GateError(`La cuenta ${username} no está conectada en este espacio.`);
  return account;
}

async function pieceInWorkspace(workspaceId: string, pieceId: string) {
  const piece = await prisma.feedPiece.findFirst({ where: { id: pieceId, week: { workspaceId } } });
  if (!piece) throw new GateError("Esa pieza no existe en este espacio.");
  return piece;
}

/** Aplica una transición, guarda el estado que resulta y la deja en el registro. */
async function transition(
  workspaceId: string,
  pieceId: string,
  actor: Actor,
  action: string,
  fn: (state: PieceGateState) => PieceGateState,
  detail?: string
) {
  const piece = await pieceInWorkspace(workspaceId, pieceId);
  let next: PieceGateState;
  try {
    next = fn(gateState(piece));
  } catch (error) {
    if (error instanceof GateError) {
      await logEvent(workspaceId, actor, action, { pieceId, detail: error.message, outcome: "rechazado" });
    }
    throw error;
  }
  const updated = await prisma.feedPiece.update({
    where: { id: pieceId },
    data: { stage: next.stage, gatesPassed: next.gatesPassed, instagramMediaId: next.instagramMediaId },
  });
  await logEvent(workspaceId, actor, action, { pieceId, detail });
  await pushQuietly(pieceId, workspaceId);
  return updated;
}

export const submitPiece = (workspaceId: string, pieceId: string, actor: Actor) =>
  transition(workspaceId, pieceId, actor, "pasar_a_filtros", submitForReview);

export const approvePiece = (workspaceId: string, pieceId: string, gate: Gate, actor: Actor) =>
  transition(workspaceId, pieceId, actor, "aprobar", (s) => approve(s, gate, actor), gate);

export const requestPieceChanges = (workspaceId: string, pieceId: string, actor: Actor, note?: string) =>
  transition(workspaceId, pieceId, actor, "pedir_cambios", (s) => requestChanges(s, actor), note);

export const publishPiece = (workspaceId: string, pieceId: string, mediaId: string, actor: Actor) =>
  transition(workspaceId, pieceId, actor, "marcar_publicada", (s) => markPublished(s, mediaId, actor), mediaId);

export async function setBlocker(
  workspaceId: string,
  pieceId: string,
  actor: Actor,
  blockedBy: string | null,
  blockedReason: string | null
) {
  await pieceInWorkspace(workspaceId, pieceId);
  const updated = await prisma.feedPiece.update({ where: { id: pieceId }, data: { blockedBy, blockedReason } });
  await logEvent(workspaceId, actor, blockedBy ? "frenar_pieza" : "soltar_pieza", {
    pieceId,
    detail: blockedBy ? `${blockedBy}: ${blockedReason ?? ""}` : undefined,
  });
  return updated;
}

/**
 * Adjunta un MP4 hecho fuera del estudio, como el que edita Carol. Es otro video:
 * pasa por la puerta del MP4, aunque otro anterior ya estuviera aprobado.
 */
export async function attachVideo(workspaceId: string, pieceId: string, url: string, actor: Actor) {
  const parsed = videoUrlSchema.safeParse(url);
  if (!parsed.success) throw new GateError(parsed.error.issues[0].message);
  const piece = await pieceInWorkspace(workspaceId, pieceId);
  if (piece.instagramMediaId) throw new GateError("La pieza ya está publicada.");
  const updated = await prisma.feedPiece.update({
    where: { id: pieceId },
    data: {
      videoUrl: parsed.data,
      needsVideo: true,
      gatesPassed: piece.gatesPassed.filter((g) => g !== "MP4"),
      thumbnailUrl: (await makePoster(parsed.data, pieceId)) ?? piece.thumbnailUrl,
    },
  });
  await logEvent(workspaceId, actor, "adjuntar_video", { pieceId, detail: parsed.data });
  await pushQuietly(pieceId, workspaceId);
  return updated;
}

export type WeekInput = {
  username: string;
  startsOn: string;
  endsOn: string;
  theme: string;
  measurableAction: string;
  baseline?: string;
  loopSummary?: string;
};

export async function createWeek(workspaceId: string, input: WeekInput, actor: Actor) {
  const account = await accountByUsername(workspaceId, input.username);
  const startsOn = new Date(input.startsOn);
  const data = {
    endsOn: new Date(input.endsOn),
    theme: input.theme,
    measurableAction: input.measurableAction,
    baseline: input.baseline,
    loopSummary: input.loopSummary,
  };
  const week = await prisma.feedWeek.upsert({
    where: { instagramAccountId_startsOn: { instagramAccountId: account.id, startsOn } },
    update: data,
    create: { ...data, workspaceId, instagramAccountId: account.id, startsOn },
  });
  await logEvent(workspaceId, actor, "crear_semana", { detail: `@${account.username} ${input.startsOn}` });
  return week;
}

export type PieceInput = {
  weekId: string;
  position: number;
  publishOn: string;
  format: FeedFormat;
  title: string;
  drip?: string;
  firstThree?: string;
  hooks?: Array<{ score?: number; text: string; chosen?: boolean }>;
  script?: Array<{ time: string; voice: string; screen: string }>;
  caption?: string;
  stories?: string;
  measures?: string;
  needsVideo?: boolean;
  linterClean?: boolean;
  blockedBy?: string | null;
  blockedReason?: string | null;
};

/** Crea o reescribe una pieza. Lo que ya salió de guion no se reescribe: primero se piden cambios. */
export async function savePiece(workspaceId: string, input: PieceInput, actor: Actor) {
  const week = await prisma.feedWeek.findFirst({ where: { id: input.weekId, workspaceId } });
  if (!week) throw new GateError("Esa semana no existe en este espacio.");
  const existing = await prisma.feedPiece.findFirst({ where: { weekId: week.id, position: input.position } });
  if (existing && existing.stage !== "GUION") {
    const detail = "La pieza ya está en revisión: una persona tiene que pedir cambios antes de reescribirla.";
    await logEvent(workspaceId, actor, "guardar_pieza", { pieceId: existing.id, detail, outcome: "rechazado" });
    throw new GateError(detail);
  }
  const data = {
    publishOn: new Date(input.publishOn),
    format: input.format,
    title: input.title,
    drip: input.drip,
    firstThree: input.firstThree,
    hooks: (input.hooks ?? []) as Prisma.InputJsonValue,
    script: (input.script ?? []) as Prisma.InputJsonValue,
    caption: input.caption,
    stories: input.stories,
    measures: input.measures,
    needsVideo: input.needsVideo ?? false,
    linterClean: input.linterClean ?? false,
    blockedBy: input.blockedBy ?? null,
    blockedReason: input.blockedReason ?? null,
  };
  const piece = existing
    ? await prisma.feedPiece.update({ where: { id: existing.id }, data })
    : await prisma.feedPiece.create({ data: { ...data, weekId: week.id, position: input.position } });
  await logEvent(workspaceId, actor, "guardar_pieza", { pieceId: piece.id, detail: input.title });
  if (piece.maasAssetId) await pushQuietly(piece.id, workspaceId);
  return piece;
}

/** Quién hace la pieza: el Estudio o una persona del equipo. */
export async function assignPiece(
  workspaceId: string,
  pieceId: string,
  who: { producedBy: "ESTUDIO" | "DISENO"; assigneeId?: string | null; assigneeName?: string | null },
  actor: Actor
) {
  await pieceInWorkspace(workspaceId, pieceId);
  await prisma.feedPiece.update({
    where: { id: pieceId },
    data: { producedBy: who.producedBy, assigneeId: who.assigneeId ?? null, assigneeName: who.assigneeName ?? null },
  });
  await logEvent(workspaceId, actor, "asignar_pieza", { pieceId, detail: who.assigneeName ?? "Estudio" });
  await pushQuietly(pieceId, workspaceId);
}

/** Encola la generación de una semana. Lo hace el worker: tarda minutos. */
export async function requestWeek(
  workspaceId: string,
  input: { username: string; startsOn: string; endsOn: string; measurableAction: string; rawMaterial?: string | null },
  actor: Actor
) {
  const account = await accountByUsername(workspaceId, input.username);
  const startsOn = new Date(input.startsOn);
  const endsOn = new Date(input.endsOn);
  if (Number.isNaN(startsOn.getTime()) || Number.isNaN(endsOn.getTime()) || endsOn < startsOn) {
    throw new GateError("Revisa las fechas de la semana.");
  }
  const existente = await prisma.feedWeek.findUnique({
    where: { instagramAccountId_startsOn: { instagramAccountId: account.id, startsOn } },
    select: { _count: { select: { pieces: true } } },
  });
  if (existente && existente._count.pieces > 0) throw new GateError("Esa semana ya tiene piezas. Bórrala primero si quieres generarla de nuevo.");
  const enCurso = await prisma.feedWeekRequest.findFirst({
    where: { instagramAccountId: account.id, startsOn, status: { in: ["EN_COLA", "CORRIENDO"] } },
  });
  if (enCurso) throw new GateError("Esa semana ya se está generando.");
  const req = await prisma.feedWeekRequest.create({
    data: {
      instagramAccountId: account.id,
      startsOn,
      endsOn,
      measurableAction: input.measurableAction,
      rawMaterial: input.rawMaterial,
      requestedBy: actor.name,
    },
  });
  await logEvent(workspaceId, actor, "generar_semana", { detail: `@${account.username} ${input.startsOn}` });
  return req;
}

/** Borra una semana completa. Lo publicado o lo que ya vio el cliente no se borra desde aquí. */
export async function deleteWeek(workspaceId: string, weekId: string, actor: Actor) {
  const week = await prisma.feedWeek.findFirst({ where: { id: weekId, workspaceId }, include: { pieces: true, instagramAccount: { select: { username: true } } } });
  if (!week) throw new GateError("Esa semana no existe en este espacio.");
  if (week.pieces.some((p) => p.instagramMediaId)) throw new GateError("Tiene piezas publicadas: no se borra.");
  if (week.pieces.some((p) => p.maasAssetId)) throw new GateError("Tiene piezas en el tablero del cliente: quítalas primero allá.");
  await prisma.feedEvent.updateMany({ where: { pieceId: { in: week.pieces.map((p) => p.id) } }, data: { pieceId: null } });
  await prisma.feedWeek.delete({ where: { id: weekId } });
  await logEvent(workspaceId, actor, "borrar_semana", { detail: `@${week.instagramAccount.username} ${week.startsOn.toISOString().slice(0, 10)}: ${week.pieces.length} piezas` });
}

/** Trae de Meta las piezas recientes de una cuenta y sus métricas. Devuelve cuántas leyó. */
export async function refreshAccountMetrics(accountId: string): Promise<number> {
  const account = await prisma.instagramAccount.findUniqueOrThrow({ where: { id: accountId } });
  const token = decryptToken(account.accessToken);
  const media = await getUserMedia(token, MEDIA_TO_READ);
  let read = 0;
  for (const item of media) {
    const isReel = item.media_product_type === "REELS";
    let insights: Awaited<ReturnType<typeof getMediaInsights>> = {};
    try {
      insights = await getMediaInsights(token, item.id, isReel ? REEL_METRICS : POST_METRICS);
    } catch (error) {
      if (error instanceof PermissionError) throw error;
      // Una pieza sin métricas (historia vencida, muy reciente) no frena las demás.
    }
    const data = {
      productType: item.media_product_type ?? item.media_type,
      caption: item.caption ?? null,
      permalink: item.permalink ?? null,
      thumbnailUrl: item.thumbnail_url ?? item.media_url ?? null,
      publishedAt: new Date(item.timestamp),
      views: insights.views ?? null,
      reach: insights.reach ?? null,
      saved: insights.saved ?? null,
      shares: insights.shares ?? null,
      likes: item.like_count ?? null,
      comments: item.comments_count ?? null,
      avgWatchMs: insights.ig_reels_avg_watch_time ?? null,
      skipRate: insights.reels_skip_rate ?? null,
      capturedAt: new Date(),
    };
    await prisma.feedMediaMetric.upsert({
      where: { instagramMediaId: item.id },
      update: data,
      create: { ...data, instagramMediaId: item.id, instagramAccountId: accountId },
    });
    read += 1;
  }
  return read;
}

export async function recentReels(accountId: string, take = 8) {
  return prisma.feedMediaMetric.findMany({
    where: { instagramAccountId: accountId, productType: "REELS" },
    orderBy: { publishedAt: "desc" },
    take,
  });
}

/** La semana en curso, o la más reciente si ya no hay una en curso. */
export async function currentWeek(accountId: string) {
  const include = { pieces: { orderBy: { position: "asc" as const }, include: { comments: { orderBy: { createdAt: "asc" as const } } } }, closing: true };
  const today = new Date(new Date().toISOString().slice(0, 10));
  return (
    (await prisma.feedWeek.findFirst({
      where: { instagramAccountId: accountId, endsOn: { gte: today } },
      orderBy: { startsOn: "asc" },
      include,
    })) ??
    (await prisma.feedWeek.findFirst({
      where: { instagramAccountId: accountId },
      orderBy: { startsOn: "desc" },
      include,
    }))
  );
}

/** Una semana por su inicio, con lo mismo que trae currentWeek. */
export async function weekByStart(accountId: string, startsOn: string) {
  return prisma.feedWeek.findUnique({
    where: { instagramAccountId_startsOn: { instagramAccountId: accountId, startsOn: new Date(startsOn) } },
    include: { pieces: { orderBy: { position: "asc" }, include: { comments: { orderBy: { createdAt: "asc" } } } }, closing: true },
  });
}

export { stageFor };
