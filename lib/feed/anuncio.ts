/**
 * Una pieza de pauta: su texto, lo que el cliente ve en el tablero y la huella que une
 * las dos cosas. Contrato con BeAds: https://claude.ai/artifact/HrEMF3Kqs2VgzThz9TJ5mB
 *
 * La huella detecta cambios accidentales después de aprobar. No es seguridad: es un
 * sha256 sin llave, y quien pueda escribir metadata puede recalcularla.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

// Solo los verificados con BeAds y Meta. WhatsApp exige un conjunto con ese destino.
export const LLAMADOS: Record<string, string> = {
  LEARN_MORE: "Más información",
  BUY_TICKETS: "Comprar boletas",
  WHATSAPP_MESSAGE: "Enviar mensaje, solo para campañas a WhatsApp",
};

const texto = z.string().trim().refine((v) => !v.includes("{{"), "Hay un dato sin resolver.");

/** Lo que BeAds usa tal cual: mismas claves de plan_campana.Anuncio. */
export const anuncioSchema = z.object({
  titular: texto.min(1, "Falta el titular."),
  mensaje: texto.min(1, "Falta el texto."),
  descripcion: texto.default(""),
  enlace: z.url("El enlace no es válido.").refine((v) => v.startsWith("https://"), "El enlace debe ser https."),
  llamado: z.string().refine((v) => v in LLAMADOS, "Elige un llamado a la acción."),
  vigencia: z
    .object({ desde: z.iso.datetime({ offset: true }), hasta: z.iso.datetime({ offset: true }) })
    .refine((v) => new Date(v.desde) < new Date(v.hasta), "La vigencia termina antes de empezar."),
});
export type Anuncio = z.infer<typeof anuncioSchema>;
export type Formato = { ratio: string; video_url?: string; imagen_url?: string; miniatura_url?: string };

const norm = (s: string) => s.replace(/\r\n/g, "\n").normalize("NFC").trim();
export const sameText = (a: string | null | undefined, b: string | null | undefined) => norm(a ?? "") === norm(b ?? "");

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "del 12 al 18 de noviembre". Las fechas ya vienen en hora de Colombia. */
function rango({ desde, hasta }: Anuncio["vigencia"]) {
  const [, m1, d1] = desde.slice(0, 10).split("-").map(Number);
  const [, m2, d2] = hasta.slice(0, 10).split("-").map(Number);
  if (m1 === m2) return d1 === d2 ? `el ${d1} de ${MESES[m1 - 1]}` : `del ${d1} al ${d2} de ${MESES[m1 - 1]}`;
  return `del ${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]}`;
}

/** Lo que el cliente lee y aprueba: va en la Descripción de la pieza. */
export function adDescription(ad: Anuncio) {
  return [
    `Titular: ${ad.titular}`,
    `Texto: ${ad.mensaje}`,
    ...(ad.descripcion ? [`Descripción: ${ad.descripcion}`] : []),
    `Llamado: ${LLAMADOS[ad.llamado] ?? ad.llamado}`,
    `Enlace: ${ad.enlace}`,
    `Vigencia: ${rango(ad.vigencia)}`,
  ].join("\n");
}

/** El medio del anuncio. Varias imágenes son un carrusel: va vacío y BeAds lee los archivos. */
export function formatosFor(format: string, videoUrl: string | null, thumbnailUrl: string | null, images: string[]): Formato[] {
  const ratio = format === "POST" || format === "CARRUSEL" ? "4:5" : "9:16";
  if (videoUrl) return [{ ratio, video_url: videoUrl, ...(thumbnailUrl ? { miniatura_url: thumbnailUrl } : {}) }];
  return images.length === 1 ? [{ ratio, imagen_url: images[0] }] : [];
}

function canon(value: unknown): unknown {
  if (typeof value === "string") return norm(value);
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, canon(v)]));
  }
  return value;
}

/** Versión 1. El caso de prueba está en __tests__/feed.test.ts y debe dar igual en BeAds. */
export function huella(ad: Anuncio & { formatos: Formato[] }, description: string, archivos: string[]) {
  const { titular, mensaje, descripcion, enlace, llamado, vigencia, formatos } = ad;
  const entrada = { ad: { titular, mensaje, descripcion, enlace, llamado, vigencia, formatos }, archivos, description };
  return `sha256:${createHash("sha256").update(JSON.stringify(canon(entrada)), "utf8").digest("hex")}`;
}

/** Fecha de un formulario, en hora de Colombia. */
export const vigenciaFrom = (desde: string, hasta: string) => ({ desde: `${desde}T00:00:00-05:00`, hasta: `${hasta}T23:59:00-05:00` });
