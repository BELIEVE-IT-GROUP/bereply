/**
 * Las puertas de una pieza. El estado se deriva de lo aprobado, no se guarda a
 * mano, para que el tablero no pueda contradecir las aprobaciones.
 *
 * Regla del producto: el agente propone y las personas aprueban. Abrir una
 * puerta y publicar quedan fuera de su alcance, sin importar el token que use.
 */

export const FEED_STAGES = ["GUION", "FILTROS", "CLIENTE", "VIDEO", "LISTA", "PUBLICADA"] as const;
export type Stage = (typeof FEED_STAGES)[number];

export const GATES = ["DANIELA", "JORGE", "CLIENTE", "MP4"] as const;
export type Gate = (typeof GATES)[number];

export type Actor = { type: "person" | "agent"; name: string };

export type PieceGateState = {
  stage: Stage;
  gatesPassed: string[];
  needsVideo: boolean;
  linterClean: boolean;
  blockedBy: string | null;
  videoUrl: string | null;
  instagramMediaId: string | null;
};

export class GateError extends Error {}

const GATE_STAGE: Record<Gate, Stage> = { DANIELA: "FILTROS", JORGE: "FILTROS", CLIENTE: "CLIENTE", MP4: "VIDEO" };

function requiredGates(piece: Pick<PieceGateState, "needsVideo">): Gate[] {
  return piece.needsVideo ? ["DANIELA", "JORGE", "CLIENTE", "MP4"] : ["DANIELA", "JORGE", "CLIENTE"];
}

export function nextGate(piece: PieceGateState): Gate | null {
  return requiredGates(piece).find((gate) => !piece.gatesPassed.includes(gate)) ?? null;
}

/** En qué columna va la pieza según lo que ya se aprobó. */
export function stageFor(piece: PieceGateState): Stage {
  if (piece.instagramMediaId) return "PUBLICADA";
  if (piece.stage === "GUION") return "GUION";
  const gate = nextGate(piece);
  return gate ? GATE_STAGE[gate] : "LISTA";
}

function assertPerson(actor: Actor, what: string) {
  if (actor.type !== "person") throw new GateError(`${what} lo hace una persona, no el agente.`);
}

/** Pasa el guion a filtros. El agente sí puede: no aprueba nada, solo pide revisión. */
export function submitForReview(piece: PieceGateState): PieceGateState {
  if (piece.stage !== "GUION") throw new GateError("La pieza ya salió de guion.");
  if (piece.blockedBy) throw new GateError(`Está frenada: la tiene ${piece.blockedBy}.`);
  if (!piece.linterClean) throw new GateError("El linter de voz tiene que estar limpio.");
  const next = { ...piece, stage: "FILTROS" as Stage };
  return { ...next, stage: stageFor(next) };
}

export function approve(piece: PieceGateState, gate: Gate, actor: Actor): PieceGateState {
  assertPerson(actor, "Aprobar");
  if (piece.stage === "GUION") throw new GateError("Primero hay que pasar la pieza a filtros.");
  if (piece.blockedBy) throw new GateError(`Está frenada: la tiene ${piece.blockedBy}.`);
  if (!requiredGates(piece).includes(gate)) throw new GateError("Esta pieza no pasa por esa puerta.");
  if (piece.gatesPassed.includes(gate)) throw new GateError("Esa puerta ya está abierta.");
  if (gate === "MP4" && !piece.videoUrl) throw new GateError("Todavía no hay MP4 para aprobar.");
  const next = { ...piece, gatesPassed: [...piece.gatesPassed, gate] };
  return { ...next, stage: stageFor(next) };
}

/** Pedir cambios devuelve la pieza a guion y cierra todas las puertas: el texto cambió. */
export function requestChanges(piece: PieceGateState, actor: Actor): PieceGateState {
  assertPerson(actor, "Pedir cambios");
  return { ...piece, stage: "GUION", gatesPassed: [] };
}

export function markPublished(piece: PieceGateState, instagramMediaId: string, actor: Actor): PieceGateState {
  assertPerson(actor, "Publicar");
  if (stageFor(piece) !== "LISTA") throw new GateError("Solo se publica lo que pasó todas las puertas.");
  return { ...piece, instagramMediaId, stage: "PUBLICADA" };
}

/** El Reel se paga después de los dos filtros internos: un Reel rehecho cuesta plata, un guion rehecho no. */
export function assertCanProduce(piece: Pick<PieceGateState, "gatesPassed" | "blockedBy">) {
  if (piece.blockedBy) throw new GateError(`Está frenada: la tiene ${piece.blockedBy}.`);
  const faltan = (["DANIELA", "JORGE"] as const).filter((g) => !piece.gatesPassed.includes(g));
  if (faltan.length) throw new GateError(`Antes de producir falta el filtro de ${faltan.map((g) => (g === "DANIELA" ? "Daniela" : "Jorge")).join(" y ")}.`);
}
