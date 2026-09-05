import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

// Tags are edited from this same list, so a stale cached read would show a
// contact's old tags right after the user just changed them.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const cursor = request.nextUrl.searchParams.get("cursor");

  const contacts = await prisma.contact.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    take: PAGE_SIZE,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const nextCursor =
    contacts.length === PAGE_SIZE ? contacts[contacts.length - 1].id : null;

  return NextResponse.json({
    success: true,
    data: { contacts, nextCursor },
  });
}
