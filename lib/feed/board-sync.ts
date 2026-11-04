/** Trae a BeFeed lo que pasó en los tableros de MAAS2. Lo corre el cron cada 5 minutos. */
import { prisma } from "@/lib/db/client";
import { maas2Enabled, readBoardAssets, readBoardComments, type BoardAsset } from "./maas2";
import { approvePiece, logEvent, pushQuietly, requestPieceChanges } from "./service";
import { GateError, type Actor } from "./stages";

const TABLERO: Actor = { type: "person", name: "Cliente, en el tablero" };

/** Qué hay que hacer con una pieza según lo que cambió en el tablero. Sin base de datos, para poder probarlo. */
export function decideFromBoard(
  piece: { maasStage: string | null; gatesPassed: string[]; stage: string; instagramMediaId: string | null; videoUrl: string | null },
  boardStage: string | null
): "CLIENTE" | "MP4" | "rechazar" | null {
  if (!boardStage || boardStage === piece.maasStage || piece.instagramMediaId) return null;
  if (boardStage === "rejected") return piece.stage === "GUION" ? null : "rechazar";
  if (boardStage !== "approved") return null;
  if (!piece.gatesPassed.includes("CLIENTE")) return "CLIENTE";
  return piece.videoUrl && !piece.gatesPassed.includes("MP4") ? "MP4" : null;
}

/** Si alguien subió el archivo directo en el tablero, BeFeed lo adopta. */
export function filesFromBoard(asset: BoardAsset) {
  const files = asset.metadata?.carousel_files?.length
    ? asset.metadata.carousel_files.map((f) => ({ url: f.url, name: f.name, type: f.type ?? "" }))
    : asset.file_url && asset.file_url !== "inline"
      ? [{ url: asset.file_url, name: undefined, type: asset.file_type }]
      : [];
  const isVideo = (f: { url: string; type: string }) => f.type.startsWith("video") || f.url.split("?")[0].endsWith(".mp4");
  return {
    videoUrl: files.find(isVideo)?.url ?? null,
    images: files.filter((f) => !isVideo(f)).map((f) => ({ url: f.url, name: f.name })),
  };
}

export async function syncBoards() {
  if (!maas2Enabled()) return { skipped: "sin conexión con MAAS2" };
  const since = new Date(Date.now() - 45 * 86_400_000);

  // Lo que pasó los filtros y no llegó al tablero: la copia falló o la marca se vinculó después.
  const pendientes = await prisma.feedPiece.findMany({
    where: {
      maasAssetId: null,
      instagramMediaId: null,
      gatesPassed: { hasEvery: ["DANIELA", "JORGE"] },
      week: { endsOn: { gte: since }, instagramAccount: { maas2ProjectId: { not: null } } },
    },
    select: { id: true, week: { select: { workspaceId: true } } },
  });
  for (const p of pendientes) await pushQuietly(p.id, p.week.workspaceId);

  const pieces = await prisma.feedPiece.findMany({
    where: { maasAssetId: { not: null }, week: { endsOn: { gte: since } } },
    include: { week: { select: { workspaceId: true } }, comments: { select: { externalId: true } } },
  });
  const ids = pieces.map((p) => p.maasAssetId as string);
  const [assets, comments] = await Promise.all([readBoardAssets(ids), readBoardComments(ids)]);
  const byAsset = new Map(assets.map((a) => [a.id, a]));
  let changes = 0;

  for (const piece of pieces) {
    const workspaceId = piece.week.workspaceId;
    const asset = byAsset.get(piece.maasAssetId as string);
    if (!asset) continue;

    const nuevos = comments.filter((c) => c.media_asset_id === asset.id && !piece.comments.some((k) => k.externalId === c.id));
    for (const c of nuevos) {
      await prisma.feedPieceComment.create({
        data: { pieceId: piece.id, externalId: c.id, author: c.author, content: c.content, createdAt: new Date(c.created_at) },
      });
      await logEvent(workspaceId, { type: "person", name: c.author }, "comentario_en_tablero", { pieceId: piece.id, detail: c.content.slice(0, 160) });
      changes += 1;
    }

    // Lo que subieron directo en el tablero entra a la pieza. Un video distinto vuelve a pedir aprobación.
    const archivos = filesFromBoard(asset);
    const actuales = (piece.assets ?? []) as Array<{ url: string }>;
    const videoNuevo = archivos.videoUrl && archivos.videoUrl !== piece.videoUrl;
    const imagenesNuevas = archivos.images.some((i) => !actuales.some((a) => a.url === i.url));
    if (videoNuevo || imagenesNuevas) {
      await prisma.feedPiece.update({
        where: { id: piece.id },
        data: {
          ...(videoNuevo ? { videoUrl: archivos.videoUrl, needsVideo: true, gatesPassed: piece.gatesPassed.filter((g) => g !== "MP4") } : {}),
          ...(imagenesNuevas ? { assets: archivos.images, thumbnailUrl: piece.thumbnailUrl ?? archivos.images[0]?.url ?? null } : {}),
        },
      });
      await logEvent(workspaceId, TABLERO, "archivo_desde_tablero", { pieceId: piece.id });
      changes += 1;
    }

    if (videoNuevo) await pushQuietly(piece.id, workspaceId);

    const decision = decideFromBoard(piece, asset.stage);
    const remember = () => prisma.feedPiece.update({ where: { id: piece.id }, data: { maasStage: asset.stage, maasSyncedAt: new Date() } });
    if (!decision) {
      if (asset.stage !== piece.maasStage) await remember();
      continue;
    }
    changes += 1;
    try {
      if (decision === "rechazar") {
        // Antes de devolverla, para que la copia de vuelta no le borre el rechazo al cliente.
        await remember();
        await requestPieceChanges(workspaceId, piece.id, TABLERO, nuevos.at(-1)?.content.slice(0, 300) ?? "Rechazada en el tablero");
      } else {
        await approvePiece(workspaceId, piece.id, decision, TABLERO);
      }
    } catch (error) {
      if (!(error instanceof GateError)) throw error;
      // Por ejemplo, está frenada. Queda una vez en el historial y se resuelve en BeFeed.
      await remember();
    }
  }
  return { piezas: pieces.length, cambios: changes };
}
