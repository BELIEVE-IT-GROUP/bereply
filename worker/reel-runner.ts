/**
 * Produce los Reels de BeFeed, de uno en uno. Mira la tabla cada pocos segundos,
 * corre tools/reel.py por etapas y sube lo que sale a R2.
 *
 * Lo pagado se separa a propósito: después de voz, música y cuadros el trabajo se
 * detiene hasta que una persona revise. Solo entonces se pagan los clips.
 */
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { syncBoards } from "@/lib/feed/board-sync";
import { generateWeek } from "@/lib/feed/generate";
import { logEvent, pushQuietly } from "@/lib/feed/service";
import { syncAdResults } from "@/lib/feed/resultados";
import { reelScript } from "@/lib/feed/skills";
import type { Actor } from "@/lib/feed/stages";

const run = promisify(execFile);
const DATA = process.env.REEL_DATA ?? "/data/reels";
const POLL_MS = 5_000;
const SISTEMA: Actor = { type: "agent", name: "Estudio" };
const EVERY_5_MIN = 5 * 60_000;

type Plan = { id: string; imagen?: string };
type Ficha = { salida?: string; logo?: string; logo_url?: string; planos?: Plan[] } & Record<string, unknown>;

async function reel(dir: string, steps: string[]) {
  await run("python3", [reelScript(), path.join(dir, "ficha.json"), ...steps], {
    maxBuffer: 20 * 1024 * 1024,
    timeout: 40 * 60_000,
  });
}

async function upload(file: string, key: string): Promise<string> {
  const { stdout } = await run("python3", ["tools/publish_r2.py", file, "--key", key], { maxBuffer: 1024 * 1024 });
  const url = stdout.match(/https:\/\/\S+/)?.[0];
  if (!url) throw new Error("La subida a R2 no devolvió un link.");
  return url;
}

/** Deja la carpeta de trabajo lista: la ficha más reciente y el logo de la marca. */
async function prepare(pieceId: string, ficha: Ficha) {
  const dir = path.join(DATA, pieceId);
  await mkdir(dir, { recursive: true });
  const logo = ficha.logo ?? "logo.png";
  if (ficha.logo_url && !existsSync(path.join(dir, logo))) {
    const res = await fetch(ficha.logo_url, { headers: { "User-Agent": "BeFeed/1.0" } });
    if (!res.ok) throw new Error(`No se pudo bajar el logo: HTTP ${res.status}`);
    await writeFile(path.join(dir, logo), Buffer.from(await res.arrayBuffer()));
  }
  await writeFile(path.join(dir, "ficha.json"), JSON.stringify({ ...ficha, logo }, null, 1));
  return dir;
}

/** Sube los cuadros para poder revisarlos en el panel. El sello evita la caché al rehacer un plano. */
async function publishFrames(pieceId: string, dir: string, ficha: Ficha) {
  const stamp = Date.now().toString(36);
  const planos = await Promise.all(
    (ficha.planos ?? []).map(async (p) => {
      const png = path.join(dir, "cuadros", `${p.id}.png`);
      if (!existsSync(png)) return p;
      const jpg = path.join(dir, "cuadros", `${p.id}.jpg`);
      await run("ffmpeg", ["-v", "error", "-y", "-i", png, "-vf", "scale=540:-2", "-q:v", "4", jpg]);
      return { ...p, imagen: await upload(jpg, `clientes/befeed/${pieceId}/cuadros/${stamp}-${p.id}.jpg`) };
    })
  );
  return { ...ficha, planos };
}

/** Mide lo que salió con ffmpeg. earshot no corre en el servidor: pesa demasiado. */
async function measure(file: string) {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { maxBuffer: 50 * 1024 * 1024 });
  const lufs = [...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)?.[1];
  const peak = [...stderr.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].at(-1)?.[1];
  const dur = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return {
    lufs: lufs ? Number(lufs) : undefined,
    truePeakDb: peak ? Number(peak) : undefined,
    durationS: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : undefined,
  };
}

