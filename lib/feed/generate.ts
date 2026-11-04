/**
 * Genera una semana completa: lee estrategia, voz, cierre anterior y ganadores, le
 * pide las piezas al modelo con el método del skill y pasa cada una por el linter.
 * Corre en el worker porque tarda minutos.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { getClient } from "@/lib/ai/responder";
import { prisma } from "@/lib/db/client";
import { winners } from "./insights";
import { projectName } from "./maas2";
import { createWeek, logEvent, recentReels, savePiece } from "./service";
import { skillPath } from "./skills";
import type { Actor } from "./stages";

const run = promisify(execFile);
const AGENTE: Actor = { type: "agent", name: "BeFeed" };

const respuesta = z.object({
  tema: z.string(),
  resumen_loop: z.string().optional(),
  piezas: z
    .array(
      z.object({
        dia: z.string(),
        formato: z.enum(["REEL", "CARRUSEL", "HISTORIAS", "POST"]),
        gota: z.string().optional(),
        titulo: z.string(),
        primeros_3s: z.string().optional(),
        ganchos: z.array(z.object({ text: z.string(), score: z.number().optional(), chosen: z.boolean().optional() })).default([]),
        guion: z.array(z.object({ time: z.string(), voice: z.string(), screen: z.string() })).default([]),
        caption: z.string().default(""),
        historias: z.string().optional(),
        mide: z.string().optional(),
        falta_dato: z.string().nullish(),
        quien_lo_tiene: z.string().nullish(),
      })
    )
    .min(1),
});

async function tool(args: string[]) {
  const dir = skillPath("believe-instagram", "tools");
  const { stdout } = await run("python3", args.map((a, i) => (i === 0 ? path.join(dir, a) : a)), { cwd: skillPath("believe-instagram"), maxBuffer: 20 * 1024 * 1024, timeout: 120_000 });
  return stdout;
}

const read = async (name: string) => {
  const file = skillPath("believe-instagram", "references", `${name}.md`);
  return existsSync(file) ? readFile(file, "utf8") : "";
};

/** Lo que el linter tiene que ver: el guion dicho en un Reel, y siempre el caption. */
export function textsToLint(p: { formato: string; caption?: string; guion?: Array<{ voice: string }> }) {
  const voz = (p.guion ?? []).map((r) => r.voice.replace(/\([^)]*\)/g, "").trim()).filter(Boolean).join("\n");
  return [
    ...(p.formato === "REEL" && voz ? [{ texto: voz, modo: "reel" as const }] : []),
    ...(p.caption ? [{ texto: p.caption, modo: "caption" as const }] : []),
  ];
}

