"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { removeAssetAction } from "./actions";

type Asset = { url: string; name?: string };

/** El reproductor y las imágenes de una pieza: lo mismo en la pieza y en el estudio. */
export function PieceMedia({ pieceId, videoUrl, thumbnailUrl, assets, canEdit = false }: {
  pieceId: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  assets: Asset[];
  canEdit?: boolean;
}) {
  const [actual, setActual] = useState(0);
  if (!videoUrl && assets.length === 0) {
    return <div className="vacio-media"><span>Sin video ni imágenes todavía</span></div>;
  }
  const img = assets[Math.min(actual, assets.length - 1)];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {videoUrl ? (
        <video
          key={videoUrl}
          src={videoUrl}
          poster={thumbnailUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          aria-label="Video de la pieza"
          style={{ width: "100%", aspectRatio: "9/16", objectFit: "contain", background: "#000", borderRadius: 2, display: "block" }}
        />
      ) : null}
      {img ? (
        <>
          <a href={img.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${img.name ?? "imagen"} en grande`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.name ?? ""} style={{ width: "100%", maxHeight: 460, objectFit: "contain", background: "#000", borderRadius: 2, display: "block" }} />
          </a>
          {assets.length > 1 ? (
            <div style={{ display: "flex", gap: 6, overflowX: "auto" }} aria-label="Láminas">
              {assets.map((a, i) => (
                <button
                  key={a.url}
                  type="button"
                  onClick={() => setActual(i)}
                  aria-label={`Lámina ${i + 1}`}
                  aria-pressed={i === actual}
                  style={{ flex: "none", padding: 0, background: "none", cursor: "pointer", border: i === actual ? "2px solid #00aaff" : "2px solid transparent", borderRadius: 2 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" style={{ width: 44, height: 44, objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
          ) : null}
          {canEdit ? (
            <form action={removeAssetAction}>
              <input type="hidden" name="pieceId" value={pieceId} />
              <input type="hidden" name="url" value={img.url} />
              <button className="btn" type="submit" style={{ minHeight: 36, width: "100%", fontSize: 13 }}>Quitar esta imagen</button>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function UploadForm({ pieceId, hasVideo }: { pieceId: string; hasVideo: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<{ subiendo?: boolean; error?: string }>({});

  async function subir() {
    const files = input.current?.files;
    if (!files?.length) return;
    setEstado({ subiendo: true });
    const body = new FormData();
    body.set("pieceId", pieceId);
    for (const f of Array.from(files)) body.append("files", f);
    try {
      const res = await fetch("/api/feed/upload", { method: "POST", body });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setEstado({ error: json.error ?? `No se pudo subir (${res.status}).` });
        return;
      }
      setEstado({});
      if (input.current) input.current.value = "";
      router.refresh();
    } catch {
      setEstado({ error: "Se cortó la conexión. Vuelve a intentarlo." });
    }
  }

  return (
    <div className="card">
      <label className="s" htmlFor="archivos">Subir archivos</label>
      <input ref={input} id="archivos" className="input" type="file" multiple accept="video/mp4,image/jpeg,image/png,image/webp" onChange={subir} disabled={estado.subiendo} />
      <p className="sub" style={{ fontSize: 13 }}>
        {estado.subiendo ? "Subiendo. Un video puede tardar unos minutos." : `Imágenes para un carrusel, o un MP4.${hasVideo ? " Un MP4 nuevo reemplaza al actual y se vuelve a aprobar." : ""}`}
      </p>
      {estado.error ? <p className="err" role="alert">{estado.error}</p> : null}
    </div>
  );
}
