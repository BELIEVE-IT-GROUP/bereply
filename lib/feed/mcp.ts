/**
 * El MCP de BeFeed: lo que Claude o George pueden hacer.
 *
 * Aprobar y publicar no están en esta lista a propósito. Lo que no existe aquí
 * el agente no lo puede hacer, ni con un prompt ingenioso ni por error.
 */
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { fichaSchema, reelsPerDay, type Ficha } from "./ficha";
import { skipSeparation, summarize, winners } from "./insights";
import { listTeam } from "./maas2";
import { instagramMethod } from "./skills";
import {
  accountByUsername,
  assignPiece,
  attachVideo,
  createWeek,
  currentWeek,
  gateState,
  logEvent,
  recentReels,
  refreshAccountMetrics,
  requestWeek,
  savePiece,
  setBlocker,
  stageFor,
  submitPiece,
  weekByStart,
} from "./service";
import { assertCanProduce, type Actor } from "./stages";

type Ctx = { workspaceId: string; actor: Actor };

const cuenta = z.object({ cuenta: z.string().describe("Usuario de Instagram, por ejemplo cinemauniplaza") });
const pieza = z.object({ pieza_id: z.string() });

const fechaRe = /^\d{4}-\d{2}-\d{2}$/;

function shapeWeek(week: NonNullable<Awaited<ReturnType<typeof currentWeek>>>) {
  return {
    id: week.id,
    desde: week.startsOn.toISOString().slice(0, 10),
    hasta: week.endsOn.toISOString().slice(0, 10),
    tema: week.theme,
    accion_medible: week.measurableAction,
    referencia: week.baseline,
    piezas: week.pieces.map((p) => ({
      id: p.id,
      posicion: p.position,
      dia: p.publishOn.toISOString().slice(0, 10),
      formato: p.format,
      titulo: p.title,
      columna: stageFor(gateState(p)),
      puertas_abiertas: p.gatesPassed,
      frenada_por: p.blockedBy,
      motivo: p.blockedReason,
      hecha_por: p.assigneeName ?? (p.producedBy === "ESTUDIO" ? "Estudio" : null),
      en_tablero: Boolean(p.maasAssetId),
      comentarios_del_tablero: p.comments.map((c) => ({ autor: c.author, texto: c.content, fecha: c.createdAt })),
    })),
    cierre: week.closing,
  };
}

