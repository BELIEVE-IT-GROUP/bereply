import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getRequestIp, hashClickIp } from "@/lib/tracking/server";

type RedirectRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: NextRequest, { params }: RedirectRouteProps) {
  const { slug } = await params;
  const trackedLink = await prisma.trackedLink.findUnique({
    where: { slug },
    select: {
      id: true,
      workspaceId: true,
      automationId: true,
      destinationUrl: true,
      automation: {
        select: {
          instagramAccountId: true,
        },
      },
    },
  });

  if (!trackedLink) {
    return NextResponse.redirect(new URL("/", request.url), { status: 302 });
  }

  // `c` viene de un link personalizado (DM/private reply, nunca la respuesta
  // publica a un comentario — ver buildTrackedUrl). Se valida que el contacto
  // sea del MISMO workspace que el link antes de confiar en el, para que un
  // valor manipulado a mano no ate el click a un contacto ajeno.
  const rawContactId = new URL(request.url).searchParams.get("c");
  let contactId: string | null = null;
  if (rawContactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: rawContactId },
      select: { id: true, workspaceId: true },
    });
    if (contact && contact.workspaceId === trackedLink.workspaceId) {
      contactId = contact.id;
    }
  }

  await prisma.linkClick.create({
    data: {
      workspaceId: trackedLink.workspaceId,
      automationId: trackedLink.automationId,
      instagramAccountId: trackedLink.automation.instagramAccountId,
      trackedLinkId: trackedLink.id,
      contactId,
      ipHash: hashClickIp(getRequestIp(request)),
      userAgent: request.headers.get("user-agent"),
      referrer: request.headers.get("referer"),
    },
  });

  // Reenvia el mismo id al destino como bc_ref, para que BeCommerce lo lleve
  // hasta la orden (cart.metadata -> order.metadata) y el webhook de vuelta
  // a BeReply pueda resolver el pedido a este contacto sin que nadie tipee
  // nada en el checkout. Sin contacto (link generico, o "c" invalido/ajeno):
  // el redirect queda exactamente igual que hoy.
  const destination = new URL(trackedLink.destinationUrl);
  if (contactId) {
    destination.searchParams.set("bc_ref", contactId);
  }

  return NextResponse.redirect(destination.toString(), { status: 302 });
}
