import { afterEach, describe, expect, it, vi } from "vitest";
import { adDescription, formatosFor, huella, sameText, anuncioSchema } from "@/lib/feed/anuncio";
import { validarEnBeads } from "@/lib/feed/beads";
import { authorizedKey, pedidoSchema, requestState } from "@/lib/feed/pedidos";
import { adWinners } from "@/lib/feed/resultados";
import { adTextChanged, decideFromBoard, filesFromBoard } from "@/lib/feed/board-sync";
import { planFromScript, withScreenText } from "@/lib/feed/draft-ficha";
import { textsToLint, unsourcedFigures } from "@/lib/feed/generate";
import { boardName, boardStage, readyForBoard } from "@/lib/feed/maas2";
import { fichaSchema, videoUrlSchema } from "@/lib/feed/ficha";
import { median, skipSeparation, summarize, winners, worstHook, type ReelStats } from "@/lib/feed/insights";
import {
  approve,
  assertCanProduce,
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

describe("video adjunto", () => {
  it("acepta un MP4 del R2 de Believe", () => {
    expect(videoUrlSchema.safeParse("https://files.believe-global.com/clientes/uniplaza/a.mp4").success).toBe(true);
  });

  it.each([
    "http://files.believe-global.com/a.mp4",
    "https://files.believe-global.com/a.exe",
    "https://files.believe-global.com.evil.com/a.mp4",
    "https://otro.com/a.mp4",
    "no es una url",
  ])("rechaza %s", (url) => {
    expect(videoUrlSchema.safeParse(url).success).toBe(false);
  });
});

describe("del guion a la ficha", () => {
  const guion = [
    { time: "0 a 2 s", voice: "El plan del viernes, armado en tres pasos.", screen: "3 PASOS" },
    { time: "2 a 5 s", voice: "¿Ya sabes con quién vas? Listo.", screen: "¿YA SABES CON QUIÉN?" },
    { time: "5 a 9 s", voice: "Uno: la boleta, desde el celular.", screen: "1 · BOLETA EN LA WEB" },
    { time: "9 a 13 s", voice: "(cámara lenta del caramelo)", screen: "🍿" },
    { time: "13 a 16 s", voice: "Tres: el parqueo, resuelto. (carro)", screen: "3 · PARQUEO RESUELTO 🚗" },
    { time: "16 a 18 s", voice: "El plan es Uniplaza.", screen: "cinemauniplaza.com.co" },
  ];

  it("saca solo lo que se dice para la voz", () => {
    const { voz } = planFromScript(guion);
    expect(voz).not.toContain("cámara lenta");
    expect(voz).toContain("Tres: el parqueo, resuelto.");
  });

  it("une al plano anterior una fila sin voz, porque no tiene palabra donde cortar", () => {
    const { planos } = planFromScript(guion);
    expect(planos).toHaveLength(5);
    expect(planos[2].nota).toContain("cámara lenta");
  });

  it("ancla los cortes a la vez correcta de cada palabra", () => {
    const { planos } = planFromScript(guion);
    expect(planos[0].desde).toBeUndefined();
    expect(planos[1].desde).toBe("¿ya".replace("¿", ""));
    expect(planos[3].desde).toBe("tres#2");
    expect(planos[4].desde).toBe("el#4");
  });

  it("separa el número del paso y limpia los emojis", () => {
    const { planos } = planFromScript(guion);
    expect(planos[3].texto).toEqual([
      { t: "3", tipo: "n", en: "tres#2" },
      { t: "PARQUEO RESUELTO", tipo: "b", en: "el#3" },
    ]);
  });

  it("deja la web para el cierre y no como texto de un plano", () => {
    const { planos, web } = planFromScript(guion);
    expect(web).toBe("cinemauniplaza.com.co");
    expect(planos[4].texto).toEqual([]);
  });

  it("no acepta un guion con datos sin resolver ni sin voz", () => {
    expect(() => planFromScript([{ time: "0", voice: "Tarea: {{película}}", screen: "" }])).toThrow("sin resolver");
    expect(() => planFromScript([{ time: "0", voice: "(solo imagen)", screen: "" }])).toThrow("no tiene voz");
  });

  it("solo se produce después de los dos filtros y sin freno", () => {
    expect(() => assertCanProduce({ gatesPassed: [], blockedBy: null })).toThrow("Daniela y Jorge");
    expect(() => assertCanProduce({ gatesPassed: ["DANIELA"], blockedBy: null })).toThrow("Jorge");
    expect(() => assertCanProduce({ gatesPassed: ["DANIELA", "JORGE"], blockedBy: "Luis" })).toThrow("Luis");
    expect(() => assertCanProduce({ gatesPassed: ["DANIELA", "JORGE"], blockedBy: null })).not.toThrow();
  });
});

describe("tablero de MAAS2", () => {
  const base = { instagramMediaId: null, needsVideo: true, videoUrl: null, maasStage: null };

  it("nombra el tablero como lo nombra el equipo", () => {
    expect(boardName(new Date("2026-11-12"), new Date("2026-11-18"))).toBe("Semana 12 - 18 nov");
    expect(boardName(new Date("2026-11-26"), new Date("2026-12-02"))).toBe("Semana 26 nov - 2 dic");
  });

  it("no copia nada que no haya pasado los dos filtros", () => {
    expect(readyForBoard({ gatesPassed: ["DANIELA"], maasAssetId: null })).toBe(false);
    expect(readyForBoard({ gatesPassed: ["DANIELA", "JORGE"], maasAssetId: null })).toBe(true);
    expect(readyForBoard({ gatesPassed: [], maasAssetId: "ya-copiada" })).toBe(true);
  });

  it("muestra al cliente solo lo que le toca revisar", () => {
    expect(boardStage({ ...base, gatesPassed: ["DANIELA"] })).toBe("draft");
    expect(boardStage({ ...base, gatesPassed: ["DANIELA", "JORGE"] })).toBe("client_review");
    expect(boardStage({ ...base, gatesPassed: ["DANIELA", "JORGE", "CLIENTE"] })).toBe("approved");
    expect(boardStage({ ...base, instagramMediaId: "1", gatesPassed: [] })).toBe("published");
  });

  it("le vuelve a pedir revisión al cliente cuando llega el video", () => {
    const conVideo = { ...base, videoUrl: "https://x/a.mp4", gatesPassed: ["DANIELA", "JORGE", "CLIENTE"] };
    expect(boardStage(conVideo)).toBe("client_review");
    expect(boardStage({ ...conVideo, gatesPassed: [...conVideo.gatesPassed, "MP4"] })).toBe("approved");
  });

  it("deja visible el rechazo del cliente hasta que la pieza vuelva", () => {
    expect(boardStage({ ...base, maasStage: "rejected", gatesPassed: [] })).toBe("rejected");
    expect(boardStage({ ...base, maasStage: "rejected", gatesPassed: ["DANIELA", "JORGE"] })).toBe("client_review");
  });

  const pieza = { maasStage: "client_review", gatesPassed: ["DANIELA", "JORGE"], stage: "CLIENTE", instagramMediaId: null, videoUrl: null };

  it("una aprobación en el tablero abre la puerta que sigue", () => {
    expect(decideFromBoard(pieza, "approved")).toBe("CLIENTE");
    const conVideo = { ...pieza, gatesPassed: [...pieza.gatesPassed, "CLIENTE"], videoUrl: "https://x/a.mp4" };
    expect(decideFromBoard(conVideo, "approved")).toBe("MP4");
    expect(decideFromBoard({ ...conVideo, gatesPassed: [...conVideo.gatesPassed, "MP4"] }, "approved")).toBeNull();
  });

  it("un rechazo devuelve la pieza, y lo que no cambió no hace nada", () => {
    expect(decideFromBoard(pieza, "rejected")).toBe("rechazar");
    expect(decideFromBoard({ ...pieza, stage: "GUION" }, "rejected")).toBeNull();
    expect(decideFromBoard(pieza, "client_review")).toBeNull();
    expect(decideFromBoard({ ...pieza, instagramMediaId: "1" }, "approved")).toBeNull();
  });

  it("separa video e imágenes de lo que suben al tablero", () => {
    expect(filesFromBoard({ id: "a", stage: null, file_url: "inline", file_type: "text/markdown", metadata: null })).toEqual({ videoUrl: null, images: [] });
    const out = filesFromBoard({
      id: "a",
      stage: null,
      file_url: "https://x/a.mp4",
      file_type: "video/mp4",
      metadata: { carousel_files: [{ url: "https://x/a.mp4", type: "video/mp4" }, { url: "https://x/b.jpg", type: "image/jpeg", name: "b" }] },
    });
    expect(out).toEqual({ videoUrl: "https://x/a.mp4", images: [{ url: "https://x/b.jpg", name: "b" }] });
  });
});

describe("linter de la semana generada", () => {
  it("revisa la voz de un Reel sin acotaciones, y el caption", () => {
    const out = textsToLint({ formato: "REEL", caption: "Texto", guion: [{ voice: "Hola (sonríe) mundo" }] });
    expect(out).toEqual([{ texto: "Hola  mundo", modo: "reel" }, { texto: "Texto", modo: "caption" }]);
  });
  it("un carrusel solo revisa el caption", () => {
    expect(textsToLint({ formato: "CARRUSEL", caption: "Texto", guion: [] })).toEqual([{ texto: "Texto", modo: "caption" }]);
  });
});

describe("cifras sin fuente", () => {
  const fuente = "Aumento de 35% en conversión, 20 % en ventas, 25.000 tokens y 180 días. Parqueo: $12.000.";
  it("deja pasar lo que está en las fuentes, con otro formato", () => {
    expect(unsourcedFigures("35 % más conversión, 20% más ventas, 25,000 tokens y $12.000 en 180 días.", fuente)).toEqual([]);
  });
  it("atrapa lo que no está", () => {
    expect(unsourcedFigures("Crecimos 47% y 300 clientes.", fuente)).toEqual(["47%", "300"]);
    expect(unsourcedFigures("Son 5% más.", fuente)).toEqual(["5%"]);
    expect(unsourcedFigures("Solo $9.900.", fuente)).toEqual(["9900"]);
  });
  it("no confunde un número con parte de otro", () => {
    expect(unsourcedFigures("Vale 80 días.", fuente)).toEqual(["80"]);
    expect(unsourcedFigures("Son 35 personas.", fuente)).toEqual([]);
  });
  it("ignora horas y números de un dígito", () => {
    expect(unsourcedFigures("A las 11:00 p. m., en 3 pasos, sábado 8 p. m.", fuente)).toEqual([]);
  });
});

describe("texto en pantalla del Reel", () => {
  it("no quema las indicaciones de dirección", () => {
    const { planos } = planFromScript([{ time: "0 a 2 s", voice: "Hola mundo", screen: "(Seis post-its en la pared) Hola" }, { time: "2 a 4 s", voice: "Sigue ahí", screen: "(Solo una tarjeta)" }]);
    expect(planos[0].texto).toEqual([{ t: "Hola", tipo: "b", en: "hola" }]);
    expect(planos[1].texto).toEqual([]);
  });
  it("un texto demasiado largo no se corta a la mitad", () => {
    const { planos } = planFromScript([{ time: "0 a 2 s", voice: "Hola", screen: "x".repeat(61) }]);
    expect(planos[0].texto).toEqual([]);
  });
  it("se edita, se quita y se estrena", () => {
    const con = { desde: "la", texto: [{ t: "1", tipo: "n" as const, en: "la" }, { t: "Viejo", tipo: "b" as const, en: "la" }] };
    expect(withScreenText(con, "Nuevo")[1].t).toBe("Nuevo");
    expect(withScreenText(con, "")).toEqual([con.texto[0]]);
    expect(withScreenText({ desde: "la", texto: [] }, "Nuevo")).toEqual([{ t: "Nuevo", tipo: "b", en: "la" }]);
    expect(withScreenText({ texto: [] }, "Nuevo", "hola")).toEqual([{ t: "Nuevo", tipo: "b", en: "hola" }]);
  });
});

describe("pieza de pauta", () => {
  const ad = {
    titular: "Godzilla ya está en Uniplaza",
    mensaje: "La función de esta semana,\r\ncon combo.  ",
    descripcion: "",
    enlace: "https://cinemauniplaza.com.co/",
    llamado: "LEARN_MORE",
    vigencia: { desde: "2026-11-12T00:00:00-05:00", hasta: "2026-11-18T23:59:00-05:00" },
  };

  it("da el mismo hash del contrato con BeAds", () => {
    const formatos = [{ ratio: "9:16", video_url: "https://files.believe-global.com/clientes/befeed/x/reel.mp4", miniatura_url: "https://files.believe-global.com/clientes/befeed/x/poster.jpg" }];
    expect(
      huella(
        { ...ad, formatos },
        "Titular: Godzilla ya está en Uniplaza\nTexto: La función de esta semana,\ncon combo.",
        ["https://files.believe-global.com/clientes/befeed/x/reel.mp4", "https://files.believe-global.com/clientes/befeed/x/poster.jpg"]
      )
    ).toBe("sha256:19a4f506449b5efc2541f652fa1002953a782310354dff103b5e5852e50411ed");
  });

  it("el texto visible contiene titular y mensaje", () => {
    const parsed = anuncioSchema.parse({ ...ad, mensaje: "Con combo." });
    const texto = adDescription(parsed);
    expect(texto).toContain("Godzilla ya está en Uniplaza");
    expect(texto).toContain("Con combo.");
    expect(texto).toContain("Vigencia: del 12 al 18 de noviembre");
  });

  it("no acepta datos sin resolver ni enlaces sin https", () => {
    expect(anuncioSchema.safeParse({ ...ad, titular: "Estreno {{dato}}" }).success).toBe(false);
    expect(anuncioSchema.safeParse({ ...ad, enlace: "http://x.co" }).success).toBe(false);
    expect(anuncioSchema.safeParse({ ...ad, vigencia: { desde: ad.vigencia.hasta, hasta: ad.vigencia.desde } }).success).toBe(false);
  });

  it("un carrusel deja que BeAds lea los archivos", () => {
    expect(formatosFor("CARRUSEL", null, null, ["a", "b"])).toEqual([]);
    expect(formatosFor("POST", null, null, ["a"])).toEqual([{ ratio: "4:5", imagen_url: "a" }]);
    expect(formatosFor("REEL", "v", "p", [])).toEqual([{ ratio: "9:16", video_url: "v", miniatura_url: "p" }]);
  });

  it("en pauta el único filtro interno es Daniela", () => {
    const pauta = { ...guion, destination: "AD", needsVideo: false, stage: "FILTROS" as const };
    expect(nextGate(pauta)).toBe("DANIELA");
    expect(nextGate({ ...pauta, gatesPassed: ["DANIELA"] })).toBe("CLIENTE");
    expect(readyForBoard({ gatesPassed: ["DANIELA"], maasAssetId: null, destination: "AD" })).toBe(true);
    expect(readyForBoard({ gatesPassed: ["DANIELA"], maasAssetId: null })).toBe(false);
    expect(boardStage({ gatesPassed: ["DANIELA"], instagramMediaId: null, needsVideo: false, videoUrl: null, maasStage: null, destination: "AD" })).toBe("client_review");
  });

  it("nota cuando alguien cambió el texto en el tablero", () => {
    const parsed = anuncioSchema.parse(ad);
    const pieza = { destination: "AD", ad: parsed, blockedBy: null };
    expect(adTextChanged(pieza, { description: adDescription(parsed) })).toBe(false);
    expect(adTextChanged(pieza, { description: adDescription(parsed) + " editado" })).toBe(true);
    expect(adTextChanged({ ...pieza, blockedBy: "Tablero" }, { description: "otro" })).toBe(false);
    expect(adTextChanged({ destination: "ORGANICO", ad: null }, { description: "otro" })).toBe(false);
    expect(sameText("a\r\nb ", "a\nb")).toBe(true);
  });
});

describe("validación con BeAds", () => {
  const ad = anuncioSchema.parse({
    titular: "T",
    mensaje: "M",
    enlace: "https://x.co/",
    llamado: "LEARN_MORE",
    vigencia: { desde: "2026-12-24T00:00:00-05:00", hasta: "2026-12-30T23:59:00-05:00" },
  });
  const responde = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("separa lo prohibido de lo que no es culpa del texto", async () => {
    vi.stubEnv("BEADS_BEFEED_KEY", "k");
    responde(200, { ok: true, avisos: [] });
    expect((await validarEnBeads("p", ad)).estado).toBe("ok");
    responde(200, { ok: false, claims: ["el mejor"] });
    expect(await validarEnBeads("p", ad)).toMatchObject({ estado: "bloqueada", motivo: "Prohibido por el mandato: el mejor." });
    responde(422, { detail: "sin mandato" });
    expect((await validarEnBeads("p", ad)).estado).toBe("configuracion");
    responde(401, {});
    expect((await validarEnBeads("p", ad)).estado).toBe("configuracion");
    responde(503, {});
    expect((await validarEnBeads("p", ad)).estado).toBe("pendiente");
  });

  it("sin respuesta queda pendiente, y sin llave falta configurar", async () => {
    vi.stubEnv("BEADS_BEFEED_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("caído"); }));
    expect((await validarEnBeads("p", ad)).estado).toBe("pendiente");
    vi.stubEnv("BEADS_BEFEED_KEY", "");
    expect((await validarEnBeads("p", ad)).estado).toBe("configuracion");
  });
});

describe("pedidos de BeAds", () => {
  const pieza = (extra: Partial<PieceGateState>): PieceGateState => ({ ...guion, destination: "AD", needsVideo: false, ...extra });
  it("el estado sale de sus piezas", () => {
    expect(requestState(null, [])).toBe("RECIBIDO");
    expect(requestState("RECHAZADO", [pieza({})])).toBe("RECHAZADO");
    expect(requestState(null, [pieza({})])).toBe("EN_PRODUCCION");
    expect(requestState(null, [pieza({ stage: "CLIENTE", gatesPassed: ["DANIELA"] })])).toBe("EN_CLIENTE");
    expect(requestState(null, [pieza({ stage: "LISTA", gatesPassed: ["DANIELA", "CLIENTE"] })])).toBe("LISTO");
    expect(requestState(null, [pieza({ stage: "LISTA", gatesPassed: ["DANIELA", "CLIENTE"] }), pieza({})])).toBe("EN_CLIENTE");
  });
  it("solo acepta la llave exacta, y sin llave configurada a nadie", () => {
    expect(authorizedKey("abc", "abc")).toBe(true);
    expect(authorizedKey("abd", "abc")).toBe(false);
    expect(authorizedKey(null, "abc")).toBe(false);
    expect(authorizedKey("abc", undefined)).toBe(false);
  });
  it("solo acepta Meta por ahora", () => {
    const base = { clave: "fatiga:1:2026-W46", canal: "meta", maas2_proyecto_id: "5d3c564e-7878-4773-91b1-12c4623101e4", motivo: "fatiga", brief: "Otra apertura", pedido_por: "ads-manager" };
    expect(pedidoSchema.safeParse(base).success).toBe(true);
    expect(pedidoSchema.safeParse({ ...base, canal: "tiktok" }).success).toBe(false);
  });
});

describe("ganadores en pauta", () => {
  const fila = (id: string, costo: number | null, resultados = 20, moneda = "COP") => ({ maasAssetId: id, moneda, resultados, gasto: 1, costoPorResultado: costo });
  it("gana quien cuesta menos del 70 % de la mediana", () => {
    expect(adWinners([fila("a", 500), fila("b", 1000), fila("c", 1100)]).map((r) => r.maasAssetId)).toEqual(["a"]);
  });
  it("sin datos suficientes no hay ganador", () => {
    expect(adWinners([fila("a", 100), fila("b", 1000)])).toEqual([]);
    expect(adWinners([fila("a", 100, 5), fila("b", 1000), fila("c", 1100)])).toEqual([]);
    expect(adWinners([fila("a", null), fila("b", 1000), fila("c", 1100)])).toEqual([]);
  });
  it("no compara entre objetivos, y no necesita pieza", () => {
    const f = (o: string, c: number) => ({ moneda: "COP", objetivo: o, resultados: 20, gasto: 1, costoPorResultado: c });
    const clics = [f("TRAFICO", 100), f("TRAFICO", 110), f("TRAFICO", 120)];
    const leads = [f("LEADS", 5000), f("LEADS", 9000), f("LEADS", 9500)];
    expect(adWinners([...clics, ...leads]).map((r) => r.costoPorResultado)).toEqual([5000]);
  });
  it("no compara acciones distintas dentro del mismo objetivo", () => {
    const f = (t: string, c: number) => ({ moneda: "MXN", objetivo: "OUTCOME_SALES", tipoResultado: t, resultados: 20, gasto: 1, costoPorResultado: c });
    const vistas = [f("vistas_de_pagina", 1), f("vistas_de_pagina", 1.1), f("vistas_de_pagina", 1.2)];
    const compras = [f("compras", 100), f("compras", 300), f("compras", 320)];
    expect(adWinners([...vistas, ...compras]).map((r) => r.costoPorResultado)).toEqual([100]);
  });
  it("no compara entre monedas", () => {
    expect(adWinners([fila("a", 5, 20, "USD"), fila("b", 1000), fila("c", 1100), fila("d", 1200)])).toEqual([]);
  });
});
