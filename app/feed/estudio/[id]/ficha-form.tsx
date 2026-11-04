import { saveFichaAction } from "../../studio-actions";

type Plan = { id: string; nota?: string; cuadro?: string; movimiento?: string };
export type DraftFicha = {
  logo_url?: string;
  acento?: string;
  fondo?: string;
  musica_prompt?: string;
  estilo_cuadro?: string;
  voz?: { texto?: string };
  cierre?: { url?: string };
  planos?: Plan[];
};

/** Lo que una persona revisa antes de gastar: los textos salen del guion y lo visual lo propone el modelo. */
export function FichaForm({ pieceId, ficha, canProduce, why }: { pieceId: string; ficha: DraftFicha; canProduce: boolean; why?: string }) {
  return (
    <form action={saveFichaAction} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <input type="hidden" name="pieceId" value={pieceId} />

      <section className="plano">
        <label className="s" htmlFor="voz">Voz</label>
        <textarea className="input" id="voz" name="voz" rows={4} defaultValue={ficha.voz?.texto ?? ""} />
        <p className="sub" style={{ fontSize: 13 }}>Si cambias palabras aquí, los cortes se calculan sobre lo que se diga.</p>
      </section>

      <section className="plano">
        <h2 className="s">Planos</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(ficha.planos ?? []).map((p) => (
            <div key={p.id} className="card">
              <span className="rot">{p.id}{p.nota ? ` · ${p.nota}` : ""}</span>
              <label className="rot" htmlFor={`cuadro:${p.id}`}>Imagen</label>
              <textarea className="input" id={`cuadro:${p.id}`} name={`cuadro:${p.id}`} rows={3} defaultValue={p.cuadro ?? ""} />
              <label className="rot" htmlFor={`movimiento:${p.id}`}>Movimiento</label>
              <textarea className="input" id={`movimiento:${p.id}`} name={`movimiento:${p.id}`} rows={2} defaultValue={p.movimiento ?? ""} />
            </div>
          ))}
        </div>
      </section>

      <section className="plano">
        <h2 className="s">Estilo y marca</h2>
        <label className="rot" htmlFor="estilo_cuadro">Estilo de las imágenes</label>
        <textarea className="input" id="estilo_cuadro" name="estilo_cuadro" rows={3} defaultValue={ficha.estilo_cuadro ?? ""} />
        <label className="rot" htmlFor="musica_prompt">Música</label>
        <textarea className="input" id="musica_prompt" name="musica_prompt" rows={2} defaultValue={ficha.musica_prompt ?? ""} />
        <label className="rot" htmlFor="logo_url">Logo blanco en PNG</label>
        <input className="input" id="logo_url" name="logo_url" type="url" defaultValue={ficha.logo_url ?? ""} placeholder="https://files.believe-global.com/….png" />
        <div className="fila" style={{ gap: 12 }}>
          <div style={{ flex: "1 1 120px", display: "flex", flexDirection: "column", gap: 6 }}><label className="rot" htmlFor="acento">Color de acento</label><input className="input" id="acento" name="acento" defaultValue={ficha.acento ?? ""} /></div>
          <div style={{ flex: "1 1 120px", display: "flex", flexDirection: "column", gap: 6 }}><label className="rot" htmlFor="fondo">Color de fondo</label><input className="input" id="fondo" name="fondo" defaultValue={ficha.fondo ?? ""} /></div>
          <div style={{ flex: "2 1 220px", display: "flex", flexDirection: "column", gap: 6 }}><label className="rot" htmlFor="cierre">Web en el cierre</label><input className="input" id="cierre" name="cierre" defaultValue={ficha.cierre?.url ?? ""} /></div>
        </div>
      </section>

      <div className="fila" style={{ gap: 8, alignItems: "center" }}>
        <button className="btn" type="submit">Guardar</button>
        <button className="btn pri" type="submit" name="producir" value="1" disabled={!canProduce}>Producir: voz, música y cuadros</button>
        <span className="sub" style={{ fontSize: 13, flex: "1 1 240px" }}>{why ?? "Gasta en fal y ElevenLabs. Se detiene para que revises los cuadros antes de pagar los clips."}</span>
      </div>
    </form>
  );
}
