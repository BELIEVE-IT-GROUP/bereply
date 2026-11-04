import { createHash, randomBytes } from "crypto";

/** Solo se guarda el hash: el token se muestra una vez, al crearlo. */
export function hashAgentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newAgentToken() {
  return `bf_${randomBytes(32).toString("base64url")}`;
}
