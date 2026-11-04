import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ALLOWED_UPLOADS, makePoster, MAX_UPLOAD_BYTES, storeUpload } from "@/lib/feed/media";
import { logEvent } from "@/lib/feed/service";
import { ensureWorkspaceForUser } from "@/lib/workspace";

export const maxDuration = 300;

/** Sube el MP4 o las imágenes de una pieza. Un video nuevo vuelve a pedir la aprobación del MP4. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const workspace = await ensureWorkspaceForUser(session.user.id, session.user.email);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "El archivo pasa de 300 MB." }, { status: 413 });
  }
  const form = await request.formData();
  const pieceId = String(form.get("pieceId") ?? "");
  const piece = await prisma.feedPiece.findFirst({ where: { id: pieceId, week: { workspaceId: workspace.id } } });
  if (!piece) return NextResponse.json({ error: "Esa pieza no existe en este espacio." }, { status: 404 });
  if (piece.instagramMediaId) return NextResponse.json({ error: "La pieza ya está publicada." }, { status: 409 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "Elige un archivo." }, { status: 400 });
  const invalido = files.find((f) => !ALLOWED_UPLOADS[f.type]);
  if (invalido) return NextResponse.json({ error: `${invalido.name}: solo MP4, JPG, PNG o WebP.` }, { status: 415 });
  if (files.filter((f) => ALLOWED_UPLOADS[f.type].kind === "video").length > 1) {
    return NextResponse.json({ error: "Sube un solo video por pieza." }, { status: 400 });
  }

  const assets = [...((piece.assets ?? []) as Array<{ url: string; name: string }>)];
  let videoUrl = piece.videoUrl;
  let thumbnailUrl = piece.thumbnailUrl;
  let gatesPassed = piece.gatesPassed;
  let needsVideo = piece.needsVideo;

  for (const file of files) {
    const { ext, kind } = ALLOWED_UPLOADS[file.type];
    const url = await storeUpload(Buffer.from(await file.arrayBuffer()), piece.id, ext);
    if (kind === "video") {
      videoUrl = url;
      needsVideo = true;
      gatesPassed = gatesPassed.filter((g) => g !== "MP4");
      thumbnailUrl = (await makePoster(url, piece.id)) ?? thumbnailUrl;
    } else {
      assets.push({ url, name: file.name.slice(0, 80) });
      thumbnailUrl = thumbnailUrl ?? url;
    }
  }

  await prisma.feedPiece.update({
    where: { id: piece.id },
    data: { assets: assets as Prisma.InputJsonValue, videoUrl, thumbnailUrl, gatesPassed, needsVideo },
  });
  await logEvent(
    workspace.id,
    { type: "person", name: session.user.name ?? session.user.email ?? "Persona" },
    "subir_archivos",
    { pieceId: piece.id, detail: `${files.length} archivo(s)` }
  );
  return NextResponse.json({ ok: true });
}
