import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { handleRpc } from "@/lib/feed/mcp";
import { hashAgentToken } from "@/lib/feed/tokens";

export const maxDuration = 120;

/** Transporte HTTP de MCP sin estado: cada POST es una petición con su respuesta en JSON. */
export async function POST(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = bearer
    ? await prisma.feedAgentToken.findFirst({ where: { tokenHash: hashAgentToken(bearer), revokedAt: null } })
    : null;
  if (!token) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Falta un token válido." } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } }, { status: 400 });
  }

  await prisma.feedAgentToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
  const ctx = { workspaceId: token.workspaceId, actor: { type: "agent" as const, name: token.label } };
  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map((m) => handleRpc(m, ctx)))).filter(Boolean);

  if (replies.length === 0) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0]);
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