/** Un MP4 nuevo es otro MP4: la aprobación anterior ya no aplica. */
async function publishVideo(pieceId: string, dir: string, ficha: Ficha) {
  const file = path.join(dir, ficha.salida ?? "reel.mp4");
  const stamp = Date.now().toString(36);
  const videoUrl = await upload(file, `clientes/befeed/${pieceId}/${stamp}-reel.mp4`);
  const poster = path.join(dir, "poster.jpg");
  await run("ffmpeg", ["-v", "error", "-y", "-ss", "2.5", "-i", file, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", poster]);
  const thumbnailUrl = await upload(poster, `clientes/befeed/${pieceId}/${stamp}-poster.jpg`);
  const piece = await prisma.feedPiece.findUniqueOrThrow({ where: { id: pieceId }, select: { gatesPassed: true } });
  await prisma.feedPiece.update({
    where: { id: pieceId },
    data: { videoUrl, thumbnailUrl, gatesPassed: piece.gatesPassed.filter((g) => g !== "MP4") },
  });
  return measure(file);
}

async function work(job: { id: string; pieceId: string; step: string; ficha: Prisma.JsonValue }) {
  const piece = await prisma.feedPiece.findUniqueOrThrow({ where: { id: job.pieceId }, select: { week: { select: { workspaceId: true } } } });
  const workspaceId = piece.week.workspaceId;
  const ficha = job.ficha as Ficha;
  const dir = await prepare(job.pieceId, ficha);
  const hold = async (next: Ficha) => {
    await prisma.feedReelJob.update({
      where: { id: job.id },
      data: { ficha: next as Prisma.InputJsonValue, step: "revision", status: "ESPERA_REVISION" },
    });
    await logEvent(workspaceId, SISTEMA, "cuadros_listos", { pieceId: job.pieceId });
  };

  if (job.step === "voz") {
    await reel(dir, ["voz", "musica", "cuadros"]);
    await hold(await publishFrames(job.pieceId, dir, ficha));
    return;
  }
  if (job.step.startsWith("rehacer:")) {
    const plan = job.step.slice("rehacer:".length);
    if (!(ficha.planos ?? []).some((p) => p.id === plan)) throw new Error(`No existe el plano ${plan}.`);
    await rm(path.join(dir, "cuadros", `${plan}.png`), { force: true });
    await rm(path.join(dir, "clips", `${plan}.mp4`), { force: true });
    await reel(dir, ["cuadros"]);
    await hold(await publishFrames(job.pieceId, dir, ficha));
    return;
  }
  await reel(dir, job.step === "clips" ? ["clips", "armar"] : ["armar"]);
  const audio = await publishVideo(job.pieceId, dir, ficha);
  await prisma.feedReelJob.update({ where: { id: job.id }, data: { step: "aprobacion", status: "LISTO", audio } });
  await logEvent(workspaceId, SISTEMA, "reel_listo", { pieceId: job.pieceId });
  await pushQuietly(job.pieceId, workspaceId);
}

/** Devuelve true si hizo algo. El updateMany evita que dos procesos tomen el mismo trabajo. */
export async function tick(): Promise<boolean> {
  const job = await prisma.feedReelJob.findFirst({ where: { status: "EN_COLA" }, orderBy: { updatedAt: "asc" } });
  if (!job) return false;
  const { count } = await prisma.feedReelJob.updateMany({ where: { id: job.id, status: "EN_COLA" }, data: { status: "CORRIENDO" } });
  if (count === 0) return true;
  try {
    await work(job);
  } catch (error) {
    const raw = error as { stderr?: string; message?: string };
    // Solo el final del error: basta para diagnosticar y no se vuelca una llave a la pantalla.
    const log = (raw.stderr || raw.message || "Falló").trim().split("\n").slice(-3).join(" ").slice(-400);
    console.error("[reels]", job.id, log);
    await prisma.feedReelJob.update({ where: { id: job.id }, data: { status: "FALLO", log } });
  }
  return true;
}

/** Genera una semana pedida. Va aparte de los Reels: uno de ellos puede tardar media hora. */
export async function tickWeek(): Promise<boolean> {
  const req = await prisma.feedWeekRequest.findFirst({ where: { status: "EN_COLA" }, orderBy: { createdAt: "asc" } });
  if (!req) return false;
  const { count } = await prisma.feedWeekRequest.updateMany({ where: { id: req.id, status: "EN_COLA" }, data: { status: "CORRIENDO" } });
  if (count === 0) return true;
  try {
    const weekId = await generateWeek(req.id);
    await prisma.feedWeekRequest.update({ where: { id: req.id }, data: { status: "LISTO", weekId, log: null } });
  } catch (error) {
    const raw = error as { stderr?: string; message?: string };
    const log = (raw.stderr || raw.message || "Falló").trim().split("\n").slice(-3).join(" ").slice(-400);
    console.error("[semana]", req.id, log);
    await prisma.feedWeekRequest.update({ where: { id: req.id }, data: { status: "FALLO", log } });
  }
  return true;
}

async function loop(name: string, fn: () => Promise<unknown>, restMs: number) {
  for (;;) {
    await fn().catch((error) => console.error(`[${name}]`, error instanceof Error ? error.message : error));
    await new Promise((resolve) => setTimeout(resolve, restMs));
  }
}

async function main() {
  await mkdir(DATA, { recursive: true });
  void loop("tableros", syncBoards, EVERY_5_MIN);
  void loop("resultados", syncAdResults, 12 * EVERY_5_MIN);
  await prisma.feedWeekRequest.updateMany({ where: { status: "CORRIENDO" }, data: { status: "FALLO", log: "Se interrumpió por un reinicio." } });
  void loop("semana", tickWeek, POLL_MS);
  // Un trabajo que quedó corriendo cuando se reinició el proceso no va a terminar solo.
  await prisma.feedReelJob.updateMany({ where: { status: "CORRIENDO" }, data: { status: "FALLO", log: "Se interrumpió por un reinicio." } });
  console.log("[reels] listo, carpeta", DATA);
  for (;;) {
    const busy = await tick().catch((error) => {
      console.error("[reels]", error instanceof Error ? error.message : error);
      return false;
    });
    if (!busy) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

if (process.argv[1]?.endsWith("reel-runner.ts")) void main();
