/**
 * Los skills viven en sus propios repos. Cada push a main dispara una GitHub Action que
 * le manda el repo a BeFeed: lo que se mejora en un skill llega solo, sin construir una
 * imagen nueva. Se guarda en el volumen que comparten la web y el worker.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/db/client";

const run = promisify(execFile);
export const DATA = process.env.REEL_DATA ?? "/data/reels";
export const SKILLS_DIR = path.join(DATA, "skills");
export const SKILLS = ["believe-instagram", "motion-video-believe"] as const;
export type SkillName = (typeof SKILLS)[number];

export const skillPath = (name: SkillName, ...rest: string[]) => path.join(SKILLS_DIR, name, ...rest);

/** El script de Reels del skill. Si todavía no se ha bajado, usa la copia que trae la imagen. */
export const reelScript = () => {
  const fromSkill = skillPath("believe-instagram", "tools", "reel.py");
  return existsSync(fromSkill) ? fromSkill : "tools/reel.py";
};

/** Instala una versión: primero la deja completa al lado y después la cambia de un solo paso. */
export async function installSkill(name: SkillName, sha: string, tgz: Buffer) {
  await mkdir(SKILLS_DIR, { recursive: true });
  const tmp = path.join(SKILLS_DIR, `.${name}-${sha.slice(0, 8)}`);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const file = `${tmp}.tgz`;
  await writeFile(file, tgz);
  await run("tar", ["-xzf", file, "-C", tmp, "--no-same-owner"]);
  await rm(file, { force: true });
  await rm(skillPath(name), { recursive: true, force: true });
  await rename(tmp, skillPath(name));
  const version = existsSync(skillPath(name, "VERSION")) ? (await readFile(skillPath(name, "VERSION"), "utf8")).trim() : "sin versión";
  await prisma.feedSkillVersion.upsert({
    where: { name },
    update: { sha, version, syncedAt: new Date() },
    create: { name, sha, version },
  });
  return version;
}

/** Devuelve las referencias del método de Instagram: lo que necesita saber cualquier agente conectado. */
export async function instagramMethod(section?: string) {
  const refs = skillPath("believe-instagram", "references");
  if (!existsSync(refs)) return null;
  const files = (await readdir(refs)).filter((f) => f.endsWith(".md"));
  if (section) {
    const match = files.find((f) => f === `${section}.md`);
    if (!match) return { disponibles: files.map((f) => f.replace(/\.md$/, "")) };
    return { seccion: section, contenido: await readFile(path.join(refs, match), "utf8") };
  }
  return { disponibles: files.map((f) => f.replace(/\.md$/, "")), guia: await readFile(skillPath("believe-instagram", "SKILL.md"), "utf8") };
}
