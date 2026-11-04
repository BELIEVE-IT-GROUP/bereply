/**
 * Los skills viven en sus propios repos. El worker revisa cada pocos minutos si hay
 * un commit nuevo y lo baja a un volumen que comparten la web y el worker. Así, lo
 * que se mejora en un skill llega solo a BeFeed, sin construir una imagen nueva.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/db/client";

const run = promisify(execFile);
export const DATA = process.env.REEL_DATA ?? "/data/reels";
export const SKILLS_DIR = path.join(DATA, "skills");
const OWNER = "BELIEVE-IT-GROUP";
export const SKILLS = ["believe-instagram", "motion-video-believe"] as const;
export type SkillName = (typeof SKILLS)[number];

export const skillPath = (name: SkillName, ...rest: string[]) => path.join(SKILLS_DIR, name, ...rest);

/** El script de Reels del skill. Si todavía no se ha bajado, usa la copia que trae la imagen. */
export const reelScript = () => {
  const fromSkill = skillPath("believe-instagram", "tools", "reel.py");
  return existsSync(fromSkill) ? fromSkill : "tools/reel.py";
};

/** Cada repo tiene su llave de solo lectura, en base64 en el entorno. */
async function git(name: SkillName, args: string[]) {
  const value = process.env[`BEFEED_DEPLOY_KEY_${name.toUpperCase().replaceAll("-", "_")}`];
  if (!value) throw new Error("Falta su llave de lectura.");
  const dir = await mkdtemp(path.join(tmpdir(), "llave-"));
  try {
    const key = path.join(dir, "id");
    await writeFile(key, Buffer.from(value, "base64"), { mode: 0o600 });
    const { stdout } = await run("git", args, {
      env: { ...process.env, GIT_SSH_COMMAND: `ssh -i ${key} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=${dir}/hosts` },
      maxBuffer: 1024 * 1024,
      timeout: 5 * 60_000,
    });
    return stdout;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Devuelve lo que se actualizó. Un repo que falla no frena al otro. */
export async function syncSkills() {
  await mkdir(SKILLS_DIR, { recursive: true });
  const actualizados: string[] = [];
  for (const name of SKILLS) {
    try {
      const repo = `git@github.com:${OWNER}/${name}.git`;
      const sha = (await git(name, ["ls-remote", repo, "refs/heads/main"])).split(/\s/)[0];
      if (!sha) throw new Error("El repo no tiene main.");
      const known = await prisma.feedSkillVersion.findUnique({ where: { name } });
      if (known?.sha === sha && existsSync(skillPath(name))) continue;

      const tmp = path.join(SKILLS_DIR, `.${name}-${sha.slice(0, 8)}`);
      await rm(tmp, { recursive: true, force: true });
      await git(name, ["clone", "-q", "--depth", "1", repo, tmp]);
      await rm(path.join(tmp, ".git"), { recursive: true, force: true });
      await rm(skillPath(name), { recursive: true, force: true });
      await rename(tmp, skillPath(name));
      const version = existsSync(skillPath(name, "VERSION")) ? (await readFile(skillPath(name, "VERSION"), "utf8")).trim() : "sin versión";
      await prisma.feedSkillVersion.upsert({
        where: { name },
        update: { sha, version, syncedAt: new Date() },
        create: { name, sha, version },
      });
      actualizados.push(`${name} ${version}`);
    } catch (error) {
      console.error(`[skills] ${name}:`, error instanceof Error ? error.message : error);
    }
  }
  return actualizados;
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
