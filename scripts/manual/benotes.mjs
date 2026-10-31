#!/usr/bin/env node
/**
 * Publica cada manual de BeReply como una nota de BeNotes (Cuadernos, cuadernos.believe-global.com),
 * en el cuaderno BELIEVE, sin copiar a mano.
 *
 * Va por la API directa de Cuadernos, no por su MCP: el doc entero viaja en una sola llamada y no hace falta
 * que Jorge conecte nada (receta de believe-infra/scripts/siyuan-to-benotes/migrate.mjs, verificada 2026-10-05):
 *   1. POST bechat /v1/auth/desktop/refresh con BECHAT_GEORGE_REFRESH_TOKEN (Infisical; NO rota) → access token
 *   2. POST cuadernos /api/auth/broker {token} → cookie de sesión de Jorge
 *   3. /api/notebooks, /api/pages (crear), /api/pages/:id (leer y PATCH con control de versión)
 * Las imágenes y diagramas de la nota apuntan a R2 (files.believe-global.com): se publican antes que la nota.
 *
 *   push <manual>   crea o actualiza la nota con docs/manual/dist/<manual>/benotes.json y la relee para verificar.
 *                   Si ya está igual, no escribe. Corre bajo `~/.believe/bin/infra`.
 *   plan <manual>   dice qué haría `push`, sin red y sin secretos.
 *
 * La identidad de cada nota viaja con el repo: su id queda en manual.config.json (manuales.<m>.benotes_page_id).
 * Nunca imprime un token.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG = path.join(ROOT, "docs/manual/manual.config.json");
const BECHAT = process.env.BECHAT_URL ?? "https://bechat.believe-global.com";

const fail = (message) => {
  console.error(`    BeNotes: ${message}`);
  process.exit(1);
};

const [command, manual] = process.argv.slice(2);
const config = JSON.parse(readFileSync(CONFIG, "utf8"));
if (!["push", "plan"].includes(command) || !config.manuales[manual])
  fail(`uso: benotes.mjs push|plan <${Object.keys(config.manuales).join("|")}>`);
const BASE = (process.env.BENOTES_URL ?? config.benotes.url).replace(/\/+$/, "");
const payload = () =>
  JSON.parse(readFileSync(path.join(ROOT, `docs/manual/dist/${manual}/benotes.json`), "utf8"));

// BeNotes devuelve las claves en otro orden ({text,type} en vez de {type,text}): se compara en forma canónica.
const canon = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

async function session() {
  const refreshToken = process.env.BECHAT_GEORGE_REFRESH_TOKEN;
  if (!refreshToken) fail("falta BECHAT_GEORGE_REFRESH_TOKEN (corre bajo ~/.believe/bin/infra).");
  const refreshed = await fetch(`${BECHAT}/v1/auth/desktop/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const { accessToken } = await refreshed.json().catch(() => ({}));
  if (!refreshed.ok || !accessToken) fail(`BeChat no renovó la sesión (${refreshed.status}).`);
  const broker = await fetch(`${BASE}/api/auth/broker`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: accessToken }),
  });
  if (!broker.ok) fail(`el broker de Cuadernos respondió ${broker.status}.`);
  const cookie = broker.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return async (method, route, body) => {
    const response = await fetch(`${BASE}${route}`, {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: body && JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) fail(`${method} ${route} → ${response.status} ${data.error ?? ""}`);
    return data;
  };
}

async function push() {
  const { title, content } = payload();
  const api = await session();
  let pageId = config.manuales[manual].benotes_page_id;

  if (pageId) {
    const { page } = await api("GET", `/api/pages/${pageId}`);
    if (page.title === title && canon(page.content?.content) === canon(content.content)) {
      console.log(
        `    BeNotes: "${title}" ya está al día (nota ${pageId}, versión ${page.version}). Nada que escribir.`,
      );
      return;
    }
    await api("PATCH", `/api/pages/${pageId}`, { version: page.version, title, content });
  } else {
    const { notebooks } = await api("GET", "/api/notebooks");
    const notebook = notebooks.find(
      (item) => item.id === config.benotes.notebook || item.name === config.benotes.notebook,
    );
    if (!notebook)
      fail(
        `no existe el cuaderno "${config.benotes.notebook}". Hay: ${notebooks.map((n) => n.name).join(", ")}`,
      );
    // Si alguien ya la creó (o una corrida anterior no alcanzó a guardar el id), se reutiliza por título exacto.
    const { pages } = await api("GET", `/api/pages?notebookId=${notebook.id}`);
    const same = pages.filter((page) => page.title === title);
    if (same.length > 1)
      fail(
        `hay ${same.length} notas llamadas "${title}". Deja una y pon su id en manual.config.json.`,
      );
    if (same[0]) {
      pageId = same[0].id;
      const { page } = await api("GET", `/api/pages/${pageId}`);
      await api("PATCH", `/api/pages/${pageId}`, { version: page.version, title, content });
    } else {
      pageId = (await api("POST", "/api/pages", { notebookId: notebook.id, title, content })).page
        .id;
    }
    // La identidad viaja con el repo: el id queda en la config (commitearla).
    const fresh = JSON.parse(readFileSync(CONFIG, "utf8"));
    fresh.manuales[manual].benotes_page_id = pageId;
    writeFileSync(CONFIG, `${JSON.stringify(fresh, null, 2)}\n`);
    console.log(
      `    BeNotes: nota nueva ${pageId}. Quedó en docs/manual/manual.config.json: commitéalo.`,
    );
  }

  // Verificación por efecto: se relee la nota y se comparan título y contenido.
  const { page } = await api("GET", `/api/pages/${pageId}`);
  if (page.title !== title || canon(page.content?.content) !== canon(content.content))
    fail(`la nota ${pageId} no quedó igual a lo enviado (título o contenido distinto).`);
  console.log(
    `    BeNotes: "${title}" publicada y verificada (nota ${pageId}, versión ${page.version}, ${content.content.length} bloques).`,
  );
}

function plan() {
  const { title, content } = payload();
  const pageId = config.manuales[manual].benotes_page_id;
  const images = JSON.stringify(content).match(/"type":"image"/g)?.length ?? 0;
  console.log(`    servidor   ${BASE}/api/pages (API directa, sesión por el broker de BeChat)`);
  console.log(
    `    nota       "${title}", ${content.content.length} bloques, ${images} imágenes desde R2`,
  );
  console.log(
    `    destino    ${pageId ? `actualiza la nota ${pageId} (PATCH con su versión)` : `crea la nota en el cuaderno "${config.benotes.notebook}" (o reutiliza la de título igual) y guarda su id`}`,
  );
  console.log(
    "    verifica   relee la nota y compara título y contenido; si ya estaba igual, no escribe",
  );
  console.log("    requiere   BECHAT_GEORGE_REFRESH_TOKEN en Infisical (ya existe; no rota)");
}

await (command === "push" ? push() : plan());
