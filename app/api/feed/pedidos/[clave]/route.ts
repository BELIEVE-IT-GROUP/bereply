import { NextRequest, NextResponse } from "next/server";
import { authorizedKey, requestView } from "@/lib/feed/pedidos";

/** BeAds consulta cómo va su pedido. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ clave: string }> }) {
  if (!process.env.BEFEED_PEDIDOS_KEY) return NextResponse.json({ error: "Sin configurar." }, { status: 503 });
  if (!authorizedKey(request.headers.get("x-befeed-pedidos-key"), process.env.BEFEED_PEDIDOS_KEY)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const view = await requestView(decodeURIComponent((await params).clave));
  return view ? NextResponse.json(view) : NextResponse.json({ error: "No existe." }, { status: 404 });
}
