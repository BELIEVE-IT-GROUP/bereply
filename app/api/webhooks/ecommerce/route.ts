import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@/app/generated/prisma/client";
import { addTag } from "@/lib/contacts";

interface EcommerceOrderWebhookPayload {
  event_type: string;
  data: {
    slug: string;
    order_id: string;
    display_id: number;
    email: string;
    name: string;
    items: Array<{ title: string; quantity: number; unit_price: number }>;
    total: number;
    currency: string;
    timestamp: string;
    tags?: string[];
    // Contact.id, propagado desde un link personalizado que salio de esta
    // misma app (ver app/r/[slug]/route.ts -> bc_ref -> cart.metadata ->
    // order.metadata en BeCommerce). Ausente en cualquier pedido que no
    // vino de un link nuestro -- la mayoria, todavia.
    bereply_contact_ref?: string;
  };
}

function isEcommerceOrderWebhookPayload(
  value: unknown
): value is EcommerceOrderWebhookPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.event_type !== "string") return false;

  const data = record.data;
  if (typeof data !== "object" || data === null) return false;

  return typeof (data as Record<string, unknown>).slug === "string";
}

// Same HMAC-over-raw-body pattern already proven in prod for the Maasy CRM
// integration. Compare hex digests as fixed-length buffers so a length
// mismatch short-circuits before timingSafeEqual (which throws on unequal
// lengths) instead of leaking timing information.
function isValidSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const providedHex = signatureHeader.slice(prefix.length);

  const expectedHex = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const provided = Buffer.from(providedHex, "utf8");
  const expected = Buffer.from(expectedHex, "utf8");
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!isEcommerceOrderWebhookPayload(payload)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { ecommerceStoreSlug: payload.data.slug },
      select: { id: true, ecommerceWebhookSecret: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!workspace.ecommerceWebhookSecret) {
      return NextResponse.json(
        { error: "integration not configured" },
        { status: 400 }
      );
    }

    const signatureHeader = request.headers.get("X-Webhook-Signature");
    if (
      !isValidSignature(
        rawBody,
        signatureHeader,
        workspace.ecommerceWebhookSecret
      )
    ) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // bereply_contact_ref viene de un link personalizado que esta misma app
    // genero (app/r/[slug]/route.ts): si esta presente y el Contact es de
    // ESTE workspace, el pedido se puede vincular sin que nadie haya tipeado
    // nada. Sin el (la mayoria de los pedidos, todavia) queda PENDING para
    // el emparejado manual -- no hay adivinanza de por medio.
    let linkedContactId: string | null = null;
    const ref = payload.data.bereply_contact_ref;
    if (ref) {
      const contact = await prisma.contact.findUnique({
        where: { id: ref },
        select: { id: true, workspaceId: true },
      });
      if (contact && contact.workspaceId === workspace.id) {
        linkedContactId = contact.id;
        await addTag(contact.id, "customer").catch((error) => {
          console.error("ecommerce webhook: addTag failed", error);
        });
      }
    }

    await prisma.webhookEvent.create({
      data: {
        workspaceId: workspace.id,
        object: "ecommerce_order",
        payload: payload as unknown as Prisma.InputJsonValue,
        status: linkedContactId ? "PROCESSED" : "PENDING",
      },
    });

    return NextResponse.json(
      { received: true, linked: Boolean(linkedContactId) },
      { status: 200 }
    );
  } catch (error) {
    console.error("ecommerce webhook error", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
