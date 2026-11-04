/** Subir archivos de una pieza a R2 y sacar el póster de un video. Corre en el servidor. */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const ALLOWED_UPLOADS: Record<string, { ext: string; kind: "video" | "image" }> = {
  "video/mp4": { ext: "mp4", kind: "video" },
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
};

export const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;

/** El nombre del objeto es aleatorio: nunca sale del nombre del archivo que subió alguien. */
async function toR2(file: string, pieceId: string, ext: string) {
  const key = `clientes/befeed/${pieceId}/${randomBytes(8).toString("hex")}.${ext}`;
  const { stdout } = await run("python3", ["tools/publish_r2.py", file, "--key", key], { maxBuffer: 1024 * 1024 });
  const url = stdout.match(/https:\/\/\S+/)?.[0];
  if (!url) throw new Error("La subida a R2 no devolvió un link.");
  return url;
}

export async function storeUpload(bytes: Buffer, pieceId: string, ext: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "befeed-"));
  try {
    const file = path.join(dir, `archivo.${ext}`);
    await writeFile(file, bytes);
    return await toR2(file, pieceId, ext);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Saca un cuadro del video para el tablero. Sin póster la pieza funciona igual: por eso no lanza error. */
export async function makePoster(videoUrl: string, pieceId: string): Promise<string | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "befeed-"));
  try {
    const poster = path.join(dir, "poster.jpg");
    await run("ffmpeg", ["-v", "error", "-y", "-ss", "2.5", "-i", videoUrl, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", poster], { timeout: 120_000 });
    return await toR2(poster, pieceId, "jpg");
  } catch (error) {
    console.error("[feed] sin póster:", error instanceof Error ? error.message.slice(0, 200) : error);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
