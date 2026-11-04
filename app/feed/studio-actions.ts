"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { logEvent } from "@/lib/feed/service";

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

export async function redoPlanAction(form: FormData) {
  const plan = String(form.get("plan") ?? "");
  await requeue(form, `rehacer:${plan}`, "rehacer_plano", plan);
}
