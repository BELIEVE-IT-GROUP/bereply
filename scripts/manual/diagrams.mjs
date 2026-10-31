/**
 * Diagramas de los manuales: bloques ```mermaid del Markdown → SVG con la marca, en claro y en oscuro.
 *
 * Por qué Mermaid y no SVG a mano: el diagrama vive como texto dentro de la misma sección, así el
 * autoupdate lo corrige junto con el texto cuando cambia el código, y el diff se puede leer.
 *
 * Cómo queda on-brand en los dos temas: se renderiza con colores "centinela" (uno por rol) en un Chromium
 * headless y después cada centinela se cambia por `var(--d-<rol>)`. La página define esas variables para
 * claro, oscuro y el botón de tema; el archivo .svg suelto (BeNotes, descarga) trae su propio <style> con
 * `prefers-color-scheme`. Si queda un color que no es centinela, el build falla: nada sale fuera de marca.
 */
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

/** Rol → [centinela, claro, oscuro]. Paleta del Believe Brand System v.2026 (Paper, Cream, Blue, Ink; cian solo como señal). */
export const ROLES = {
  node: ["#a10001", "#f3f1e8", "#0a1f5e"],
  border: ["#a10002", "#0c3bb9", "#8ab4ff"],
  text: ["#a10003", "#1a1a1a", "#fafaf7"],
  line: ["#a10004", "#6b6b65", "#9aa6d6"],
  cluster: ["#a10005", "#fafaf7", "#050c29"],
  clusterBorder: ["#a10006", "#c9c6ba", "#2a3a72"],
  accent: ["#a10007", "#0c3bb9", "#8ab4ff"],
  accentText: ["#a10008", "#fafaf7", "#050c29"],
  ext: ["#a10009", "#fafaf7", "#050c29"],
  extBorder: ["#a1000a", "#6b6b65", "#9aa6d6"],
  labelBg: ["#a1000b", "#fafaf7", "#050c29"],
  signal: ["#a1000c", "#00aaff", "#00aaff"],
  data: ["#a1000d", "#062778", "#c9d8ff"],
  dataText: ["#a1000e", "#fafaf7", "#050c29"],
};
const S = Object.fromEntries(Object.entries(ROLES).map(([role, [sentinel]]) => [role, sentinel]));

/** Clases que el Markdown puede usar en un flowchart: `A:::agente`, `B:::ext`, `C:::datos`, `D:::senal`. */
const CLASSES = [
  `classDef agente fill:${S.accent},stroke:${S.accent},color:${S.accentText},font-weight:600`,
  `classDef ext fill:${S.ext},stroke:${S.extBorder},color:${S.text},stroke-dasharray:4 3`,
  `classDef datos fill:${S.data},stroke:${S.data},color:${S.dataText}`,
  `classDef senal fill:${S.node},stroke:${S.signal},color:${S.text},stroke-width:2px`,
].join("\n");

const FONT = 'Inter, -apple-system, "Segoe UI", system-ui, sans-serif';

