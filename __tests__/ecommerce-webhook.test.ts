import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockAddTag } = vi.hoisted(() => ({
  mockPrisma: {
    workspace: { findUnique: vi.fn() },
    contact: { findUnique: vi.fn() },
    webhookEvent: { create: vi.fn() },
  },
  mockAddTag: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/contacts", () => ({ addTag: mockAddTag }));

import { POST } from "../app/api/webhooks/ecommerce/route";

const SECRET = "test_ecommerce_secret";

function sign(rawBody: string, secret = SECRET) {
  return "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
}

function request(body: unknown, secret = SECRET) {
  const rawBody = JSON.stringify(body);
  return new Request("https://reply.believe-global.com/api/webhooks/ecommerce", {
    method: "POST",
    headers: { "X-Webhook-Signature": sign(rawBody, secret) },
    body: rawBody,
  }) as Parameters<typeof POST>[0];
}

const basePayload = {
  event_type: "order_placed",
  data: {
    slug: "norte",
    order_id: "order_1",
    display_id: 1,
    email: "buyer@example.com",
    name: "Buyer",
    items: [{ title: "Item", quantity: 1, unit_price: 100 }],
    total: 100,
    currency: "eur",
    timestamp: new Date().toISOString(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.webhookEvent.create.mockResolvedValue({});
  mockAddTag.mockResolvedValue({});
});

describe("ecommerce order webhook", () => {
  it("links the order to a same-workspace contact and tags it", async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: "workspace_1",
      ecommerceWebhookSecret: SECRET,
    });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: "contact_1",
      workspaceId: "workspace_1",
    });

    const res = await POST(
      request({ ...basePayload, data: { ...basePayload.data, bereply_contact_ref: "contact_1" } })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ received: true, linked: true });
    expect(mockAddTag).toHaveBeenCalledWith("contact_1", "customer");
    expect(mockPrisma.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "PROCESSED" }),
    });
  });

  it("ignores a contact ref from a different workspace: logs PENDING, no tag", async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: "workspace_1",
      ecommerceWebhookSecret: SECRET,
    });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: "contact_evil",
      workspaceId: "workspace_ajeno",
    });

    const res = await POST(
      request({
        ...basePayload,
        data: { ...basePayload.data, bereply_contact_ref: "contact_evil" },
      })
    );
    const body = await res.json();

    expect(body).toEqual({ received: true, linked: false });
    expect(mockAddTag).not.toHaveBeenCalled();
    expect(mockPrisma.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "PENDING" }),
    });
  });

  it("logs PENDING, unlinked, when there is no contact ref at all (the common case today)", async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: "workspace_1",
      ecommerceWebhookSecret: SECRET,
    });

    const res = await POST(request(basePayload));
    const body = await res.json();

    expect(body).toEqual({ received: true, linked: false });
    expect(mockPrisma.contact.findUnique).not.toHaveBeenCalled();
    expect(mockAddTag).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature before touching the contact ref", async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: "workspace_1",
      ecommerceWebhookSecret: SECRET,
    });

    const res = await POST(
      request(
        { ...basePayload, data: { ...basePayload.data, bereply_contact_ref: "contact_1" } },
        "wrong_secret"
      )
    );

    expect(res.status).toBe(401);
    expect(mockPrisma.contact.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it("404s for a slug with no matching workspace", async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue(null);

    const res = await POST(request(basePayload));

    expect(res.status).toBe(404);
  });
});
