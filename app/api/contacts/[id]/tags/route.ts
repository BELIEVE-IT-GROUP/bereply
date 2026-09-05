import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { addTag, removeTag } from "@/lib/contacts";

type RouteProps = { params: Promise<{ id: string }> };

const tagSchema = z.object({
  tag: z.string().trim().min(1).max(50),
});

async function requireOwnedContact(workspaceId: string, contactId: string) {
  return prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    select: { id: true },
  });
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const parsed = tagSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid tag" },
      { status: 400 }
    );
  }

  const { id } = await params;
  const contact = await requireOwnedContact(workspaceId, id);
  if (!contact) {
    return NextResponse.json(
      { success: false, error: "Contact not found" },
      { status: 404 }
    );
  }

  const updated = await addTag(id, parsed.data.tag);
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(request: NextRequest, { params }: RouteProps) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const parsed = tagSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid tag" },
      { status: 400 }
    );
  }

  const { id } = await params;
  const contact = await requireOwnedContact(workspaceId, id);
  if (!contact) {
    return NextResponse.json(
      { success: false, error: "Contact not found" },
      { status: 404 }
    );
  }

  const updated = await removeTag(id, parsed.data.tag);
  return NextResponse.json({ success: true, data: updated });
}