export const TOOLS = {
  marcas: {
    description: "Lista las cuentas de Instagram conectadas en este espacio.",
    input: z.object({}),
    run: async (_: object, { workspaceId }: Ctx) =>
      prisma.instagramAccount.findMany({
        where: { workspaceId },
        select: { username: true, name: true, maasyProjectId: true },
      }),
  },
  metricas: {
    description: "Reels recientes de una cuenta con vistas, alcance, tiempo medio y tasa de salto, más medianas y ganadores.",
    input: cuenta,
    run: async ({ cuenta: u }: z.infer<typeof cuenta>, { workspaceId }: Ctx) => {
      const account = await accountByUsername(workspaceId, u);
      let reels = await recentReels(account.id);
      if (reels.length === 0) {
        await refreshAccountMetrics(account.id);
        reels = await recentReels(account.id);
      }
      return {
        resumen: summarize(reels),
        ganadores: winners(reels).map((r) => ({ id: r.instagramMediaId, multiplo: r.multiple, texto: r.caption?.slice(0, 120) })),
        separacion_de_salto: skipSeparation(reels),
        reels: reels.map((r) => ({
          id: r.instagramMediaId,
          fecha: r.publishedAt.toISOString().slice(0, 10),
          texto: r.caption?.slice(0, 120),
          vistas: r.views,
          alcance: r.reach,
          guardados: r.saved,
          compartidos: r.shares,
          tiempo_medio_ms: r.avgWatchMs,
          tasa_de_salto: r.skipRate,
        })),
      };
    },
  },
  marca: {
    description: "Lo que se sabe de una marca: norte, pilares, voz, prohibidas, datos que chocan y fuentes.",
    input: cuenta,
    run: async ({ cuenta: u }: z.infer<typeof cuenta>, { workspaceId }: Ctx) => {
      const account = await accountByUsername(workspaceId, u);
      return prisma.feedBrandProfile.findUnique({ where: { instagramAccountId: account.id } });
    },
  },
  guardar_marca: {
    description: "Guarda el perfil de una marca, leído de MAAS2 y Maasy. Reemplaza el anterior.",
    input: cuenta.extend({
      perfil: z.record(z.string(), z.unknown()),
      datos_que_chocan: z.array(z.record(z.string(), z.unknown())).default([]),
      fuentes: z.array(z.object({ name: z.string(), date: z.string() })).default([]),
    }),
    run: async (
      i: { cuenta: string; perfil: object; datos_que_chocan: object[]; fuentes: object[] },
      { workspaceId, actor }: Ctx
    ) => {
      const account = await accountByUsername(workspaceId, i.cuenta);
      const data = {
        profile: i.perfil as Prisma.InputJsonValue,
        clashes: i.datos_que_chocan as Prisma.InputJsonValue,
        sources: i.fuentes as Prisma.InputJsonValue,
      };
      await prisma.feedBrandProfile.upsert({
        where: { instagramAccountId: account.id },
        update: data,
        create: { ...data, instagramAccountId: account.id },
      });
      await logEvent(workspaceId, actor, "guardar_marca", { detail: `@${account.username}` });
      return { ok: true };
    },
  },
  estado_semana: {
    description: "Una semana de una cuenta: tema, acción medible, en qué columna va cada pieza y los comentarios del tablero. Sin fecha, la semana en curso.",
    input: cuenta.extend({ desde: z.string().regex(fechaRe).nullish().describe("Inicio de la semana, AAAA-MM-DD") }),
    run: async ({ cuenta: u, desde }: { cuenta: string; desde?: string | null }, { workspaceId }: Ctx) => {
      const { id } = await accountByUsername(workspaceId, u);
      const week = desde ? await weekByStart(id, desde) : await currentWeek(id);
      return week ? shapeWeek(week) : null;
    },
  },
  metodo: {
    description: "El método de Instagram de Believe, siempre en su última versión. Sin sección da la guía y la lista de secciones.",
    input: z.object({ seccion: z.string().nullish().describe("Por ejemplo oficio, piezas, video o metodo-maas") }),
    run: async ({ seccion }: { seccion?: string | null }) => (await instagramMethod(seccion ?? undefined)) ?? "El método todavía no se ha bajado.",
  },
  generar_semana: {
    description:
      "Encola la generación de una semana completa, con la estrategia de la marca, su voz, el último cierre y los ganadores. Tarda minutos y gasta en el modelo: revisa después con estado_semana.",
    input: cuenta.extend({
      desde: z.string().regex(fechaRe),
      hasta: z.string().regex(fechaRe),
      accion_medible: z.string().min(3),
      materia_prima: z.string().nullish().describe("Cartelera, promos y datos reales. Lo que falte queda como dato por resolver."),
    }),
    run: async (
      i: { cuenta: string; desde: string; hasta: string; accion_medible: string; materia_prima?: string | null },
      { workspaceId, actor }: Ctx
    ) => {
      const req = await requestWeek(
        workspaceId,
        { username: i.cuenta, startsOn: i.desde, endsOn: i.hasta, measurableAction: i.accion_medible, rawMaterial: i.materia_prima },
        actor
      );
      return { en_cola: true, solicitud_id: req.id };
    },
  },
  asignar_pieza: {
    description: "Dice quién hace una pieza: el Estudio, o una persona del equipo por su nombre.",
    input: pieza.extend({ quien: z.string().describe("Estudio, o el nombre de la persona") }),
    run: async ({ pieza_id, quien }: { pieza_id: string; quien: string }, { workspaceId, actor }: Ctx) => {
      if (quien.trim().toLowerCase() === "estudio") {
        await assignPiece(workspaceId, pieza_id, { producedBy: "ESTUDIO" }, actor);
        return { ok: true };
      }
      const equipo = await listTeam();
      const encontrados = equipo.filter((m) => m.name.toLowerCase().includes(quien.trim().toLowerCase()));
      if (encontrados.length !== 1) throw new Error(`Hay ${encontrados.length} personas con ese nombre. Equipo: ${equipo.map((m) => m.name).join(", ")}.`);
      await assignPiece(workspaceId, pieza_id, { producedBy: "DISENO", assigneeId: encontrados[0].id, assigneeName: encontrados[0].name }, actor);
      return { ok: true, asignada_a: encontrados[0].name };
    },
  },
  ultimo_cierre: {
    description: "El cierre más reciente de una cuenta. Es lo primero que se lee antes de escribir una semana.",
    input: cuenta,
    run: async ({ cuenta: u }: z.infer<typeof cuenta>, { workspaceId }: Ctx) => {
      const account = await accountByUsername(workspaceId, u);
      return prisma.feedWeekClosing.findFirst({
        where: { week: { instagramAccountId: account.id }, closedAt: { not: null } },
        orderBy: { closedAt: "desc" },
        include: { week: { select: { startsOn: true, theme: true, measurableAction: true } } },
      });
    },
  },
  crear_semana: {
    description: "Crea la semana de una cuenta, o actualiza su encabezado. Fechas en AAAA-MM-DD.",
    input: cuenta.extend({
      desde: z.string(),
      hasta: z.string(),
      tema: z.string(),
      accion_medible: z.string(),
      referencia: z.string().optional(),
      resumen_loop: z.string().optional(),
    }),
    run: async (
      i: { cuenta: string; desde: string; hasta: string; tema: string; accion_medible: string; referencia?: string; resumen_loop?: string },
      { workspaceId, actor }: Ctx
    ) => {
      const week = await createWeek(
        workspaceId,
        {
          username: i.cuenta,
          startsOn: i.desde,
          endsOn: i.hasta,
          theme: i.tema,
          measurableAction: i.accion_medible,
          baseline: i.referencia,
          loopSummary: i.resumen_loop,
        },
        actor
      );
      return { semana_id: week.id };
    },
  },
  guardar_pieza: {
    description:
      "Crea o reescribe una pieza en guion. Pasa antes el texto por el linter de voz del skill e indica el resultado. Lo que ya está en revisión no se reescribe.",
    input: z.object({
      semana_id: z.string(),
      posicion: z.number().int(),
      dia: z.string(),
      formato: z.enum(["REEL", "CARRUSEL", "HISTORIAS", "POST"]),
      titulo: z.string(),
      gota: z.string().nullish(),
      primeros_3s: z.string().nullish(),
      ganchos: z.array(z.object({ score: z.number().optional(), text: z.string(), chosen: z.boolean().optional() })).optional(),
      guion: z.array(z.object({ time: z.string(), voice: z.string(), screen: z.string() })).optional(),
      caption: z.string().nullish(),
      historias: z.string().nullish(),
      mide: z.string().nullish(),
      lleva_video: z.boolean().optional(),
      linter_limpio: z.boolean(),
      frenada_por: z.string().nullable().optional(),
      motivo: z.string().nullable().optional(),
    }),
    run: async (
      i: {
        semana_id: string;
        posicion: number;
        dia: string;
        formato: "REEL" | "CARRUSEL" | "HISTORIAS" | "POST";
        titulo: string;
        gota?: string | null;
        primeros_3s?: string | null;
        ganchos?: Array<{ score?: number; text: string; chosen?: boolean }>;
        guion?: Array<{ time: string; voice: string; screen: string }>;
        caption?: string | null;
        historias?: string | null;
        mide?: string | null;
        lleva_video?: boolean;
        linter_limpio: boolean;
        frenada_por?: string | null;
        motivo?: string | null;
      },
      { workspaceId, actor }: Ctx
    ) => {
      const p = await savePiece(
        workspaceId,
        {
          weekId: i.semana_id,
          position: i.posicion,
          publishOn: i.dia,
          format: i.formato,
          title: i.titulo,
          drip: i.gota ?? undefined,
          firstThree: i.primeros_3s ?? undefined,
          hooks: i.ganchos,
          script: i.guion,
          caption: i.caption ?? undefined,
          stories: i.historias ?? undefined,
          measures: i.mide ?? undefined,
          needsVideo: i.lleva_video,
          linterClean: i.linter_limpio,
          blockedBy: i.frenada_por,
          blockedReason: i.motivo,
        },
        actor
      );
      return { pieza_id: p.id };
    },
  },
  pasar_a_filtros: {
    description: "Pide revisión de una pieza. No aprueba nada: desde ahí la mueven las personas.",
    input: pieza,
    run: async ({ pieza_id }: z.infer<typeof pieza>, { workspaceId, actor }: Ctx) => {
      const p = await submitPiece(workspaceId, pieza_id, actor);
      return { columna: stageFor(gateState(p)) };
    },
  },
  frenar_pieza: {
    description: "Marca que una pieza espera algo de alguien, o la suelta si quien es null.",
    input: pieza.extend({ quien: z.string().nullable(), motivo: z.string().nullable().optional() }),
    run: async (i: { pieza_id: string; quien: string | null; motivo?: string | null }, { workspaceId, actor }: Ctx) => {
      await setBlocker(workspaceId, i.pieza_id, actor, i.quien, i.motivo ?? null);
      return { ok: true };
    },
  },
  adjuntar_video: {
    description: "Adjunta un MP4 ya terminado, en files.believe-global.com, a una pieza. Cierra la aprobación del MP4 anterior.",
    input: pieza.extend({ url: z.string() }),
    run: async (i: { pieza_id: string; url: string }, { workspaceId, actor }: Ctx) => {
      await attachVideo(workspaceId, i.pieza_id, i.url, actor);
      return { ok: true };
    },
  },
  pedir_reel: {
    description:
      "Encola la producción de un Reel a partir de su ficha (ver references/video.md del skill). Gasta dinero en fal y ElevenLabs por etapas y se detiene a revisión de cuadros antes de los clips.",
    input: pieza.extend({ ficha: fichaSchema }),
    run: async (i: { pieza_id: string; ficha: Ficha }, { workspaceId, actor }: Ctx) => {
      const p = await prisma.feedPiece.findFirst({ where: { id: i.pieza_id, week: { workspaceId } }, include: { job: true } });
      if (!p) throw new Error("Esa pieza no existe en este espacio.");
      if (!p.needsVideo) throw new Error("Esa pieza no lleva video.");
      assertCanProduce(p);
      if (p.job && (p.job.status === "EN_COLA" || p.job.status === "CORRIENDO")) throw new Error("Ya se está produciendo.");
      const hoy = await prisma.feedEvent.count({
        where: { workspaceId, action: "pedir_reel", outcome: "ok", createdAt: { gte: new Date(Date.now() - 86_400_000) } },
      });
      if (hoy >= reelsPerDay()) {
        const detail = `Tope de ${reelsPerDay()} Reels por día alcanzado.`;
        await logEvent(workspaceId, actor, "pedir_reel", { pieceId: p.id, detail, outcome: "rechazado" });
        throw new Error(detail);
      }
      const ficha = i.ficha as unknown as Prisma.InputJsonValue;
      await prisma.feedReelJob.upsert({
        where: { pieceId: p.id },
        update: { ficha, step: "voz", status: "EN_COLA", log: null, audio: Prisma.DbNull },
        create: { pieceId: p.id, ficha },
      });
      await logEvent(workspaceId, actor, "pedir_reel", { pieceId: p.id, detail: p.title });
      return { en_cola: true };
    },
  },
} as const;

