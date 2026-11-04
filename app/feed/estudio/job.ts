import type { FeedJobStatus } from "@/app/generated/prisma/client";

export const JOB_LABEL: Record<FeedJobStatus, string> = {
  BORRADOR: "Ficha por revisar",
  EN_COLA: "En cola",
  CORRIENDO: "Produciendo",
  ESPERA_REVISION: "Revisar cuadros",
  LISTO: "Listo",
  FALLO: "Falló",
};

/** Lo que se paga va por etapas: los clips, que son lo caro, solo corren después de revisar los cuadros. */
export const JOB_STEPS = [
  { id: "ficha", label: "Ficha", paga: false },
  { id: "voz", label: "Voz, música y cuadros", paga: true },
  { id: "revision", label: "Revisión de cuadros", paga: false },
  { id: "clips", label: "Clips", paga: true },
  { id: "armar", label: "Armado", paga: false },
  { id: "aprobacion", label: "Jorge aprueba", paga: false },
] as const;
