import { LLAMADOS, type Anuncio } from "@/lib/feed/anuncio";

/** Los campos de un anuncio, iguales al crear, al editar y al pasar un orgánico a pauta. */
export function AnuncioFields({ ad, desde, hasta }: { ad?: Partial<Anuncio>; desde: string; hasta: string }) {
  return (
    <>
      <label className="rot" htmlFor="titular">Titular</label>
      <input className="input" id="titular" name="titular" required defaultValue={ad?.titular ?? ""} />
      <label className="rot" htmlFor="mensaje">Texto</label>
      <textarea className="input" id="mensaje" name="mensaje" rows={4} required defaultValue={ad?.mensaje ?? ""} />
      <label className="rot" htmlFor="descripcion">Descripción, opcional</label>
      <input className="input" id="descripcion" name="descripcion" defaultValue={ad?.descripcion ?? ""} />
      <label className="rot" htmlFor="enlace">Enlace, sin UTM: BeAds los agrega</label>
      <input className="input" id="enlace" name="enlace" type="url" required placeholder="https://" defaultValue={ad?.enlace ?? ""} />
      <label className="rot" htmlFor="llamado">Llamado a la acción</label>
      <select className="input" id="llamado" name="llamado" defaultValue={ad?.llamado ?? "LEARN_MORE"}>
        {Object.entries(LLAMADOS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <label className="rot" htmlFor="vigencia_desde">Corre desde</label>
      <input className="input" id="vigencia_desde" name="vigencia_desde" type="date" required defaultValue={ad?.vigencia?.desde.slice(0, 10) ?? desde} />
      <label className="rot" htmlFor="vigencia_hasta">Hasta</label>
      <input className="input" id="vigencia_hasta" name="vigencia_hasta" type="date" required defaultValue={ad?.vigencia?.hasta.slice(0, 10) ?? hasta} />
    </>
  );
}