async function lint(text: string, brandFile: string, modo: "caption" | "reel") {
  const dir = await mkdtemp(path.join(tmpdir(), "lint-"));
  try {
    const file = path.join(dir, "pieza.txt");
    await writeFile(file, text);
    await run("python3", [skillPath("believe-instagram", "tools", "lint_es.py"), file, "--brand", brandFile, "--modo", modo]);
    return null;
  } catch (error) {
    const e = error as { stdout?: string; message?: string };
    return (e.stdout || e.message || "linter falló").slice(0, 600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function askModel(system: string, user: string) {
  const response = await getClient().chat.completions.create({
    model: "believe-smart",
    max_tokens: 32_000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const choice = response.choices[0];
  const raw = choice?.message?.content ?? "";
  try {
    return respuesta.parse(JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)));
  } catch (error) {
    // El largo y el motivo de corte son lo que permite diagnosticar sin volcar el texto.
    throw new Error(`El modelo no devolvió la semana (${choice?.finish_reason}, ${raw.length} caracteres): ${error instanceof Error ? error.message.slice(0, 160) : ""}`);
  }
}

const FORMATO_JSON = `Responde SOLO con JSON: {"tema":"","resumen_loop":"","piezas":[{"dia":"AAAA-MM-DD","formato":"REEL|CARRUSEL|HISTORIAS|POST","gota":"Semilla|Eco|Profundidad|Puente","titulo":"","primeros_3s":"","ganchos":[{"text":"","score":0,"chosen":true}],"guion":[{"time":"0 a 2 s","voice":"","screen":""}],"caption":"","historias":"","mide":"","falta_dato":null,"quien_lo_tiene":null}]}.
Reglas: resumen_loop en máximo tres frases, sin contar cómo lo corregiste. En HISTORIAS el caption va vacío y cada cuadro va en historias. Español de la marca, nunca voseo. Nada inventado: si falta una cifra, película, precio o condición escribe {{dato}} y explica en falta_dato qué falta y en quien_lo_tiene quién lo tiene. Tres ganchos con fórmulas distintas y uno elegido. En guion, voice es solo lo que se dice; las acotaciones van entre paréntesis. Sin rayas largas. Respeta palabras prohibidas, CTAs aprobados y topes de hashtags.`;

export async function generateWeek(requestId: string) {
  const req = await prisma.feedWeekRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { instagramAccount: true },
  });
  const account = req.instagramAccount;
  const marca = account.name ?? account.username;
  const dir = await mkdtemp(path.join(tmpdir(), "semana-"));
  try {
    const brandFile = path.join(dir, "brand.json");
    const brandName = (account.maas2ProjectId && (await projectName(account.maas2ProjectId))) || marca;

    await tool(["maasy.py", "brand", brandName, "--out", brandFile]);
    const estrategia = await tool(["maas2.py", "estrategia", brandName, "--seccion", "organic_content", "strategic_objective", "factor_be"]).catch(
      (e: Error) => `Sin estrategia en MAAS2: ${e.message.slice(0, 200)}`
    );
    const [metodo, oficio, piezas] = await Promise.all([read("metodo-maas"), read("oficio"), read("piezas")]);
    const cierre = await prisma.feedWeekClosing.findFirst({
      where: { week: { instagramAccountId: account.id }, closedAt: { not: null } },
      orderBy: { closedAt: "desc" },
    });
    const reels = await recentReels(account.id);
    const ganadores = winners(reels).map((r) => `${r.multiple}× ${r.caption?.split("\n")[0].slice(0, 100)} (${r.skipRate ?? "?"} % de salto)`);

    const desde = req.startsOn.toISOString().slice(0, 10);
    const hasta = req.endsOn.toISOString().slice(0, 10);
    const system = `Eres el estratega de Instagram orgánico de Believe. Sigue este método.\n\n${metodo}\n\n${oficio}\n\n${piezas}\n\n${FORMATO_JSON}`;
    const user = [
      `Marca: ${marca}. Semana: ${desde} a ${hasta}.`,
      `Acción medible de la semana: ${req.measurableAction}.`,
      req.rawMaterial ? `Materia prima real (cartelera, promos, datos): ${req.rawMaterial}` : "No hay materia prima: lo que falte va como {{dato}}.",
      `Voz de la marca:\n${await readFile(brandFile, "utf8")}`,
      `Estrategia:\n${estrategia}`,
      cierre ? `Cierre anterior. Se repite: ${cierre.repeat ?? "-"}. Se suelta: ${cierre.drop ?? "-"}. Pendiente: ${cierre.pending ?? "-"}.` : "No hay cierre anterior.",
      ganadores.length ? `Ganadores recientes de la cuenta:\n${ganadores.join("\n")}` : "",
    ].filter(Boolean).join("\n\n");

    let plan = await askModel(system, user);

    // Lo que el linter rechaza vuelve una vez al modelo con el motivo.
    const fallas = async (p: typeof plan.piezas[number]) => {
      if (p.dia < desde || p.dia > hasta) return `El día ${p.dia} está fuera de la semana.`;
      const salidas = await Promise.all(textsToLint(p).map((t) => lint(t.texto, brandFile, t.modo)));
      return salidas.filter(Boolean).join(" ") || null;
    };
    const revisar = async () => (await Promise.all(plan.piezas.map(fallas))).map((e, i) => (e ? `${plan.piezas[i].titulo}: ${e}` : null)).filter(Boolean);
    const errores = await revisar();
    if (errores.length) {
      plan = await askModel(system, `${user}\n\nTu versión anterior:\n${JSON.stringify(plan)}\n\nEl linter rechazó esto. Corrígelo y devuelve la semana completa:\n${errores.join("\n")}`);
    }

    const fuera = plan.piezas.find((p) => p.dia < desde || p.dia > hasta);
    if (fuera) throw new Error(`El modelo dejó una pieza fuera de la semana: ${fuera.dia}.`);

    const week = await createWeek(
      (await prisma.instagramAccount.findUniqueOrThrow({ where: { id: account.id }, select: { workspaceId: true } })).workspaceId,
      { username: account.username, startsOn: desde, endsOn: hasta, theme: plan.tema, measurableAction: req.measurableAction, loopSummary: plan.resumen_loop },
      AGENTE
    );
    let posicion = 0;
    for (const p of [...plan.piezas].sort((a, b) => a.dia.localeCompare(b.dia))) {
      posicion += 1;
      const pendiente = /\{\{/.test(JSON.stringify([p.guion, p.caption]));
      await savePiece(
        week.workspaceId,
        {
          weekId: week.id,
          position: posicion,
          publishOn: p.dia,
          format: p.formato,
          title: p.titulo,
          drip: p.gota,
          firstThree: p.primeros_3s,
          hooks: p.ganchos,
          script: p.guion,
          caption: p.caption,
          stories: p.historias,
          measures: p.mide,
          needsVideo: p.formato === "REEL",
          linterClean: !(await fallas(p)),
          blockedBy: pendiente ? (p.quien_lo_tiene ?? "Daniela") : null,
          blockedReason: pendiente ? (p.falta_dato ?? "Hay datos sin resolver en el texto") : null,
        },
        AGENTE
      );
    }
    await logEvent(week.workspaceId, AGENTE, "semana_generada", { detail: `@${account.username} ${desde}: ${posicion} piezas` });
    return week.id;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
