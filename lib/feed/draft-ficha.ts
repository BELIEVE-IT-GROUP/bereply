/**
 * Convierte el guion de una pieza en el borrador de su ficha de producción.
 * Lo que sale del guion se calcula (voz, cortes y textos); lo visual lo propone
 * el modelo y lo revisa una persona antes de gastar.
 */
import { getClient } from "@/lib/ai/responder";
import { GateError } from "./stages";

export type ScriptRow = { time: string; voice: string; screen: string };

const PUNT = /^[.,:;¿?¡!%"']+|[.,:;¿?¡!%"']+$/g;
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

/** Quita lo que no se dice: acotaciones entre paréntesis. */
export const spoken = (voice: string) => voice.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
const clean = (text: string) => text.replace(EMOJI, "").replace(/\s+/g, " ").trim();
const norm = (word: string) => word.toLowerCase().replace(PUNT, "");

export type DraftPlan = {
  id: string;
  desde?: string;
  /** Lo que el guion dice que se ve en este plano. Guía para escribir los prompts. */
  nota: string;
  cuadro: string;
  movimiento: string;
  texto: Array<{ t: string; tipo: "s" | "b" | "n" | "cta"; en: string }>;
};

/** Parte el guion en planos. Una fila sin voz no tiene palabra donde anclar el corte: se une a la anterior. */
export function planFromScript(rows: ScriptRow[]) {
  const pendientes = rows.flatMap((r) => [r.voice, r.screen]).filter((t) => t.includes("{{"));
  if (pendientes.length) throw new GateError("El guion tiene datos sin resolver: complétalos antes de producir.");

  const vistas = new Map<string, number>();
  const anchor = (word: string) => {
    const w = norm(word);
    const n = (vistas.get(w) ?? 0) + 1;
    vistas.set(w, n);
    return n === 1 ? w : `${w}#${n}`;
  };

  const planos: DraftPlan[] = [];
  const voz: string[] = [];
  for (const row of rows) {
    const dicho = spoken(row.voice);
    // Lo que va entre paréntesis es dirección, no texto: nunca se quema en el video.
    const pantalla = clean(row.screen.replace(/\([^)]*\)/g, " "));
    const nota = `${row.voice} ${clean(row.screen) ? `[en pantalla: ${clean(row.screen)}]` : ""}`.trim();
    if (!dicho) {
      if (planos.length) planos[planos.length - 1].nota += ` / ${nota}`;
      continue;
    }
    voz.push(dicho);
    const anclas = dicho.split(" ").map(anchor);
    const primera = anclas[0];
    const texto: DraftPlan["texto"] = [];
    const numerado = pantalla.match(/^(\d+)\s*·\s*(.+)$/);
    if (numerado) {
      texto.push({ t: numerado[1], tipo: "n", en: primera }, { t: numerado[2], tipo: "b", en: anclas[1] ?? primera });
    } else if (pantalla && pantalla.length <= 60 && !/\.(com|co|net|org)\b/i.test(pantalla)) {
      texto.push({ t: pantalla, tipo: "b", en: primera });
    }
    planos.push({
      id: `p${planos.length + 1}`,
      ...(planos.length ? { desde: primera } : {}),
      nota,
      cuadro: "",
      movimiento: "",
      texto,
    });
  }
  if (planos.length === 0) throw new GateError("El guion no tiene voz: no hay de dónde sacar los cortes.");

  const web = rows.map((r) => clean(r.screen)).find((s) => /\.(com|co|net|org)\b/i.test(s));
  return { voz: voz.join(" "), planos, web: web?.split(" ").find((s) => s.includes(".")) ?? "" };
}

const SYSTEM = `You write image and video prompts for a short vertical Instagram Reel.
For each shot return "cuadro" (a still image prompt) and "movimiento" (how that image moves, for image-to-video).
Rules:
- English, one or two concrete sentences each.
- Never ask for text, letters, numbers, logos, signs or watermarks in the image: text is added later in code.
- Objects, atmosphere and generic people only. Never depict a real venue, a real customer or a testimonial.
- No identifiable brands, trailers or movie characters.
Also return "estilo_cuadro" (the visual style shared by every image, always ending with "Absolutely NO text, letters, numbers, logos, signs or watermarks anywhere.") and "musica_prompt" (an instrumental music prompt that fits the piece).
Answer only with JSON: {"estilo_cuadro":"","musica_prompt":"","planos":[{"cuadro":"","movimiento":""}]}`;

/** Propone lo visual. Si el modelo falla, el borrador queda vacío para escribirlo a mano: nunca frena el envío. */
export async function suggestVisuals(title: string, planos: DraftPlan[], brand: string) {
  try {
    const response = await getClient().chat.completions.create({
      model: "believe-smart",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Marca: ${brand}\nPieza: ${title}\nPlanos:\n${planos.map((p, i) => `${i + 1}. ${p.nota}`).join("\n")}` },
      ],
    });
    const raw = response.choices[0]?.message?.content ?? "";
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
      estilo_cuadro?: string;
      musica_prompt?: string;
      planos?: Array<{ cuadro?: string; movimiento?: string }>;
    };
    return {
      estilo_cuadro: json.estilo_cuadro ?? "",
      musica_prompt: json.musica_prompt ?? "",
      planos: planos.map((p, i) => ({ ...p, cuadro: json.planos?.[i]?.cuadro ?? "", movimiento: json.planos?.[i]?.movimiento ?? "" })),
    };
  } catch (error) {
    console.error("[feed] no se pudieron sugerir los visuales:", error instanceof Error ? error.message : error);
    return { estilo_cuadro: "", musica_prompt: "", planos };
  }
}

/** La primera palabra de la voz, tal como la nombran las anclas de los planos. */
export const firstWord = (voz: string) => norm(voz.split(" ")[0] ?? "");

/** Cambia el texto principal de un plano. Vacío, lo quita. Un plano sin texto lo estrena en su primera palabra. */
export function withScreenText(plan: Partial<Pick<DraftPlan, "texto" | "desde">>, text: string, first?: string): DraftPlan["texto"] {
  const textos = plan.texto ?? [];
  const main = textos.findIndex((x) => x.tipo !== "n");
  if (!text) return main < 0 ? textos : textos.filter((_, i) => i !== main);
  if (main >= 0) return textos.map((x, i) => (i === main ? { ...x, t: text } : x));
  const en = plan.desde ?? first;
  return en ? [...textos, { t: text, tipo: "b", en }] : textos;
}
