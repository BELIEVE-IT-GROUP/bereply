import { NextRequest, NextResponse } from "next/server";
import { authorizedKey, pedidoSchema, receiveRequest } from "@/lib/feed/pedidos";

/** BeAds pide piezas. No gasta nada: aparece en Hoy y una persona decide. */
export async function POST(request: NextRequest) {
  if (!process.env.BEFEED_PEDIDOS_KEY) return NextResponse.json({ error: "Sin configurar." }, { status: 503 });
  if (!authorizedKey(request.headers.get("x-befeed-pedidos-key"), process.env.BEFEED_PEDIDOS_KEY)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const parsed = pedidoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  const out = await receiveRequest(parsed.data);
  if (!out) return NextResponse.json({ error: "No hay marca con ese proyecto de MAAS2." }, { status: 404 });
  return NextResponse.json(out.view, { status: out.creado ? 201 : 200 });
}
