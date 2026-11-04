import { describe, expect, it } from "vitest";
import { fichaSchema } from "@/lib/feed/ficha";
import { median, skipSeparation, summarize, winners, worstHook, type ReelStats } from "@/lib/feed/insights";
import {
  approve,
  GateError,
  markPublished,
  nextGate,
  requestChanges,
  stageFor,
  submitForReview,
  type Actor,
  type PieceGateState,
} from "@/lib/feed/stages";

const jorge: Actor = { type: "person", name: "Jorge" };
const claude: Actor = { type: "agent", name: "Claude" };
const guion: PieceGateState = {
  stage: "GUION",
  gatesPassed: [],
  needsVideo: true,
  linterClean: true,
  blockedBy: null,
  videoUrl: null,
  instagramMediaId: null,
};

describe("puertas", () => {
  it("el agente no puede aprobar, pedir cambios ni publicar", () => {
    const filtros = submitForReview(guion);
    expect(() => approve(filtros, "DANIELA", claude)).toThrow(GateError);
    expect(() => requestChanges(filtros, claude)).toThrow(GateError);
    const lista = { ...filtros, needsVideo: false, gatesPassed: ["DANIELA", "JORGE", "CLIENTE"] };
    expect(() => markPublished(lista, "1", claude)).toThrow(GateError);
  });

  it("recorre filtros, cliente, video y lista", () => {
    let p = submitForReview(guion);
    expect(p.stage).toBe("FILTROS");
    p = approve(p, "DANIELA", jorge);
    p = approve(p, "JORGE", jorge);
    expect(p.stage).toBe("CLIENTE");
    p = approve(p, "CLIENTE", jorge);
    expect(p.stage).toBe("VIDEO");
    expect(() => approve(p, "MP4", jorge)).toThrow("MP4");
    p = approve({ ...p, videoUrl: "https://x/r.mp4" }, "MP4", jorge);
    expect(p.stage).toBe("LISTA");
    expect(nextGate(p)).toBeNull();
    expect(markPublished(p, "178", jorge).stage).toBe("PUBLICADA");
  });

  it("una pieza sin video no pasa por la puerta del MP4", () => {
    let p = submitForReview({ ...guion, needsVideo: false });
    for (const g of ["DANIELA", "JORGE", "CLIENTE"] as const) p = approve(p, g, jorge);
    expect(p.stage).toBe("LISTA");
    expect(() => approve(p, "MP4", jorge)).toThrow("no pasa");
  });

  it("no se publica lo que no pasó todas las puertas", () => {
    expect(() => markPublished(submitForReview(guion), "1", jorge)).toThrow("Solo se publica");
  });

  it("una pieza frenada o con linter sucio no avanza", () => {
    expect(() => submitForReview({ ...guion, blockedBy: "Milena" })).toThrow("Milena");
    expect(() => submitForReview({ ...guion, linterClean: false })).toThrow("linter");
    expect(() => approve({ ...submitForReview(guion), blockedBy: "Luis" }, "DANIELA", jorge)).toThrow("Luis");
  });

  it("pedir cambios vuelve a guion y cierra las puertas", () => {
    const p = approve(submitForReview(guion), "DANIELA", jorge);
    const q = requestChanges(p, jorge);
    expect(q.stage).toBe("GUION");
    expect(q.gatesPassed).toEqual([]);
  });

  it("el estado se deriva de lo aprobado, aunque lleguen en otro orden", () => {
    const p = { ...guion, stage: "FILTROS" as const, gatesPassed: ["JORGE", "MP4"], videoUrl: "u" };
    expect(nextGate(p)).toBe("DANIELA");
    expect(stageFor(p)).toBe("FILTROS");
  });
});

