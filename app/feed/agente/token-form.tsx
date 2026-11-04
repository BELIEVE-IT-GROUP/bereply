"use client";

import { useActionState } from "react";
import { createTokenAction, type TokenState } from "../actions";

export function TokenForm({ url }: { url: string }) {
  const [state, action, pending] = useActionState<TokenState, FormData>(createTokenAction, {});
  return (
    <>
      <form action={action} className="fila" style={{ gap: 8 }}>
        <label className="rot" htmlFor="label" style={{ flexBasis: "100%" }}>Quién lo va a usar</label>
        <input className="input" id="label" name="label" placeholder="Claude Code de Daniela" required style={{ flex: "1 1 220px", width: "auto" }} />
        <button className="btn pri" type="submit" disabled={pending}>Crear acceso</button>
      </form>
      {state.error ? <p className="err" role="alert">{state.error}</p> : null}
      {state.token ? (
        <div className="aviso" role="status">
          <p style={{ margin: "0 0 8px" }}>Cópialo ahora: no se vuelve a mostrar.</p>
          <code className="c">{`claude mcp add --transport http befeed \\\n  ${url} \\\n  --header "Authorization: Bearer ${state.token}"`}</code>
        </div>
      ) : null}
    </>
  );
}
