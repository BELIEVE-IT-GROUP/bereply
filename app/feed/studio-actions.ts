"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { planFromScript, suggestVisuals, type ScriptRow } from "@/lib/feed/draft-ficha";
import { fichaSchema, reelsPerDay } from "@/lib/feed/ficha";
import { logEvent } from "@/lib/feed/service";
import { assertCanProduce, GateError } from "@/lib/feed/stages";

const VOZ_POR_DEFECTO = { id: "EXAVITQu4vr4xnSDxMaL", tag: "[Colombian Spanish accent, from Bogotá] [warm, confident]", velocidad: 1 };
const ESTILO_VIDEO = "Cinematic commercial, smooth stabilized camera, natural motion. No text appears anywhere.";
const NEGATIVO = "text, letters, numbers, logo, watermark, morphing, melting, deformed hands, extra fingers, extra people appearing, flicker, jitter";

const back = (pieceId: string, error?: string) =>
  redirect(`/feed/estudio/${pieceId}${error ? `?error=${encodeURIComponent(error)}` : ""}`);

/** Un solo trabajo a la vez por pieza: cambiar de etapa solo se permite si el trabajo no está corriendo. */
async function requeue(form: FormData, step: string, action: string, detail?: string) {
  const { workspaceId, actor } = await feedContext();
  const pieceId = String(form.get("pieceId") ?? "");
  const piece = await prisma.feedPiece.findFirst({ where: { id: pieceId, week: { workspaceId } }, select: { id: true } });
  if (!piece) return;
  const { count } = await prisma.feedReelJob.updateMany({
    where: { pieceId, status: { in: ["ESPERA_REVISION", "LISTO", "FALLO"] } },
    data: { step, status: "EN_COLA", log: null },
  });
  if (count > 0) await logEvent(workspaceId, actor, action, { pieceId, detail });
  revalidatePath(`/feed/estudio/${pieceId}`);
}

export async function continueJobAction(form: FormData) {
  await requeue(form, "clips", "aprobar_cuadros");
}

export async function rebuildJobAction(form: FormData) {
  await requeue(form, "armar", "volver_a_armar");
}

/** Repite la etapa que falló. Lo que ya se pagó sigue en la carpeta del trabajo y no se vuelve a pagar. */
export async function retryJobAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  const pieceId = String(form.get("pieceId") ?? "");
  const { count } = await prisma.feedReelJob.updateMany({
    where: { pieceId, status: "FALLO", piece: { week: { workspaceId } } },
    data: { status: "EN_COLA", log: null },
  });
  if (count > 0) await logEvent(workspaceId, actor, "reintentar_reel", { pieceId });
  revalidatePath(`/feed/estudio/${pieceId}`);
}

export async function redoPlanAction(form: FormData) {
  const plan = String(form.get("plan") ?? "");
  await requeue(form, `rehacer:${plan}`, "rehacer_plano", plan);
}

