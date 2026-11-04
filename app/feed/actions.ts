"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { ACCOUNT_COOKIE, feedContext } from "@/lib/feed/context";
import {
  approvePiece,
  attachVideo,
  logEvent,
  publishPiece,
  refreshAccountMetrics,
  requestPieceChanges,
  savePiece,
  setBlocker,
  submitPiece,
} from "@/lib/feed/service";
import { GATES, GateError, type Gate } from "@/lib/feed/stages";
import { hashAgentToken, newAgentToken } from "@/lib/feed/tokens";

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

/** Las reglas de negocio vuelven a la pantalla como aviso, sin página de error. */
async function onPiece(form: FormData, fn: (pieceId: string) => Promise<unknown>) {
  const pieceId = text(form, "pieceId") ?? "";
  let error = "";
  try {
    await fn(pieceId);
  } catch (e) {
    if (!(e instanceof GateError)) throw e;
    error = e.message;
  }
  revalidatePath("/feed", "layout");
  redirect(`/feed/pieza/${pieceId}${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

export async function submitAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  await onPiece(form, (id) => submitPiece(workspaceId, id, actor));
}

export async function approveAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  const gate = text(form, "gate") as Gate;
  if (!GATES.includes(gate)) throw new Error("Puerta desconocida");
  await onPiece(form, (id) => approvePiece(workspaceId, id, gate, actor));
}

export async function changesAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  await onPiece(form, (id) => requestPieceChanges(workspaceId, id, actor, text(form, "note") ?? undefined));
}

export async function blockAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  await onPiece(form, (id) => setBlocker(workspaceId, id, actor, text(form, "who"), text(form, "reason")));
}

export async function attachVideoAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  await onPiece(form, (id) => attachVideo(workspaceId, id, text(form, "url") ?? "", actor));
}

export async function publishAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  await onPiece(form, (id) => publishPiece(workspaceId, id, text(form, "mediaId") ?? "", actor));
}

export async function chooseAccountAction(form: FormData) {
  const { accounts } = await feedContext();
  const id = text(form, "accountId");
  if (!accounts.some((a) => a.id === id)) return;
  (await cookies()).set(ACCOUNT_COOKIE, id as string, { httpOnly: true, sameSite: "lax", path: "/feed", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/feed", "layout");
}

export async function refreshMetricsAction() {
  const { account, workspaceId, actor } = await feedContext();
  if (!account) return;
  const read = await refreshAccountMetrics(account.id);
  await logEvent(workspaceId, actor, "refrescar_metricas", { detail: `@${account.username}: ${read} piezas` });
  revalidatePath("/feed", "layout");
}

/** Convierte un ganador en una pieza nueva de la semana en curso, en guion. */
export async function pieceFromWinnerAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  const weekId = text(form, "weekId") ?? "";
  const week = await prisma.feedWeek.findFirst({
    where: { id: weekId, workspaceId },
    include: { pieces: { select: { position: true } } },
  });
  if (!week) return;
  const position = Math.max(0, ...week.pieces.map((p) => p.position)) + 1;
  const piece = await savePiece(
    workspaceId,
    {
      weekId,
      position,
      publishOn: week.endsOn.toISOString().slice(0, 10),
      format: "REEL",
      title: `Nueva versión: ${text(form, "title") ?? "ganador"}`,
      needsVideo: false,
      linterClean: false,
    },
    actor
  );
  revalidatePath("/feed", "layout");
  redirect(`/feed/pieza/${piece.id}`);
}

export async function addReferenceAction(form: FormData) {
  const { account, workspaceId, actor } = await feedContext();
  const username = text(form, "username")?.replace(/^@/, "");
  if (!account || !username) return;
  await prisma.feedReference.upsert({
    where: { instagramAccountId_username: { instagramAccountId: account.id, username } },
    update: { note: text(form, "note") },
    create: { workspaceId, instagramAccountId: account.id, username, note: text(form, "note") },
  });
  await logEvent(workspaceId, actor, "agregar_referencia", { detail: username });
  revalidatePath("/feed/ideas");
}

export async function removeReferenceAction(form: FormData) {
  const { workspaceId } = await feedContext();
  await prisma.feedReference.deleteMany({ where: { id: text(form, "id") ?? "", workspaceId } });
  revalidatePath("/feed/ideas");
}

export async function saveClosingAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  const weekId = text(form, "weekId") ?? "";
  const week = await prisma.feedWeek.findFirst({ where: { id: weekId, workspaceId } });
  if (!week) return;
  const data = {
    value: text(form, "value"),
    repeat: text(form, "repeat"),
    drop: text(form, "drop"),
    pending: text(form, "pending"),
    closedAt: form.get("close") ? new Date() : undefined,
  };
  await prisma.feedWeekClosing.upsert({ where: { weekId }, update: data, create: { ...data, weekId } });
  for (const [key, value] of form.entries()) {
    if (key.startsWith("repite:") && typeof value === "string") {
      await prisma.feedPiece.updateMany({
        where: { id: key.slice(7), weekId },
        data: { repeatDecision: value || null },
      });
    }
  }
  await logEvent(workspaceId, actor, form.get("close") ? "cerrar_semana" : "guardar_cierre");
  revalidatePath("/feed", "layout");
}

export type TokenState = { token?: string; error?: string };

export async function createTokenAction(_: TokenState, form: FormData): Promise<TokenState> {
  const { workspaceId, actor } = await feedContext();
  const label = text(form, "label");
  if (!label) return { error: "Ponle un nombre: quién lo va a usar." };
  const token = newAgentToken();
  await prisma.feedAgentToken.create({ data: { workspaceId, label, tokenHash: hashAgentToken(token) } });
  await logEvent(workspaceId, actor, "crear_acceso", { detail: label });
  revalidatePath("/feed/agente");
  return { token };
}

export async function revokeTokenAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  const id = text(form, "id") ?? "";
  await prisma.feedAgentToken.updateMany({ where: { id, workspaceId }, data: { revokedAt: new Date() } });
  await logEvent(workspaceId, actor, "revocar_acceso");
  revalidatePath("/feed/agente");
}