// Los 8 Reels reales de @cinemauniplaza leídos el 2026-11-04.
const uniplaza: ReelStats[] = [
  [198, 2755, 87.2],
  [321, 4774, 78.8],
  [318, 5712, 66.4],
  [1875, 12851, 38.7],
  [381, 5717, 69.6],
  [1466, 8475, 40.7],
  [1422, 10677, 41.5],
  [304, 9151, 80.8],
].map(([views, avgWatchMs, skipRate], i) => ({
  instagramMediaId: String(i),
  caption: null,
  publishedAt: new Date(0),
  views,
  avgWatchMs,
  skipRate,
}));

describe("lecturas de los Reels", () => {
  it("da las medianas de Uniplaza", () => {
    expect(summarize(uniplaza)).toEqual({ count: 8, medianViews: 351, medianWatchMs: 7096, medianSkip: 68 });
  });

  it("encuentra los tres ganadores de Uniplaza", () => {
    expect(winners(uniplaza).map((r) => r.multiple)).toEqual([5.3, 4.2, 4.1]);
  });

  it("dice la separación de salto cuando existe", () => {
    expect(skipSeparation(uniplaza)).toEqual({ topCount: 3, topMaxSkip: 41.5, restCount: 5, restMinSkip: 66.4, restMaxViews: 381 });
  });

  it("calla si los grupos se cruzan", () => {
    const cruzado = uniplaza.map((r) => (r.instagramMediaId === "3" ? { ...r, skipRate: 70 } : r));
    expect(skipSeparation(cruzado)).toBeNull();
  });

  it("señala el peor gancho", () => {
    expect(worstHook(uniplaza)?.skipRate).toBe(87.2);
  });

  it("no inventa datos si no hay", () => {
    expect(median([null, undefined])).toBeNull();
    expect(winners([])).toEqual([]);
    expect(worstHook([])).toBeNull();
  });
});

const fichaBase = {
  logo_url: "https://files.believe-global.com/brand/logo.png",
  acento: "#00A9E0",
  fondo: "#0B1438",
  musica_prompt: "Upbeat instrumental",
  voz: { id: "EXAVITQu4vr4xnSDxMaL", texto: "El plan del viernes." },
  estilo_cuadro: "Vertical",
  estilo_video: "Smooth",
  planos: [{ id: "p1", cuadro: "Una boleta", movimiento: "Cae", texto: [{ t: "3 PASOS", tipo: "b", en: "tres#2" }] }],
  cierre: { url: "cinemauniplaza.com.co" },
};

describe("ficha de un Reel", () => {
  it("acepta una ficha normal y pone los valores por defecto", () => {
    const f = fichaSchema.parse(fichaBase);
    expect(f.salida).toBe("reel.mp4");
    expect(f.voz.velocidad).toBe(1);
  });

  it.each([
    ["salida", { salida: "../../etc/x.mp4" }],
    ["logo", { logo: "../logo.png" }],
    ["musica", { musica: "/tmp/m.wav" }],
    ["plano", { planos: [{ ...fichaBase.planos[0], id: "../../x" }] }],
    ["plano con barra", { planos: [{ ...fichaBase.planos[0], id: "a/b" }] }],
  ])("rechaza rutas fuera de la carpeta: %s", (_, extra) => {
    expect(fichaSchema.safeParse({ ...fichaBase, ...extra }).success).toBe(false);
  });

  it.each([
    "http://files.believe-global.com/l.png",
    "https://169.254.169.254/latest/meta-data",
    "http://openreply-postgres:5432/",
    "https://files.believe-global.com.evil.com/l.png",
    "file:///etc/passwd",
  ])("rechaza descargar el logo de %s", (logo_url) => {
    expect(fichaSchema.safeParse({ ...fichaBase, logo_url }).success).toBe(false);
  });

  it("rechaza planos repetidos, porque se pisarían los archivos", () => {
    const planos = [fichaBase.planos[0], fichaBase.planos[0]];
    expect(fichaSchema.safeParse({ ...fichaBase, planos }).success).toBe(false);
  });
});