const CONFIG = {
  startOnLoad: false,
  theme: "base",
  securityLevel: "strict",
  htmlLabels: false,
  fontFamily: FONT,
  flowchart: { htmlLabels: false, curve: "basis", padding: 12, nodeSpacing: 34, rankSpacing: 44 },
  sequence: {
    mirrorActors: false,
    actorMargin: 36,
    messageMargin: 34,
    width: 132,
    actorFontSize: 16,
    messageFontSize: 16,
    noteFontSize: 15,
    wrap: true,
    useMaxWidth: true,
  },
  er: { useMaxWidth: true },
  themeVariables: {
    fontFamily: FONT,
    fontSize: "16px",
    background: S.labelBg,
    primaryColor: S.node,
    primaryBorderColor: S.border,
    primaryTextColor: S.text,
    secondaryColor: S.node,
    secondaryBorderColor: S.border,
    secondaryTextColor: S.text,
    tertiaryColor: S.cluster,
    tertiaryBorderColor: S.clusterBorder,
    tertiaryTextColor: S.text,
    mainBkg: S.node,
    nodeBorder: S.border,
    nodeTextColor: S.text,
    textColor: S.text,
    titleColor: S.text,
    lineColor: S.line,
    defaultLinkColor: S.line,
    arrowheadColor: S.line,
    clusterBkg: S.cluster,
    clusterBorder: S.clusterBorder,
    edgeLabelBackground: S.labelBg,
    labelBackground: S.labelBg,
    // secuencia
    actorBkg: S.node,
    actorBorder: S.border,
    actorTextColor: S.text,
    actorLineColor: S.clusterBorder,
    signalColor: S.line,
    signalTextColor: S.text,
    labelBoxBkgColor: S.node,
    labelBoxBorderColor: S.border,
    labelTextColor: S.text,
    loopTextColor: S.text,
    noteBkgColor: S.cluster,
    noteBorderColor: S.clusterBorder,
    noteTextColor: S.text,
    activationBkgColor: S.node,
    activationBorderColor: S.border,
    sequenceNumberColor: S.accentText,
    // modelo de datos
    attributeBackgroundColorOdd: S.cluster,
    attributeBackgroundColorEven: S.node,
    rowOdd: S.cluster,
    rowEven: S.node,
    // estados
    altBackground: S.cluster,
    compositeBackground: S.cluster,
    compositeTitleBackground: S.node,
    stateBkg: S.node,
    stateLabelColor: S.text,
    transitionColor: S.line,
    transitionLabelColor: S.text,
    specialStateColor: S.accent,
    innerEndBackground: S.accent,
  },
};

/** El Chromium que ya dejó Playwright en este Mac (no se descarga nada). Se puede forzar con BEREPLY_MANUAL_CHROMIUM. */
function chromiumPath() {
  if (process.env.BEREPLY_MANUAL_CHROMIUM) return process.env.BEREPLY_MANUAL_CHROMIUM;
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const shells = existsSync(cache)
    ? readdirSync(cache)
        .filter((name) => /^chromium_headless_shell-\d+$/.test(name))
        .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
    : [];
  for (const shell of shells) {
    const bin = join(cache, shell, "chrome-headless-shell-mac-arm64/chrome-headless-shell");
    if (existsSync(bin)) return bin;
  }
  throw new Error(
    "No encuentro Chromium para los diagramas. Instala uno con: npx playwright-core install chromium-headless-shell",
  );
}

/** Agrega las clases de marca a los flowcharts (las demás clases de Mermaid no aplican). */
const withClasses = (source) =>
  /^\s*(flowchart|graph)\b/.test(source) ? `${source.trimEnd()}\n${CLASSES}\n` : source;

const COLOR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;
/** Colores que Mermaid deja fijos y no se ven (fondos de marcadores, sombras desactivadas): se dejan pasar. */
const NEUTRAL = new Set([
  "#000",
  "#000000",
  "#fff",
  "#ffffff",
  "rgba(0, 0, 0, 0)",
  "rgba(0,0,0,0)",
]);

/**
 * Cambia los centinelas por variables y devuelve los colores que no reconoció (deberían ser cero).
 * `#a10001` sale como `var(--d-node)`; Mermaid a veces escribe el mismo centinela en mayúsculas.
 */
