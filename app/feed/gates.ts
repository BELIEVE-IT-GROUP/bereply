import type { Gate, Stage } from "@/lib/feed/stages";

export const GATE_LABEL: Record<Gate, string> = {
  DANIELA: "Filtro de Daniela",
  JORGE: "Filtro de Jorge",
  CLIENTE: "OK del cliente",
  MP4: "Aprobar el MP4",
};

export const GATE_HINT: Record<Gate, string> = {
  DANIELA: "Voz, veracidad de las promos y objetivo",
  JORGE: "Estrategia y tono",
  CLIENTE: "Promos, convenios y redacción",
  MP4: "Imagen, voz y lectura en pantalla",
};

export const STAGE_LABEL: Record<Stage, string> = {
  GUION: "Guion",
  FILTROS: "Filtros",
  CLIENTE: "Cliente",
  VIDEO: "Video",
  LISTA: "Lista",
  PUBLICADA: "Publicada",
};

export const STAGE_EMPTY: Record<Stage, string> = {
  GUION: "El agente deja aquí lo que escribe.",
  FILTROS: "Lo que revisan Daniela y Jorge.",
  CLIENTE: "Lo que espera el OK del cliente.",
  VIDEO: "Reels aprobados que el estudio puede producir.",
  LISTA: "Daniela publica desde aquí. El agente no puede.",
  PUBLICADA: "Las métricas se llenan solas desde Meta.",
};

export const FORMAT_LABEL: Record<string, string> = { REEL: "Reel", CARRUSEL: "Carrusel", HISTORIAS: "Historias", POST: "Post" };
