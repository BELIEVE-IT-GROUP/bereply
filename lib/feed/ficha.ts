/**
 * Valida la ficha de un Reel. La escribe un agente y sus nombres llegan a rutas de
 * disco y a una descarga del servidor, así que no se confía en ella: un nombre con
 * "../" escribiría fuera de la carpeta del trabajo y una URL libre dejaría al
 * servidor pedir direcciones internas.
 */
import { z } from "zod";

const nombre = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/, "Solo letras, números, guion y guion bajo.");
const archivo = (ext: string) =>
  z.string().regex(new RegExp(`^[A-Za-z0-9][A-Za-z0-9_-]{0,60}\\.${ext}$`), `Nombre de archivo .${ext} sin carpetas.`);

const HOSTS_DE_LOGO = new Set(["files.believe-global.com", "esptwxlgdbblvnmdpoao.supabase.co"]);

const logoUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && HOSTS_DE_LOGO.has(url.hostname);
  } catch {
    return false;
  }
}, "El logo tiene que venir de Maasy o de files.believe-global.com.");

/** Un MP4 terminado solo se adjunta desde el R2 de Believe: es lo que Daniela va a publicar. */
export const videoUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "files.believe-global.com" && url.pathname.endsWith(".mp4");
  } catch {
    return false;
  }
}, "El video tiene que ser un .mp4 en files.believe-global.com.");

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color en formato #RRGGBB.");
const ancla = z.string().regex(/^\S+(#\d+)?$/, "Una palabra de la voz, y #2 si es la segunda vez.");

const texto = z.object({
  t: z.string().min(1).max(60),
  tipo: z.enum(["s", "b", "n", "cta"]),
  en: ancla,
});

const plano = z.object({
  id: nombre,
  desde: ancla.optional(),
  cuadro: z.string().min(1).max(1500),
  movimiento: z.string().min(1).max(800),
  texto: z.array(texto).max(4).default([]),
});

export const fichaSchema = z
  .object({
    salida: archivo("mp4").default("reel.mp4"),
    logo: archivo("png").default("logo.png"),
    logo_url: logoUrl,
    acento: color,
    fondo: color,
    musica: archivo("wav").default("musica.wav"),
    musica_prompt: z.string().min(1).max(1000),
    musica_ms: z.number().int().min(5000).max(60000).default(24000),
    voz_inicio: z.number().min(0).max(5).default(0.5),
    voz: z.object({
      id: nombre,
      tag: z.string().max(200).default(""),
      texto: z.string().min(1).max(1200),
      velocidad: z.number().min(0.8).max(1.2).default(1),
    }),
    estilo_cuadro: z.string().max(800),
    estilo_video: z.string().max(400),
    negativo: z.string().max(400).default(""),
    planos: z.array(plano).min(1).max(12),
    cierre: z.object({
      url: z.string().min(1).max(60),
      tras_voz: z.number().min(0).max(3).default(0.15),
      dura: z.number().min(0.5).max(4).default(1.3),
    }),
  })
  .refine((f) => new Set(f.planos.map((p) => p.id)).size === f.planos.length, "Hay planos con el mismo id.");

export type Ficha = z.infer<typeof fichaSchema>;

/** Cuántos Reels puede encolar el agente por día. Cada uno gasta dinero. */
export const reelsPerDay = () => Number(process.env.FEED_MAX_REELS_DAY ?? 5);
