/**
 * Conexión con los tableros de MAAS2. BeFeed controla la operación; el tablero es
 * donde el cliente ve, comenta y aprueba, y donde queda el archivo de media.
 *
 *   BeFeed → tablero: cuando una pieza pasa los dos filtros internos se copia, y
 *                     después cada cambio de archivo o de etapa se vuelve a copiar.
 *   tablero → BeFeed: un cron trae aprobaciones, rechazos, comentarios y archivos.
 *
 * Un fallo aquí nunca frena una acción en BeFeed: queda en el registro y el
 * siguiente ciclo lo reintenta.
 */
import type { FeedPiece, FeedWeek } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";

const url = () => process.env.MAAS2_SUPABASE_SELFHOST_URL?.replace(/\/$/, "");
const key = () => process.env.MAAS2_SUPABASE_SERVICE_ROLE_KEY;
export const maas2Enabled = () => Boolean(url() && key());

async function rest<T>(path: string, init?: { method?: string; body?: unknown; prefer?: string }): Promise<T> {
  const res = await fetch(`${url()}/rest/v1/${path}`, {
    method: init?.method ?? "GET",
    headers: {
      apikey: key() as string,
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      ...(init?.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`MAAS2 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export type TeamMember = { id: string; name: string };

export async function listProjects() {
  if (!maas2Enabled()) return [];
  return rest<Array<{ id: string; brand_name: string }>>("projects?select=id,brand_name&order=brand_name.asc&limit=200");
}

/** Las personas del equipo. Los agentes de MAAS2 también son perfiles: no se les asigna diseño. */
export async function listTeam(): Promise<TeamMember[]> {
  if (!maas2Enabled()) return [];
  const rows = await rest<Array<{ id: string; full_name: string | null; actor_type: string | null }>>(
    "profiles?select=id,full_name,actor_type&email=ilike.*@believe-global.com&order=full_name.asc&limit=100"
  );
  return rows
    .filter((r) => r.full_name && r.actor_type !== "agent")
    .map((r) => ({ id: r.id, name: (r.full_name as string).trim() }));
}

/** El nombre con el que la marca está en MAAS2 y en Maasy. */
export async function projectName(projectId: string) {
  const rows = await rest<Array<{ brand_name: string }>>(`projects?select=brand_name&id=eq.${projectId}`);
  return rows[0]?.brand_name ?? null;
}

async function ownerId() {
  const email = process.env.MAAS2_FEED_USER_EMAIL ?? "jorge@believe-global.com";
  const rows = await rest<Array<{ id: string }>>(`profiles?select=id&email=eq.${encodeURIComponent(email)}&limit=1`);
  if (!rows[0]) throw new Error(`MAAS2 no tiene el perfil ${email}.`);
  return rows[0].id;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "Semana 12 - 18 nov", como los nombra el equipo. */
export function boardName(startsOn: Date, endsOn: Date) {
  const a = startsOn.getUTCDate();
  const b = endsOn.getUTCDate();
  const ma = MESES[startsOn.getUTCMonth()];
  const mb = MESES[endsOn.getUTCMonth()];
  return ma === mb ? `Semana ${a} - ${b} ${mb}` : `Semana ${a} ${ma} - ${b} ${mb}`;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Busca el tablero de la semana por sus fechas. Si no existe lo crea. */
async function ensureBoard(week: FeedWeek, projectId: string) {
  if (week.maasBoardId) return week.maasBoardId;
  const start = isoDay(week.startsOn);
  const found = await rest<Array<{ id: string }>>(
    `media_boards?select=id&project_id=eq.${projectId}&date_range->>start=eq.${start}&limit=1`
  );
  const id =
    found[0]?.id ??
    (
      await rest<Array<{ id: string }>>("media_boards", {
        method: "POST",
        prefer: "return=representation",
        body: {
          project_id: projectId,
          name: boardName(week.startsOn, week.endsOn),
          board_type: "custom",
          date_range: { start, end: isoDay(week.endsOn) },
        },
      })
    )[0].id;
  await prisma.feedWeek.update({ where: { id: week.id }, data: { maasBoardId: id } });
  return id;
}

const FORMATO: Record<string, string> = { REEL: "Reel", CARRUSEL: "Carousel", HISTORIAS: "Story", POST: "Post" };
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4" };
const mimeOf = (u: string) => MIME[u.split("?")[0].split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

type Script = Array<{ voice?: string }>;
type Asset = { url: string; name?: string };

/** La etapa que le corresponde en el tablero según lo aprobado en BeFeed. */
export function boardStage(piece: Pick<FeedPiece, "gatesPassed" | "instagramMediaId" | "needsVideo" | "videoUrl" | "maasStage">) {
  const g = piece.gatesPassed;
  if (piece.instagramMediaId) return "published";
  // Sin los dos filtros el cliente no tiene nada que revisar. Un rechazo suyo se queda visible hasta que vuelva.
  if (!g.includes("DANIELA") || !g.includes("JORGE")) return piece.maasStage === "rejected" ? "rejected" : "draft";
  if (!g.includes("CLIENTE")) return "client_review";
  // El cliente aprobó el guion. Cuando llega el video lo vuelve a ver.
  if (piece.needsVideo && piece.videoUrl && !g.includes("MP4")) return "client_review";
  return "approved";
}

/** Solo sale al tablero lo que ya pasó los dos filtros: el cliente no ve borradores. */
export function readyForBoard(piece: Pick<FeedPiece, "gatesPassed" | "maasAssetId">) {
  return Boolean(piece.maasAssetId) || (piece.gatesPassed.includes("DANIELA") && piece.gatesPassed.includes("JORGE"));
}

export function assetRow(piece: FeedPiece, ids: { projectId: string; boardId: string; userId: string }) {
  const assets = (piece.assets ?? []) as Asset[];
  const files = [...(piece.videoUrl ? [{ url: piece.videoUrl, name: "Reel" }] : []), ...assets];
  const principal = files[0];
  const voces = ((piece.script ?? []) as Script).map((r) => r.voice?.replace(/\([^)]*\)/g, "").trim()).filter(Boolean);
  return {
    project_id: ids.projectId,
    board_id: ids.boardId,
    user_id: ids.userId,
    title: `${FORMATO[piece.format]} - ${piece.title}`,
    file_name: piece.title.slice(0, 120),
    // El tablero marca como texto lo que todavía no tiene archivo.
    file_type: principal ? mimeOf(principal.url) : "text/markdown",
    file_url: principal?.url ?? "inline",
    thumbnail_url: piece.thumbnailUrl ?? (principal && mimeOf(principal.url).startsWith("image") ? principal.url : null),
    description: piece.caption ?? "",
    copy_text: voces.join("\n\n"),
    caption: piece.stories ?? "",
    format_type: FORMATO[piece.format],
    platform: ["Instagram"],
    asset_date: isoDay(piece.publishOn),
    due_date: isoDay(piece.publishOn),
    stage: boardStage(piece),
    assigned_to: piece.assigneeId,
    published_date: piece.instagramMediaId ? isoDay(new Date()) : null,
    metadata: {
      befeed_piece_id: piece.id,
      is_carousel: files.length > 1,
      carousel_files: files.map((f, i) => ({ url: f.url, name: f.name ?? `Archivo ${i + 1}`, path: "", size: 0, type: mimeOf(f.url), order_index: i })),
    },
  };
}

/** Copia una pieza a su tablero. No hace nada si la marca no tiene proyecto o la pieza no está lista. */
export async function pushPiece(pieceId: string) {
  if (!maas2Enabled()) return { skipped: "sin conexión" };
  const piece = await prisma.feedPiece.findUniqueOrThrow({
    where: { id: pieceId },
    include: { week: { include: { instagramAccount: { select: { maas2ProjectId: true } } } } },
  });
  const projectId = piece.week.instagramAccount.maas2ProjectId;
  if (!projectId) return { skipped: "la marca no tiene proyecto en MAAS2" };
  if (!readyForBoard(piece)) return { skipped: "no ha pasado los filtros" };

  const boardId = await ensureBoard(piece.week, projectId);
  const userId = await ownerId();
  const row = assetRow(piece, { projectId, boardId, userId });

  let assetId = piece.maasAssetId;
  if (assetId) {
    await rest(`media_assets?id=eq.${assetId}`, { method: "PATCH", body: row });
  } else {
    assetId = (await rest<Array<{ id: string }>>("media_assets", { method: "POST", prefer: "return=representation", body: row }))[0].id;
  }
  if (piece.maasStage !== row.stage) {
    await rest("media_approval_states", {
      method: "POST",
      body: { media_asset_id: assetId, user_id: userId, previous_stage: piece.maasStage, new_stage: row.stage, notes: "Desde BeFeed" },
    });
  }
  await prisma.feedPiece.update({
    where: { id: pieceId },
    data: { maasAssetId: assetId, maasStage: row.stage, maasSyncedAt: new Date() },
  });
  return { assetId };
}

export type BoardAsset = {
  id: string;
  stage: string | null;
  file_url: string;
  file_type: string;
  metadata: { carousel_files?: Array<{ url: string; name?: string; type?: string }> } | null;
};

/** Lee cómo están en el tablero las piezas que BeFeed copió. */
export async function readBoardAssets(assetIds: string[]) {
  if (assetIds.length === 0) return [];
  return rest<BoardAsset[]>(`media_assets?select=id,stage,file_url,file_type,metadata&id=in.(${assetIds.join(",")})`);
}

export async function readBoardComments(assetIds: string[]) {
  if (assetIds.length === 0) return [];
  const rows = await rest<Array<{ id: string; media_asset_id: string; user_id: string; content: string; created_at: string }>>(
    `media_comments?select=id,media_asset_id,user_id,content,created_at&media_asset_id=in.(${assetIds.join(",")})&order=created_at.asc&limit=1000`
  );
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const names = ids.length
    ? await rest<Array<{ id: string; full_name: string | null }>>(`profiles?select=id,full_name&id=in.(${ids.join(",")})`)
    : [];
  const name = new Map(names.map((n) => [n.id, n.full_name?.trim() ?? "Alguien"]));
  // Las menciones llegan como @[Nombre](uuid): en BeFeed basta con el nombre.
  const clean = (t: string) => t.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, "@$1");
  return rows.map((r) => ({ ...r, author: name.get(r.user_id) ?? "Alguien", content: clean(r.content) }));
}