/** Lleva el guion al estudio: arma el borrador de la ficha. Todavía no gasta nada. */
export async function sendToStudioAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  const pieceId = String(form.get("pieceId") ?? "");
  const piece = await prisma.feedPiece.findFirst({
    where: { id: pieceId, week: { workspaceId } },
    include: { job: true, week: { include: { instagramAccount: { include: { feedProfile: true } } } } },
  });
  if (!piece) return;
  if (piece.job) back(pieceId);

  let plan: ReturnType<typeof planFromScript>;
  try {
    plan = planFromScript((piece.script ?? []) as ScriptRow[]);
  } catch (error) {
    if (!(error instanceof GateError)) throw error;
    return redirect(`/feed/pieza/${pieceId}?error=${encodeURIComponent(error.message)}`);
  }

  const account = piece.week.instagramAccount;
  const profile = (account.feedProfile?.profile ?? {}) as { logo_url?: string; accent?: string; background?: string };
  const visuales = await suggestVisuals(piece.title, plan.planos, account.name ?? account.username);
  const ficha = {
    logo_url: profile.logo_url ?? "",
    acento: profile.accent ?? "#00A9E0",
    fondo: profile.background ?? "#0B1438",
    musica_prompt: visuales.musica_prompt,
    voz: { ...VOZ_POR_DEFECTO, texto: plan.voz },
    estilo_cuadro: visuales.estilo_cuadro,
    estilo_video: ESTILO_VIDEO,
    negativo: NEGATIVO,
    planos: visuales.planos,
    cierre: { url: plan.web },
  };
  await prisma.$transaction([
    prisma.feedPiece.update({ where: { id: pieceId }, data: { needsVideo: true } }),
    prisma.feedReelJob.create({ data: { pieceId, ficha: ficha as Prisma.InputJsonValue, step: "ficha", status: "BORRADOR" } }),
  ]);
  await logEvent(workspaceId, actor, "enviar_a_estudio", { pieceId, detail: piece.title });
  revalidatePath("/feed", "layout");
  back(pieceId);
}

type DraftFicha = {
  voz?: Record<string, unknown>;
  cierre?: Record<string, unknown>;
  planos?: Array<Record<string, unknown> & { id: string }>;
} & Record<string, unknown>;

/** Guarda lo que se editó en el formulario. Con el botón Producir, además valida y pone el trabajo en cola. */
export async function saveFichaAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  const pieceId = String(form.get("pieceId") ?? "");
  const piece = await prisma.feedPiece.findFirst({ where: { id: pieceId, week: { workspaceId } }, include: { job: true } });
  if (!piece?.job) return;
  if (piece.job.status !== "BORRADOR") back(pieceId, "Ya está en producción: la ficha no se puede editar.");

  const texto = (key: string) => String(form.get(key) ?? "").trim();
  const actual = piece.job.ficha as DraftFicha;
  const ficha: DraftFicha = {
    ...actual,
    logo_url: texto("logo_url"),
    acento: texto("acento"),
    fondo: texto("fondo"),
    musica_prompt: texto("musica_prompt"),
    estilo_cuadro: texto("estilo_cuadro"),
    voz: { ...actual.voz, texto: texto("voz") },
    cierre: { ...actual.cierre, url: texto("cierre") },
    planos: (actual.planos ?? []).map((p) => ({ ...p, cuadro: texto(`cuadro:${p.id}`), movimiento: texto(`movimiento:${p.id}`) })),
  };
  await prisma.feedReelJob.update({ where: { id: piece.job.id }, data: { ficha: ficha as Prisma.InputJsonValue } });

  if (!form.get("producir")) {
    revalidatePath(`/feed/estudio/${pieceId}`);
    back(pieceId);
  }

  const parsed = fichaSchema.safeParse(ficha);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const nombre = issue.path[0] === "logo_url" ? "el logo" : issue.path.join(" ") || "la ficha";
    back(pieceId, `Falta revisar ${nombre}: ${issue.message}`);
    return;
  }
  try {
    assertCanProduce(piece);
  } catch (error) {
    if (!(error instanceof GateError)) throw error;
    back(pieceId, error.message);
  }
  const hoy = await prisma.feedEvent.count({
    where: { workspaceId, action: { in: ["pedir_reel", "producir_reel"] }, outcome: "ok", createdAt: { gte: new Date(Date.now() - 86_400_000) } },
  });
  if (hoy >= reelsPerDay()) back(pieceId, `Se alcanzó el tope de ${reelsPerDay()} Reels por día.`);

  await prisma.feedReelJob.update({
    where: { id: piece.job.id },
    data: { ficha: parsed.data as unknown as Prisma.InputJsonValue, step: "voz", status: "EN_COLA", log: null },
  });
  await logEvent(workspaceId, actor, "producir_reel", { pieceId, detail: piece.title });
  revalidatePath("/feed", "layout");
  back(pieceId);
}