type ToolName = keyof typeof TOOLS;

/** Convierte un esquema zod en el JSON Schema que espera MCP. */
function schemaOf(input: z.ZodType) {
  const schema = z.toJSONSchema(input) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

const WRITES = new Set<ToolName>(["generar_semana", "asignar_pieza", "guardar_marca", "crear_semana", "guardar_pieza", "pasar_a_filtros", "frenar_pieza", "adjuntar_video", "pedir_reel"]);

/** Atiende un mensaje JSON-RPC. Devuelve null para las notificaciones, que no llevan respuesta. */
export async function handleRpc(message: { id?: unknown; method?: string; params?: Record<string, unknown> }, ctx: Ctx) {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: message.id ?? null, result });
  const fail = (code: number, text: string) => ({ jsonrpc: "2.0", id: message.id ?? null, error: { code, message: text } });

  switch (message.method) {
    case "initialize":
      return reply({
        protocolVersion: (message.params?.protocolVersion as string) ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "befeed", version: "1.0.0" },
        instructions:
          "BeFeed guarda la operación de Instagram orgánico de cada marca. Para una semana nueva usa generar_semana. Si la escribes tú, lee antes metodo, ultimo_cierre, marca y metricas. Tú propones: aprobar y publicar los hacen las personas, en el panel o en el tablero de MAAS2.",
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: schemaOf(t.input),
          annotations: { readOnlyHint: !WRITES.has(name as ToolName) },
        })),
      });
    case "tools/call": {
      const name = message.params?.name as ToolName;
      const tool = TOOLS[name];
      if (!tool) return fail(-32602, `No existe la herramienta ${String(name)}.`);
      const args = tool.input.safeParse(message.params?.arguments ?? {});
      const asResult = (text: string, isError = false) => reply({ content: [{ type: "text", text }], isError });
      if (!args.success) return asResult(`Datos inválidos: ${args.error.message}`, true);
      try {
        const out = await (tool.run as (i: unknown, c: Ctx) => Promise<unknown>)(args.data, ctx);
        return asResult(JSON.stringify(out ?? null));
      } catch (error) {
        return asResult(error instanceof Error ? error.message : "Falló la herramienta.", true);
      }
    }
    default:
      if (message.method?.startsWith("notifications/")) return null;
      return fail(-32601, `Método desconocido: ${String(message.method)}`);
  }
}