export function themeSvg(svg) {
  const byHex = new Map(Object.entries(S).map(([role, hex]) => [hex, role]));
  const unknown = new Set();
  // Sin sombras (regla de marca): Mermaid trae una en los bordes animados y en un menú que no se usan.
  const flat = svg
    .replace(/filter:\s*drop-shadow\((?:[^()]|\([^()]*\))*\)/g, "filter:none")
    .replace(/box-shadow:[^;}]*/g, "box-shadow:none")
    // Diagrama de estados: el fondo de los compuestos alternos viene fijo en gris.
    .replace(/(\.alt-composit\{fill:)#e0e0e0/g, `$1${S.cluster}`)
    // Atributos que Mermaid deja con sus colores de fábrica (su CSS los pisa, pero no se arriesga): relleno a
    // nodo, trazo a línea.
    .replace(/\b(fill|stroke)="(#[0-9a-f]{3,8}|hsla?\([^)]*\))"/gi, (match, attr, hex) =>
      byHex.has(hex.toLowerCase()) || NEUTRAL.has(hex.toLowerCase())
        ? match
        : `${attr}="${attr === "fill" ? S.node : S.line}"`,
    );
  const out = flat.replace(COLOR, (color) => {
    const role = byHex.get(color.toLowerCase());
    if (role) return `var(--d-${role})`;
    // El navegador reescribe algunos centinelas como rgb(161, 0, n) y les pone transparencia.
    const rgb = color.match(/^rgba?\(\s*161,\s*0,\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/i);
    const rgbRole = rgb && byHex.get(`#a100${Number(rgb[1]).toString(16).padStart(2, "0")}`);
    if (rgbRole) {
      const alpha = rgb[2] === undefined ? 1 : Number(rgb[2]);
      return alpha >= 1
        ? `var(--d-${rgbRole})`
        : `color-mix(in srgb,var(--d-${rgbRole}) ${Math.round(alpha * 100)}%,transparent)`;
    }
    if (!NEUTRAL.has(color.toLowerCase().replace(/\s+/g, " "))) {
      const at = flat.indexOf(color);
      unknown.add(`${color} (en «${flat.slice(Math.max(0, at - 70), at).replace(/\s+/g, " ")}»)`);
    }
    return color;
  });
  return { svg: out, unknown: [...unknown] };
}

/** Variables de color para un selector, en claro u oscuro. */
export const cssVars = (mode) =>
  Object.entries(ROLES)
    .map(([role, [, light, dark]]) => `--d-${role}:${mode === "dark" ? dark : light}`)
    .join(";");

/** El SVG suelto se defiende solo: trae sus variables y su modo oscuro por el sistema. */
function standalone(svg) {
  const style = `<style>svg{${cssVars("light")}}@media (prefers-color-scheme:dark){svg{${cssVars("dark")}}}</style>`;
  return svg.replace(/^<svg([^>]*)>/, `<svg$1>${style}`);
}

/**
 * Renderiza en un solo navegador. Devuelve, por fuente: `inline` (para la página, usa las variables de la página)
 * y `file` (el .svg suelto con su propio tema). Lanza si un diagrama no compila o trae colores fuera de marca.
 */
export async function renderMermaid(sources) {
  if (!sources.length) return [];
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=block"></head><body></body></html>`,
    );
    await page.addScriptTag({ path: join(HERE, "node_modules/mermaid/dist/mermaid.min.js") });
    await page.evaluate(async () => {
      await document.fonts.load('15px "Inter"').catch(() => 0);
      await document.fonts.ready;
    });
    await page.evaluate((config) => window.mermaid.initialize(config), CONFIG);
    const results = [];
    for (const [index, source] of sources.entries()) {
      const id = `bc-diagrama-${index + 1}`;
      const rendered = await page.evaluate(
        async ([id, code]) => {
          try {
            return { svg: (await window.mermaid.render(id, code)).svg };
          } catch (error) {
            return { error: String(error?.message ?? error) };
          }
        },
        [id, withClasses(source)],
      );
      if (rendered.error)
        throw new Error(`El diagrama ${index + 1} no compila: ${rendered.error.split("\n")[0]}`);
      const { svg, unknown } = themeSvg(rendered.svg);
      if (unknown.length)
        throw new Error(
          `El diagrama ${index + 1} trae colores fuera de la marca: ${unknown.join(", ")}`,
        );
      // Ancho natural (en px de la fuente base): la página lo usa para no encogerlo por debajo de lo legible.
      const width = Number(svg.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+)/)?.[1] ?? 0);
      results.push({ id, inline: svg, file: standalone(svg), width });
    }
    return results;
  } finally {
    await browser.close();
  }
}
