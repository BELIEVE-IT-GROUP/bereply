#!/usr/bin/env node
import { execFileSync } from "node:child_process";
/**
 * Construye los manuales de BeReply desde su única fuente: docs/manual/secciones/NN-*.md.
 * Mismo sistema que el Manual de George (george/scripts/manual/build.mjs), con tres manuales sobre una fuente:
 *
 *   usuario       para quien opera las cuentas de Instagram de una marca
 *   operacion     el de usuario MÁS cómo Believe lo administra (incluye las secciones del de usuario, no las copia)
 *   arquitectura  cómo está hecho, con diagramas
 *
 * Salida por manual (docs/manual/dist/<manual>/, git-ignored):
 *   index.html        página con la marca de BeReply (claro y oscuro)
 *   manual.md         todas sus secciones en un solo Markdown (los ```mermaid se ven en GitHub)
 *   manual.json       versión, commit revisado, hash del contenido y secciones
 *   benotes.json      {title, content}: el manual como doc Tiptap, con las imágenes apuntando a R2
 *   assets/*          imágenes y diagramas (.svg con su propio tema claro/oscuro)
 *   publish-plan.tsv  archivo<TAB>key de R2, en el orden en que se sube
 *
 * Uso: node scripts/manual/build.mjs [usuario|operacion|arquitectura ...]   (sin argumentos: los tres)
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cssVars, renderMermaid } from "./diagrams.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(ROOT, "docs/manual");
const SECTIONS = join(SRC, "secciones");
const DIST = join(SRC, "dist");

export const readConfig = (root = ROOT) =>
  JSON.parse(readFileSync(join(root, "docs/manual/manual.config.json"), "utf8"));

/** Secciones de un manual, en orden. `incluye` trae primero todas las de otro manual: subconjunto, nunca copia. */
export function sectionsOf(config, name, seen = new Set()) {
  const manual = config.manuales[name];
  if (!manual) throw new Error(`No existe el manual "${name}" en manual.config.json.`);
  if (seen.has(name)) throw new Error(`"incluye" forma un ciclo en ${name}.`);
  seen.add(name);
  return [...(manual.incluye ? sectionsOf(config, manual.incluye, seen) : []), ...manual.secciones];
}

// ---------------------------------------------------------------------------------------------
// Markdown → bloques. Subconjunto: # títulos, párrafos, listas planas, tablas, ``` bloques
// (```mermaid es diagrama, ```pedido son pedidos de ejemplo), > citas, imágenes y en línea
// **negrita**, *cursiva*, `código`, [enlace](url).
// ---------------------------------------------------------------------------------------------

const INLINE = /(`[^`]+`)|(\*\*.+?\*\*)|(\*[^*\s][^*]*?\*)|(!?\[[^\]]*\]\([^)\s]+\))/g;

export function parseInline(source, marks = []) {
  const out = [];
  let last = 0;
  for (const match of source.matchAll(INLINE)) {
    if (match.index > last) out.push({ text: source.slice(last, match.index), marks });
    const token = match[0];
    if (match[1]) out.push({ text: token.slice(1, -1), marks: [...marks, { type: "code" }] });
    else if (match[2]) out.push(...parseInline(token.slice(2, -2), [...marks, { type: "bold" }]));
    else if (match[3]) out.push(...parseInline(token.slice(1, -1), [...marks, { type: "italic" }]));
    else {
      const [, bang, label, href] = token.match(/^(!?)\[([^\]]*)\]\(([^)\s]+)\)$/);
      if (bang) out.push({ image: { alt: label, src: href } });
      else out.push(...parseInline(label, [...marks, { type: "link", attrs: { href } }]));
    }
    last = match.index + token.length;
  }
  if (last < source.length) out.push({ text: source.slice(last), marks });
  return out;
}

const cells = (row) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
const LIST_ITEM = /^\s*([-*]|\d+\.)\s+(.*)$/;
const startsBlock = (line) => /^(#{1,4}\s|```|>|\|)/.test(line) || LIST_ITEM.test(line);

