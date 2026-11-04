#!/usr/bin/env node
/**
 * Marcado inicial de la regla del tag `ad` (Fase 0 del diseño BeFeed y BeAds).
 * Corre una sola vez: agrega `ad` a las piezas de pauta ya aprobadas en MAAS2, para que
 * BeAds no se quede sin ellas al encender la regla. Vive aquí porque BeAds no escribe en MAAS2.
 *
 * Sin --aplicar solo muestra qué haría. Agrega el tag sin borrar los demás, y una pieza
 * que ya lo tiene no se toca. Con --deshacer quita `ad` de las mismas piezas.
 *
 *   ~/.believe/bin/infra node scripts/feed/marcar-ad.mjs [--aplicar | --deshacer]
 */
const PROYECTOS = {
  Uniplaza: "5d3c564e-7878-4773-91b1-12c4623101e4",
  "Villa Elcira": "5d94c4ad-d4e9-48e6-80f6-d5fae7fc7ad1",
};
// Revisadas una por una el 2026-11-04. WAW no entra: su única candidata es de febrero, ya sin vigencia.
const PIEZAS = {
  Uniplaza: ["5f0adce1", "35f493d6", "52c4f84d", "0bf8c81a", "a84b4079", "a2b96f96", "aa7e4400", "571edb92", "5e7a9002", "6b53aa63", "4f7f1417"],
  "Villa Elcira": ["ca1e1a20", "afb00eac", "bd6c3e8f", "1f85c53a", "f649fbcd", "6afc38cb"],
};

const url = process.env.MAAS2_SUPABASE_SELFHOST_URL?.replace(/\/$/, "");
const key = process.env.MAAS2_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Corre el script con ~/.believe/bin/infra.");
const aplicar = process.argv.includes("--aplicar");
const deshacer = process.argv.includes("--deshacer");

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
  });
  if (!res.ok) throw new Error(`MAAS2 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Primero todo se valida, y solo después se escribe: un ID que no cuadre no deja el marcado a medias.
const plan = [];
for (const [marca, proyecto] of Object.entries(PROYECTOS)) {
  const filas = await rest(`media_assets?select=id,title,stage,tags&project_id=eq.${proyecto}&limit=2000`);
  for (const corto of PIEZAS[marca]) {
    const halladas = filas.filter((f) => f.id.startsWith(corto));
    if (halladas.length !== 1) throw new Error(`${marca} ${corto}: ${halladas.length} piezas.`);
    const [pieza] = halladas;
    if (pieza.stage !== "approved") throw new Error(`${marca} ${corto} está en ${pieza.stage}, no aprobada.`);
    const tags = pieza.tags ?? [];
    const nuevos = deshacer ? tags.filter((t) => t !== "ad") : tags.includes("ad") ? tags : [...tags, "ad"];
    const cambia = nuevos.length !== tags.length;
    plan.push({ id: pieza.id, nuevos, cambia });
    console.log(`${cambia ? "cambia " : "igual  "} ${marca.padEnd(13)} ${corto} ${(pieza.title ?? "").trim().slice(0, 60)}  [${nuevos.join(", ")}]`);
  }
}

const cambios = plan.filter((p) => p.cambia);
if (aplicar || deshacer) {
  for (const p of cambios) await rest(`media_assets?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify({ tags: p.nuevos }) });
}
console.log(`${aplicar || deshacer ? "Escritas" : "Se escribirían"}: ${cambios.length} de ${plan.length}.`);
