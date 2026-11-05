"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { ACCOUNT_COOKIE, feedContext } from "@/lib/feed/context";
import {
  approvePiece,
  assignPiece,
  createAdPiece,
  attachVideo,
  deleteWeek,
  logEvent,
  publishPiece,
  refreshAccountMetrics,
  requestPieceChanges,
  requestWeek,
  resendAd,
  saveAd,
  savePiece,
  setBlocker,
  submitPiece,
  useForAds,
} from "@/lib/feed/service";
import { vigenciaFrom } from "@/lib/feed/anuncio";
import { listTeam } from "@/lib/feed/maas2";
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

export async function removeAssetAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  const pieceId = text(form, "pieceId") ?? "";
  const piece = await prisma.feedPiece.findFirst({ where: { id: pieceId, week: { workspaceId } } });
  if (!piece) return;
  const url = text(form, "url");
  const assets = ((piece.assets ?? []) as Array<{ url: string; name?: string }>).filter((a) => a.url !== url);
  await prisma.feedPiece.update({
    where: { id: pieceId },
    data: {
      assets,
      thumbnailUrl: piece.thumbnailUrl === url ? (assets[0]?.url ?? null) : piece.thumbnailUrl,
    },
  });
  await logEvent(workspaceId, actor, "quitar_imagen", { pieceId });
  revalidatePath("/feed", "layout");
}

export async function assignAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  const value = text(form, "assignee");
  await onPiece(form, async (id) => {
    if (value === "ESTUDIO") return assignPiece(workspaceId, id, { producedBy: "ESTUDIO" }, actor);
    const member = (await listTeam()).find((m) => m.id === value);
    if (!member) throw new GateError("Esa persona no está en el equipo.");
    return assignPiece(workspaceId, id, { producedBy: "DISENO", assigneeId: member.id, assigneeName: member.name }, actor);
  });
}

export async function linkProjectAction(form: FormData) {
  const { accounts, workspaceId, actor } = await feedContext();
  const account = accounts.find((a) => a.id === text(form, "accountId"));
  if (!account) return;
  const maas2ProjectId = text(form, "projectId");
  await prisma.instagramAccount.update({ where: { id: account.id }, data: { maas2ProjectId } });
  await logEvent(workspaceId, actor, "vincular_tablero", { detail: `@${account.username}` });
  revalidatePath("/feed", "layout");
}

export async function generateWeekAction(form: FormData) {
  const { workspaceId, actor, account } = await feedContext();
  if (!account) return;
  let error = "";
  try {
    await requestWeek(
      workspaceId,
      {
        username: account.username,
        startsOn: text(form, "desde") ?? "",
        endsOn: text(form, "hasta") ?? "",
        measurableAction: text(form, "accion") ?? "",
        rawMaterial: text(form, "materia"),
      },
      actor
    );
  } catch (e) {
    if (!(e instanceof GateError)) throw e;
    error = e.message;
  }
  revalidatePath("/feed/semana", "layout");
  redirect(`/feed/semana/generar${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

export async function deleteWeekAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  let error = "";
  try {
    await deleteWeek(workspaceId, text(form, "weekId") ?? "", actor);
  } catch (e) {
    if (!(e instanceof GateError)) throw e;
    error = e.message;
  }
  revalidatePath("/feed", "layout");
  redirect(`/feed/semana${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

const adFrom = (form: FormData) => ({
  titular: text(form, "titular") ?? "",
  mensaje: text(form, "mensaje") ?? "",
  descripcion: text(form, "descripcion") ?? "",
  enlace: text(form, "enlace") ?? "",
  llamado: text(form, "llamado") ?? "",
  vigencia: vigenciaFrom(text(form, "vigencia_desde") ?? "", text(form, "vigencia_hasta") ?? ""),
});

export async function saveAdAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  await onPiece(form, (id) => saveAd(workspaceId, id, adFrom(form), actor));
}

export async function useForAdsAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  await onPiece(form, (id) => useForAds(workspaceId, id, adFrom(form), actor));
}

export async function resendAdAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  await onPiece(form, (id) => resendAd(workspaceId, id, actor));
}

export async function createAdPieceAction(form: FormData) {
  const { workspaceId, actor, account } = await feedContext();
  if (!account) return;
  const format = (text(form, "format") ?? "REEL") as "REEL" | "POST" | "CARRUSEL" | "HISTORIAS";
  let id = "";
  let error = "";
  try {
    const piece = await createAdPiece(
      workspaceId,
      account.id,
      { title: text(form, "title") ?? "", format, day: text(form, "dia") ?? "", needsVideo: format === "REEL", ad: adFrom(form) },
      actor
    );
    id = piece.id;
  } catch (e) {
    if (!(e instanceof GateError)) throw e;
    error = e.message;
  }
  revalidatePath("/feed", "layout");
  redirect(error ? `/feed/pieza/nueva?error=${encodeURIComponent(error)}` : `/feed/pieza/${id}`);
}

/** Una marca que solo hace pauta: se opera aquí sin conectar Instagram. Felix y Envía Ya, por ejemplo. */
export async function createBrandAction(form: FormData) {
  const { workspaceId, actor } = await feedContext();
  const name = text(form, "name");
  const maas2ProjectId = text(form, "projectId");
  if (!name || !maas2ProjectId) return;
  const slug = name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // ponytail: reusa la cuenta con token vacío en vez de un modelo de marca. Lo que habla con Meta ya ignora
  // el token vacío. Si estas marcas necesitan más que producir pauta, toca separar marca de cuenta.
  const account = await prisma.instagramAccount.upsert({
    where: { instagramId: `pauta:${slug}` },
    update: { name, maas2ProjectId },
    create: { workspaceId, instagramId: `pauta:${slug}`, username: slug, name, accessToken: "", maas2ProjectId },
  });
  await logEvent(workspaceId, actor, "crear_marca_sin_instagram", { detail: name });
  (await cookies()).set(ACCOUNT_COOKIE, account.id, { httpOnly: true, sameSite: "lax", path: "/feed", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/feed", "layout");
}
