/**
 * Le pregunta a BeAds si el texto de un anuncio cumple su mandato. La regla vive allá:
 * copiarla aquí crearía dos versiones. Si BeAds no responde, la pieza no sale al tablero.
 */
import type { Anuncio } from "./anuncio";

export type AdCheck =
  | { estado: "ok"; avisos?: unknown[] }
  | { estado: "bloqueada"; motivo: string; avisos?: unknown[] }
  | { estado: "pendiente"; motivo: string }
  | { estado: "configuracion"; motivo: string };

const URL_BASE = () => (process.env.BEADS_BEFEED_URL ?? "https://ads.believe-global.com").replace(/\/$/, "");

export async function validarEnBeads(maas2ProyectoId: string, ad: Anuncio): Promise<AdCheck> {
  const key = process.env.BEADS_BEFEED_KEY;
  if (!key) return { estado: "configuracion", motivo: "La validación con BeAds todavía no está conectada." };
  try {
    const res = await fetch(`${URL_BASE()}/api/v1/befeed/validar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Beads-Befeed-Key": key },
      body: JSON.stringify({
        maas2_proyecto_id: maas2ProyectoId,
        canal: "meta",
        titular: ad.titular,
        mensaje: ad.mensaje,
        descripcion: ad.descripcion,
        enlace: ad.enlace,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    // Un texto prohibido llega como 200 con ok:false. Un 422 puede ser la marca sin mandato o un campo vacío: su detalle lo dice.
    if (res.status === 422) return { estado: "configuracion", motivo: `BeAds no pudo validarla: ${(await res.text()).slice(0, 240)}` };
    if (res.status === 401) return { estado: "configuracion", motivo: "BeAds rechazó la llave de BeFeed." };
    if (!res.ok) return { estado: "pendiente", motivo: `BeAds respondió ${res.status}.` };
    const out = (await res.json()) as { ok: boolean; claims?: string[]; marcadores?: string[]; avisos?: unknown[] };
    if (out.ok) return { estado: "ok", avisos: out.avisos };
    const partes = [
      out.claims?.length ? `Prohibido por el mandato: ${out.claims.join(", ")}.` : "",
      out.marcadores?.length ? `Datos sin resolver: ${out.marcadores.join(", ")}.` : "",
    ];
    return { estado: "bloqueada", motivo: partes.filter(Boolean).join(" ") || "BeAds rechazó el texto.", avisos: out.avisos };
  } catch {
    return { estado: "pendiente", motivo: "BeAds no respondió." };
  }
}