export function parseBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const body = [];
      for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      // Un diagrama puede llevar su leyenda en la línea siguiente: _Figura: texto_.
      if (fence[1] === "mermaid") {
        while (i < lines.length && !lines[i].trim()) i++;
        const caption = lines[i]?.match(/^_(.+)_\s*$/)?.[1];
        if (caption) i++;
        blocks.push({ type: "diagram", text: body.join("\n"), caption: caption ?? "" });
      } else blocks.push({ type: "code", lang: fence[1], text: body.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    if (line.startsWith("|") && /^\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      const rows = [];
      for (i += 2; i < lines.length && lines[i].startsWith("|"); i++) rows.push(cells(lines[i]));
      blocks.push({ type: "table", head, rows });
      continue;
    }

    if (line.startsWith(">")) {
      const body = [];
      for (; i < lines.length && lines[i].startsWith(">"); i++)
        body.push(lines[i].replace(/^>\s?/, ""));
      blocks.push({ type: "quote", blocks: parseBlocks(body.join("\n")) });
      continue;
    }

    const item = line.match(LIST_ITEM);
    if (item) {
      const ordered = /\d/.test(item[1]);
      const items = [];
      for (; i < lines.length; i++) {
        const next = lines[i].match(LIST_ITEM);
        if (next) items.push(next[2]);
        else if (lines[i].trim() && /^\s+/.test(lines[i]))
          items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraph = [];
    for (; i < lines.length && lines[i].trim() && !(paragraph.length && startsBlock(lines[i])); i++)
      paragraph.push(lines[i].trim());
    const inline = parseInline(paragraph.join(" "));
    const images = inline.filter((node) => node.image);
    const onlyImages = images.length > 0 && inline.every((node) => node.image || !node.text.trim());
    blocks.push(
      onlyImages
        ? { type: "gallery", images: images.map((node) => node.image) }
        : { type: "paragraph", text: paragraph.join(" ") },
    );
  }
  return blocks;
}

// ---------------------------------------------------------------------------------------------
// Salida 1: HTML
// ---------------------------------------------------------------------------------------------

const esc = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export const slug = (text) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const plain = (text) =>
  parseInline(text)
    .map((node) => node.text ?? "")
    .join("");

/** Permisos y niveles de evidencia de LION, escritos como `código`, se ven como sellos. */
const PILLS = {
  GREEN: "green",
  YELLOW: "yellow",
  RED: "red",
  VERIFIED: "green",
  LIKELY: "blue",
  HYPOTHESIS: "yellow",
  UNKNOWN: "quiet",
};

function inlineHtml(text, asset) {
  return parseInline(text)
    .map((node) => {
      if (node.image)
        return `<img src="${esc(asset(node.image.src))}" alt="${esc(node.image.alt)}" loading="lazy">`;
      let html = esc(node.text);
      for (const mark of [...node.marks].reverse()) {
        if (mark.type === "code")
          html = PILLS[node.text]
            ? `<span class="pill pill-${PILLS[node.text]}">${html}</span>`
            : `<code>${html}</code>`;
        else if (mark.type === "bold") html = `<strong>${html}</strong>`;
        else if (mark.type === "italic") html = `<em>${html}</em>`;
        else if (mark.type === "link") html = `<a href="${esc(mark.attrs.href)}">${html}</a>`;
      }
      return html;
    })
    .join("");
}

function blocksHtml(blocks, ctx) {
  const inline = (text) => inlineHtml(text, ctx.asset);
  return blocks
    .map((block) => {
      switch (block.type) {
        case "heading": {
          if (block.level === 1) return "";
          const id = `${ctx.id}-${slug(plain(block.text))}`;
          return `<h${block.level} id="${id}">${inline(block.text)}</h${block.level}>`;
        }
        case "paragraph":
          return `<p>${inline(block.text)}</p>`;
        case "list": {
          const tag = block.ordered ? "ol" : "ul";
          return `<${tag}>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`;
        }
        case "code":
          if (block.lang === "pedido") {
            const asks = block.text
              .split("\n")
              .filter((line) => line.trim())
              .map((line) => `<p class="ask">${esc(line)}</p>`)
              .join("");
            return `<div class="asks"><span class="eyebrow-s">Ejemplo</span>${asks}</div>`;
          }
          return `<pre><code>${esc(block.text)}</code></pre>`;
        case "diagram": {
          const svg = ctx.diagram(block.text);
          return `<figure class="diagram"><div class="diagram-art">${svg.inline}</div><figcaption>${block.caption ? `${inline(block.caption)} · ` : ""}<a href="assets/${svg.file}">Abrir el SVG</a></figcaption></figure>`;
        }
        case "quote":
          return `<aside class="callout">${blocksHtml(block.blocks, ctx)}</aside>`;
        case "table":
          return `<div class="table-wrap"><table><thead><tr>${block.head.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
        case "gallery":
          return `<div class="gallery${block.images.length === 1 ? " one" : ""}">${block.images.map((image) => `<figure><img src="${esc(ctx.asset(image.src))}" alt="${esc(image.alt)}" loading="lazy"><figcaption>${esc(image.alt)}</figcaption></figure>`).join("")}</div>`;
        default:
          return "";
      }
    })
    .join("\n");
}

// ---------------------------------------------------------------------------------------------
// Salida 2: doc Tiptap (lo que guarda BeNotes: heading, paragraph, bulletList, orderedList,
// listItem, codeBlock, blockquote, table*, image; marcas bold, italic, code, link).
// ---------------------------------------------------------------------------------------------

function inlineTiptap(text) {
  return parseInline(text)
    .filter((node) => node.text)
    .map((node) => {
      // La marca `code` de Tiptap excluye a las demás: si está, va sola.
      const marks = node.marks.some((mark) => mark.type === "code")
        ? [{ type: "code" }]
        : node.marks;
      return marks.length
        ? { type: "text", text: node.text, marks }
        : { type: "text", text: node.text };
    });
}
const tiptapParagraph = (text) => {
  const content = inlineTiptap(text);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};

/** `remote(src)` da la URL pública de una imagen (R2): BeNotes la muestra desde ahí. */
export function blocksTiptap(blocks, remote = () => null) {
  const image = (src, alt) => {
    const url = remote(src);
    return url ? [{ type: "image", attrs: { src: url, alt } }] : [];
  };
  return blocks.flatMap((block) => {
    switch (block.type) {
      case "heading":
        return [
          {
            type: "heading",
            attrs: { level: Math.min(block.level, 3) },
            content: inlineTiptap(block.text),
          },
        ];
      case "paragraph":
        return [tiptapParagraph(block.text)];
      case "list":
        return [
          {
            type: block.ordered ? "orderedList" : "bulletList",
            content: block.items.map((item) => ({
              type: "listItem",
              content: [tiptapParagraph(item)],
            })),
          },
        ];
      case "code":
        if (block.lang === "pedido")
          return [
            {
              type: "blockquote",
              content: block.text
                .split("\n")
                .filter((line) => line.trim())
                .map(tiptapParagraph),
            },
          ];
        return [{ type: "codeBlock", content: [{ type: "text", text: block.text }] }];
      case "diagram":
        return [
          ...image(`diagram:${block.text}`, block.caption || "Diagrama"),
          ...(block.caption ? [tiptapParagraph(`*${block.caption}*`)] : []),
        ];
      case "quote":
        return [
          {
            type: "blockquote",
            content: blocksTiptap(block.blocks).filter((node) => node.type === "paragraph"),
          },
        ];
      case "table":
        return [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: block.head.map((cell) => ({
                  type: "tableHeader",
                  content: [tiptapParagraph(cell)],
                })),
              },
              ...block.rows.map((row) => ({
                type: "tableRow",
                content: row.map((cell) => ({
                  type: "tableCell",
                  content: [tiptapParagraph(cell)],
                })),
              })),
            ],
          },
        ];
      case "gallery":
        return block.images.flatMap((img) => image(img.src, img.alt));
      default:
        return [];
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Chequeo propio del parser: si esto falla, no se construye nada.
// ---------------------------------------------------------------------------------------------

function selfCheck() {
  const assert = (ok, what) => {
    if (!ok) throw new Error(`Chequeo del parser falló: ${what}`);
  };
  const blocks = parseBlocks(
    "# T\n\nHola **negrita con `código`** y [link](https://x.y).\n\n| A | B |\n|---|---|\n| `GREEN` | 2 |\n\n```pedido\nuno\ndos\n```\n\n> **Nota:** ojo\n\n1. a\n2. b\n\n![x](a.png) ![y](b.png)\n\n```mermaid\nflowchart LR\n  A --> B\n```\n_Figura: A va a B_\n\nfin\n",
  );
  assert(
    blocks.map((block) => block.type).join() ===
      "heading,paragraph,table,code,quote,list,gallery,diagram,paragraph",
    "tipos de bloque",
  );
  assert(blocks[7].caption === "Figura: A va a B", "leyenda del diagrama");
  const ctx = {
    id: "s",
    asset: (src) => src,
    diagram: () => ({ inline: "<svg></svg>", file: "d.svg" }),
  };
  const html = blocksHtml(blocks, ctx);
  assert(
    html.includes("<strong>negrita con </strong><strong><code>código</code></strong>"),
    "negrita con código",
  );
  assert(html.includes('<span class="pill pill-green">GREEN</span>'), "sello de permiso");
  assert(
    html.includes('<p class="ask">dos</p>') && html.includes("<ol><li>a</li>"),
    "pedidos y lista",
  );
  assert(html.includes('<figure class="diagram">'), "diagrama");
  assert(!blocksHtml(parseBlocks("<script>"), ctx).includes("<script>"), "escape de HTML");
  const doc = blocksTiptap(
    blocks,
    (src) => `https://r2/${src.startsWith("diagram:") ? "d.svg" : src}`,
  );
  assert(
    doc[2].type === "table" && doc[2].content[1].content[0].type === "tableCell",
    "tabla Tiptap",
  );
  assert(doc.filter((node) => node.type === "image").length === 3, "imágenes Tiptap");
  assert(
    JSON.stringify(doc).includes('"marks":[{"type":"code"}]') &&
      !JSON.stringify(doc).includes('"text":""'),
    "marcas Tiptap",
  );
  assert(slug("Qué es BeReply") === "que-es-bereply", "slug");
  const config = {
    manuales: { a: { secciones: ["1"] }, b: { incluye: "a", secciones: ["2"] } },
  };
  assert(sectionsOf(config, "b").join() === "1,2", "incluye");
}

// ---------------------------------------------------------------------------------------------
// Plantilla. Believe Brand System v.2026: Paper/Blue, Fraunces + Inter + JetBrains Mono, cian solo como
// señal (punto del titular y del eyebrow), sin gradientes ni sombras, radio 2 px, hairlines.
// ---------------------------------------------------------------------------------------------

const DARK = `--bg:#050c29;--surface:#041d5c;--text:#fafaf7;--muted:#a9b3d6;--primary:#8ab4ff;--strong:#fafaf7;--line:rgba(250,250,247,.14);--code-bg:#020717;--soft:rgba(138,180,255,.08);--ok:#7fd99a;--warn:#ffc95e;--bad:#ff9c95;${cssVars("dark")};color-scheme:dark`;

const CSS = `
:root{--bg:#fafaf7;--surface:#f3f1e8;--text:#1a1a1a;--muted:#6b6b65;--primary:#0c3bb9;--deep:#062778;--strong:#062778;--signal:#00aaff;--line:rgba(26,26,26,.12);--code-bg:#081128;--soft:rgba(12,59,185,.05);--ok:#1f7a3d;--warn:#8a5a00;--bad:#b92e28;--serif:"Fraunces",Georgia,serif;--sans:"Inter",-apple-system,system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,Menlo,monospace;${cssVars("light")};color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK}}}
:root[data-theme="dark"]{${DARK}}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:24px;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:400 17px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--primary);text-underline-offset:3px}
img{max-width:100%;height:auto}
.wrap{max-width:1280px;margin:0 auto;padding:0 16px}
.eyebrow,.eyebrow-s{font:500 11px/1.2 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
.eyebrow::before{content:"";display:inline-block;width:6px;height:6px;background:var(--signal);margin-right:10px;vertical-align:1px}

.top{border-bottom:1px solid var(--line)}
.top .wrap{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:18px;padding-bottom:18px}
.lockup{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--muted)}
.lockup img{height:26px;width:auto;display:block}
.lockup .sym{height:30px}
.lockup span{font:500 11px/1 var(--mono);letter-spacing:.22em;text-transform:uppercase;padding-left:12px;border-left:1px solid var(--line)}
.logo-dark,.only-dark{display:none!important}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .logo-light{display:none!important}:root:not([data-theme="light"]) .logo-dark{display:block!important}}
:root[data-theme="dark"] .logo-light{display:none!important}:root[data-theme="dark"] .logo-dark{display:block!important}
.tools{display:flex;gap:8px;align-items:center}
.theme{appearance:none;border:1px solid var(--line);background:transparent;color:var(--text);border-radius:2px;padding:8px 12px;font:500 11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;cursor:pointer}

.hero .wrap{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:48px;align-items:center;padding-top:56px;padding-bottom:56px}
h1.title{font:500 clamp(40px,6.4vw,68px)/1.03 var(--serif);font-optical-sizing:auto;letter-spacing:-.025em;margin:18px 0 18px;text-wrap:balance}
h1.title em{font-style:italic;color:var(--primary)}
h1.title .dot{color:var(--signal)}
.sub{font-size:19px;line-height:1.55;color:var(--muted);max-width:44ch;margin:0 0 26px}
.meta{display:flex;flex-wrap:wrap;gap:0;margin:0 0 28px;border:1px solid var(--line);width:fit-content}
.meta div{padding:10px 16px;border-right:1px solid var(--line)}
.meta div:last-child{border-right:0}
.meta b{display:block;font:500 20px/1.2 var(--serif);color:var(--strong)}
.meta small{font:500 10px/1 var(--mono);letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.cta{display:flex;flex-wrap:wrap;gap:10px}
.btn{display:inline-block;border-radius:2px;padding:13px 20px;font:600 15px/1 var(--sans);text-decoration:none;border:1px solid var(--primary)}
.btn-fill{color:#fafaf7;background:var(--primary)}
:root[data-theme="dark"] .btn-fill{color:#050c29}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .btn-fill{color:#050c29}}
.btn-ghost{color:var(--primary);background:transparent}
.hero-art{border:1px solid var(--line);background:var(--surface);padding:10px}
.hero-art img,.hero-art svg{display:block;width:100%;height:auto}
.family{border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.family .wrap{display:grid;grid-template-columns:repeat(3,1fr)}
.family a{display:block;padding:16px 18px;border-right:1px solid var(--line);text-decoration:none;color:var(--text)}
.family a:first-child{border-left:1px solid var(--line)}
.family a small{display:block;font:500 10px/1.4 var(--mono);letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.family a b{font:500 18px/1.3 var(--serif)}
.family a.on{background:var(--soft)}
.family a.on b{color:var(--primary)}

.layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:56px;align-items:start;padding-top:48px;padding-bottom:88px}
.side{position:sticky;top:20px;max-height:calc(100vh - 40px);overflow:auto;padding-right:6px}
.side .eyebrow-s{display:block;margin:0 0 12px}
.side ol{list-style:none;margin:0;padding:0;border-left:1px solid var(--line)}
.side li a{display:flex;gap:10px;padding:7px 12px;margin-left:-1px;border-left:2px solid transparent;color:var(--text);text-decoration:none;font:500 14px/1.35 var(--sans)}
.side li a span{color:var(--muted);font:500 11px/1.9 var(--mono)}
.side li a:hover{color:var(--primary)}
.side li a.on{border-left-color:var(--primary);color:var(--primary)}
details.toc{display:none;border:1px solid var(--line);padding:2px 16px;margin-top:24px}
details.toc summary{cursor:pointer;font:500 11px/1 var(--mono);letter-spacing:.18em;text-transform:uppercase;padding:14px 0}
details.toc ol{margin:0 0 12px;padding-left:22px}
details.toc li{padding:4px 0}

main{min-width:0;max-width:940px}
main ul,main ol,main .callout,main .asks{max-width:780px}
section.part{padding:0 0 56px;border-bottom:1px solid var(--line);margin-bottom:52px}
section.part:last-of-type{border-bottom:0}
.part-head{margin-bottom:10px}
.part-head .num{font:500 11px/1 var(--mono);letter-spacing:.2em;color:var(--muted)}
.part-head h1{font:500 clamp(30px,4.2vw,42px)/1.08 var(--serif);letter-spacing:-.02em;margin:10px 0 0;text-wrap:balance;color:var(--text)}
h2{font:500 26px/1.2 var(--serif);letter-spacing:-.015em;margin:44px 0 12px}
h3{font:600 18px/1.35 var(--sans);margin:30px 0 8px}
h4{font:600 16px/1.4 var(--sans);margin:24px 0 6px}
p{margin:0 0 16px;max-width:68ch}
ul,ol{margin:0 0 18px;padding-left:22px}
li{margin:6px 0}
li::marker{color:var(--primary)}
strong{font-weight:600}
code{font:400 .86em/1.4 var(--mono);background:var(--soft);color:var(--strong);padding:1px 5px;border-radius:2px;overflow-wrap:anywhere}
pre{background:var(--code-bg);color:#e8eefb;border-radius:2px;padding:18px;overflow:auto;margin:0 0 20px;font-size:12.5px;line-height:1.5}
pre code{background:none;color:inherit;padding:0;font-size:inherit;overflow-wrap:normal}
.pill{display:inline-block;font:500 10.5px/1 var(--mono);letter-spacing:.12em;padding:4px 7px;border-radius:2px;vertical-align:1px;white-space:nowrap;border:1px solid currentColor}
.pill-green{color:var(--ok)}.pill-yellow{color:var(--warn)}.pill-red{color:var(--bad)}.pill-blue{color:var(--primary)}.pill-quiet{color:var(--muted)}
.table-wrap{overflow-x:auto;margin:0 0 22px;border-top:1px solid var(--text);border-bottom:1px solid var(--line)}
table{border-collapse:collapse;width:100%;font-size:15px;line-height:1.5}
th,td{text-align:left;vertical-align:top;padding:11px 14px 11px 0;border-bottom:1px solid var(--line)}
th{font:500 10.5px/1.4 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
tr:last-child td{border-bottom:0}
.asks{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:6px 0 24px;padding:16px 18px;border:1px solid var(--line);background:var(--soft)}
.ask{margin:0;font:400 15px/1.5 var(--mono);color:var(--strong)}
.ask::before{content:"› ";color:var(--muted)}
.callout{border-left:2px solid var(--primary);background:var(--surface);padding:14px 18px;margin:0 0 22px}
.callout p:last-child{margin-bottom:0}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin:8px 0 26px}
.gallery.one{grid-template-columns:1fr}
.gallery figure,.diagram{margin:0}
.gallery img{display:block;width:100%;border:1px solid var(--line)}
.gallery figcaption,.diagram figcaption{font:400 13px/1.5 var(--sans);color:var(--muted);margin-top:8px}
.diagram{margin:8px 0 28px}
.diagram-art{border:1px solid var(--line);padding:16px;overflow-x:auto;background:var(--d-cluster)}
.diagram-art svg{display:block;max-width:100%;height:auto;margin:0 auto}

footer{background:#062778;color:#c9d2f0;padding:56px 0 48px}
footer .wrap{display:grid;grid-template-columns:1fr auto;gap:32px;align-items:end}
footer p{margin:0 0 8px;max-width:60ch;font-size:14px;line-height:1.6}
footer small{font:500 10.5px/1.6 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:#9aa6d6}
footer code{background:rgba(250,250,247,.08);color:#fafaf7}
footer .sign{display:flex;flex-direction:column;align-items:flex-end;gap:10px}
footer .sign img{height:44px;width:auto}

@media (max-width:960px){
  .hero .wrap{grid-template-columns:1fr;gap:28px;padding-top:32px;padding-bottom:32px}
  .family .wrap{grid-template-columns:1fr}
  .family a{border-left:1px solid var(--line);border-bottom:1px solid var(--line)}
  .layout{grid-template-columns:1fr;gap:0;padding-top:0}
  .side{display:none}
  details.toc{display:block}
  main{padding-top:36px}
  footer .wrap{grid-template-columns:1fr}
  footer .sign{align-items:flex-start}
}
@media print{.side,.theme,details.toc,.cta,.family{display:none}.layout{display:block}}
`;

const SCRIPT = `
(function(){
  var root=document.documentElement,button=document.querySelector('.theme'),order=['auto','light','dark'],label={auto:'Tema: sistema',light:'Tema: claro',dark:'Tema: oscuro'},mode='auto';
  try{mode=localStorage.getItem('bereply-manual-theme')||'auto'}catch(e){}
  function apply(){if(mode==='auto')root.removeAttribute('data-theme');else root.setAttribute('data-theme',mode);button.textContent=label[mode]}
  button.addEventListener('click',function(){mode=order[(order.indexOf(mode)+1)%3];try{localStorage.setItem('bereply-manual-theme',mode)}catch(e){}apply()});
  apply();
  if(!('IntersectionObserver' in window))return;
  var links={};document.querySelectorAll('.side a').forEach(function(a){links[a.getAttribute('href').slice(1)]=a});
  var spy=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(!entry.isIntersecting)return;Object.keys(links).forEach(function(id){links[id].classList.toggle('on',id===entry.target.id)})})},{rootMargin:'-20% 0px -70% 0px'});
  document.querySelectorAll('section.part').forEach(function(section){spy.observe(section)});
})();
`;

/** "Manual de *usuario*" → HTML con el énfasis en itálica azul y el punto cian del titular. */
const titleHtml = (title) => `${inlineHtml(title, (src) => src)}<span class="dot">.</span>`;

function page({ config, name, manual, meta, sections, hero }) {
  const nav = sections
    .map(
      (section) =>
        `<li><a href="#${section.id}"><span>${section.num}</span>${esc(section.title)}</a></li>`,
    )
    .join("");
  const body = sections
    .map(
      (section) =>
        `<section class="part" id="${section.id}"><div class="part-head"><span class="num">${section.num}</span><h1>${esc(section.title)}</h1></div>\n${section.html}\n</section>`,
    )
    .join("\n");
  const family = Object.entries(config.manuales)
    .map(
      ([other, m]) =>
        `<a href="../${other}/index.html"${other === name ? ' class="on" aria-current="page"' : ""}><small>${esc(m.eyebrow)}</small><b>${esc(plain(m.title))}</b></a>`,
    )
    .join("");
  const plainTitle = `${plain(manual.title)} · ${config.producto}`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(plainTitle)}</title>
<meta name="description" content="${esc(manual.subtitle)}">
<meta name="robots" content="noindex">
<meta name="bereply-manual" content="${esc(name)}">
<meta name="bereply-manual-version" content="${esc(meta.manual_version)}">
<meta property="og:title" content="${esc(plainTitle)}">
<meta property="og:description" content="${esc(manual.subtitle)}">
<link rel="icon" href="assets/bereply.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..600;1,9..144,400..600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="lockup" href="#top" id="top" aria-label="${esc(config.producto)}">
      <img class="sym logo-light" src="assets/bereply.svg" alt="" width="30" height="30">
      <img class="sym logo-dark" src="assets/bereply-inverse.svg" alt="" width="30" height="30">
      <img class="logo-light" src="assets/bereply-positive.svg" alt="BeReply" height="26">
      <img class="logo-dark" src="assets/bereply-negative.svg" alt="BeReply" height="26">
      <span>Manuales</span>
    </a>
    <div class="tools"><button class="theme" type="button" aria-label="Cambiar tema">Tema</button></div>
  </div>
</header>
<div class="hero">
  <div class="wrap">
    <div>
      <span class="eyebrow">${esc(manual.eyebrow)} · ${esc(config.producto)}</span>
      <h1 class="title">${titleHtml(manual.title)}</h1>
      <p class="sub">${esc(manual.subtitle)}</p>
      <div class="meta">
        <div><small>Versión</small><b>${esc(meta.manual_version)}</b></div>
        <div><small>Revisado contra</small><b>${esc(meta.revisado.slice(0, 7))}</b></div>
        <div><small>Fecha</small><b>${esc(meta.date)}</b></div>
      </div>
      <div class="cta">
        <a class="btn btn-fill" href="#${sections[0].id}">Empezar a leer</a>
        <a class="btn btn-ghost" href="manual.md" download>Descargar en Markdown</a>
      </div>
    </div>
    <div class="hero-art">${hero}</div>
  </div>
</div>
<nav class="family" aria-label="Los tres manuales"><div class="wrap">${family}</div></nav>
<div class="wrap">
  <details class="toc"><summary>Contenido</summary><ol>${sections.map((section) => `<li><a href="#${section.id}">${esc(section.title)}</a></li>`).join("")}</ol></details>
</div>
<div class="wrap layout">
  <nav class="side" aria-label="Contenido"><span class="eyebrow-s">Contenido</span><ol>${nav}</ol></nav>
  <main>
${body}
  </main>
</div>
<footer>
  <div class="wrap">
    <div>
      <p>${esc(plain(manual.title))} v${esc(meta.manual_version)}. Revisado contra el commit <code>${esc(meta.revisado.slice(0, 7))}</code> de bereply. Fuente única: <code>docs/manual/</code>; esta página, BeNotes y el Markdown se generan desde ahí y se actualizan solos cuando cambia el código.</p>
      <small>BeReply · Powered by LION · Sistema sobre proyecto. Dato sobre opinión.</small>
    </div>
    <div class="sign"><img src="assets/believe-negative.svg" alt="Believe" height="44"></div>
  </div>
</footer>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------------------------

const hashOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);

async function build(names) {
  selfCheck();
  const read = (path) => readFileSync(path, "utf8");
  const config = readConfig();
  const wanted = names.length ? names : Object.keys(config.manuales);

  // Todas las secciones de los manuales pedidos, y todos sus diagramas en un solo navegador.
  const files = [...new Set(wanted.flatMap((name) => sectionsOf(config, name)))];
  const parsed = new Map(
    files.map((file) => {
      const markdown = read(join(SECTIONS, file));
      const blocks = parseBlocks(markdown);
      const title = blocks.find((block) => block.type === "heading" && block.level === 1)?.text;
      if (!title) throw new Error(`${file} no empieza con un título "# …".`);
      if (!config.sources[file])
        throw new Error(`${file} no tiene fuentes en manual.config.json ("sources").`);
      return [file, { markdown, blocks, title }];
    }),
  );
  const walk = (blocks) =>
    blocks.flatMap((block) => (block.type === "quote" ? walk(block.blocks) : [block]));
  const diagramSources = [
    ...new Set(
      [...parsed.values()].flatMap(({ blocks }) =>
        walk(blocks)
          .filter((block) => block.type === "diagram")
          .map((block) => block.text),
      ),
    ),
  ];
  const rendered = await renderMermaid(diagramSources);
  // Legibilidad: la figura mide hasta ~900 px en escritorio. Con fuente de 16 px, un diagrama de más de
  // MAX_WIDTH px de ancho natural bajaría sus rótulos de 13 px. Nunca se encoge por debajo de 12 px (si no
  // cabe, la figura se desplaza de lado) y el build avisa para que se rediseñe más vertical o se parta en dos.
  const MAX_WIDTH = 1100;
  const diagrams = new Map(
    diagramSources.map((source, index) => {
      const { inline, file, width } = rendered[index];
      if (width > MAX_WIDTH)
        console.log(
          `AVISO: el diagrama «${source.split("\n")[0]}…» mide ${Math.round(width)} px de ancho natural (máximo ${MAX_WIDTH}): sus rótulos quedan chicos en escritorio. Hazlo más vertical o pártelo.`,
        );
      const floor = `min-width:${Math.ceil((width * 12) / 16)}px;`;
      return [
        source,
        {
          inline: inline.replace(/^<svg([^>]*?)style="/, `<svg$1style="${floor}`),
          svg: file,
          file: `diagrama-${hashOf(source)}.svg`,
        },
      ];
    }),
  );

  rmSync(DIST, { recursive: true, force: true });
  for (const name of wanted) buildManual({ config, name, parsed, diagrams, read });
}

function buildManual({ config, name, parsed, diagrams, read }) {
  const manual = config.manuales[name];
  const dir = join(SRC, name);
  const out = join(DIST, name);
  const version = read(join(dir, "MANUAL-VERSION")).trim();
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(`${name}/MANUAL-VERSION inválida: "${version}" (se espera N.N.N)`);
  // El historial tiene que nombrar esta versión: sin entrada, no hay edición.
  const entry = read(join(dir, "CHANGELOG.md")).match(
    new RegExp(`^## ${version.replace(/\./g, "\\.")} \\((\\d{4}-\\d{2}-\\d{2})\\)`, "m"),
  );
  if (!entry)
    throw new Error(
      `docs/manual/${name}/CHANGELOG.md no tiene la entrada "## ${version} (AAAA-MM-DD)".`,
    );

  mkdirSync(join(out, "assets"), { recursive: true });
  const urlBase = `${config.r2.public_base}/${config.r2.prefix}/${name}`;

  // Imágenes: el Markdown apunta a rutas reales del repo (se ven en GitHub); acá se copian a assets/.
  const assets = new Map();
  const addAsset = (file, source) => {
    const known = assets.get(file);
    if (known && known !== source)
      throw new Error(`Dos imágenes distintas con el mismo nombre: ${file}`);
    statSync(source);
    assets.set(file, source);
    return `assets/${file}`;
  };
  for (const [file, source] of Object.entries(config.assets)) addAsset(file, join(ROOT, source));
  const asset = (src) =>
    /^https?:/.test(src) ? src : addAsset(basename(src), resolve(SECTIONS, src));
  const svgs = new Map();
  const diagram = (source) => {
    const svg = diagrams.get(source);
    svgs.set(svg.file, svg.svg);
    return svg;
  };
  const remote = (src) => {
    if (src.startsWith("diagram:")) return `${urlBase}/assets/${diagram(src.slice(8)).file}`;
    if (/^https?:/.test(src)) return src;
    asset(src);
    return `${urlBase}/assets/${basename(src)}`;
  };

  const hash = createHash("sha256");
  const sections = sectionsOf(config, name).map((file, index) => {
    const { markdown, blocks, title } = parsed.get(file);
    hash.update(file).update("\0").update(markdown).update("\0");
    const id = slug(title);
    return {
      file,
      id,
      title,
      num: String(index + 1).padStart(2, "0"),
      markdown,
      blocks,
      html: blocksHtml(blocks, { id, asset, diagram }),
    };
  });
  for (const [file, source] of [...assets].sort())
    hash.update(file).update("\0").update(readFileSync(source)).update("\0");
  hash
    .update(version)
    .update("\0")
    .update(manual.revisado ?? "");

  let commit = "";
  try {
    commit = execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    /* fuera de git: sin commit */
  }
  const meta = {
    manual: name,
    title: plain(manual.title),
    manual_version: version,
    revisado: manual.revisado ?? "",
    date: entry[1],
    content_sha256: hash.digest("hex"),
    commit,
    url: `${urlBase}/index.html`,
    url_base: urlBase,
    sections: sections.map(({ file, id, title }) => ({ file, id, title })),
  };

  // La portada: una imagen del repo o un diagrama de alguna sección (por el texto de su leyenda).
  let hero = "";
  if (manual.portada?.imagen)
    hero = `<img src="${esc(asset(manual.portada.imagen))}" alt="${esc(manual.portada.alt ?? "")}">`;
  else if (manual.portada?.diagrama) {
    const block = sections
      .flatMap((section) => section.blocks)
      .find((b) => b.type === "diagram" && b.caption.startsWith(manual.portada.diagrama));
    if (!block)
      throw new Error(`No encuentro el diagrama de portada "${manual.portada.diagrama}".`);
    hero = diagram(block.text)
      .inline.replace(/min-width:\d+px;/, "") // en la portada es ilustración: se ajusta a su caja
      .replaceAll('id="bc-', 'id="hero-bc-')
      .replaceAll("#bc-", "#hero-bc-");
  }

  for (const [file, source] of assets) copyFileSync(source, join(out, "assets", file));
  for (const [file, svg] of svgs) writeFileSync(join(out, "assets", file), svg);
  writeFileSync(join(out, "index.html"), page({ config, name, manual, meta, sections, hero }));

  const header = `<!-- ${plain(manual.title)} v${version}. Generado desde docs/manual/ del repo bereply: no editar este archivo. -->\n\n`;
  const toAssets = (markdown) =>
    markdown.replace(
      /\]\((?!https?:)([^)\s]+\.(?:png|jpe?g|gif|webp|svg))\)/g,
      (_, src) => `](assets/${basename(src)})`,
    );
  writeFileSync(
    join(out, "manual.md"),
    `${header}${sections.map((section) => toAssets(section.markdown).trim()).join("\n\n---\n\n")}\n`,
  );
  writeFileSync(join(out, "manual.json"), `${JSON.stringify(meta, null, 2)}\n`);

  // BeNotes: portada + todo el manual como doc Tiptap; las imágenes y diagramas se leen desde R2.
  const cover = [
    tiptapParagraph(
      `**Versión ${version}** (${meta.date}). Revisado contra el commit \`${meta.revisado.slice(0, 7)}\` de bereply.`,
    ),
    tiptapParagraph(`Versión con diseño y diagramas en claro y oscuro: [${meta.url}](${meta.url})`),
    tiptapParagraph(
      "Esta nota se genera desde `docs/manual/` del repo bereply. Lo que cambies acá se pierde en la siguiente publicación: edita el repo.",
    ),
  ];
  const full = {
    title: config.manuales[name].benotes_title,
    content: {
      type: "doc",
      content: [
        ...cover,
        ...sections.flatMap((section) => [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: `${section.num}. ${section.title}` }],
          },
          ...blocksTiptap(
            section.blocks.filter((block) => !(block.type === "heading" && block.level === 1)),
            remote,
          ),
        ]),
      ],
    },
  };
  writeFileSync(join(out, "benotes.json"), JSON.stringify(full));

  // Orden de subida: primero lo que la página pide, al final la página y el marcador de versión.
  const plan = [
    ...[...assets.keys(), ...svgs.keys()].sort().map((file) => `assets/${file}`),
    "manual.md",
    "index.html",
    "manual.json",
  ];
  writeFileSync(
    join(out, "publish-plan.tsv"),
    `${plan.map((file) => `${file}\t${config.r2.prefix}/${name}/${file}`).join("\n")}\n`,
  );

  const words = sections.reduce((sum, section) => sum + section.markdown.split(/\s+/).length, 0);
  console.log(
    `${plain(manual.title)} v${version} (${meta.date}): ${sections.length} secciones, ~${words} palabras, ${assets.size} imágenes, ${svgs.size} diagramas, hash ${meta.content_sha256.slice(0, 12)}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build(process.argv.slice(2)).catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
