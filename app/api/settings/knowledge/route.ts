import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentWorkspaceContext,
  canManageWorkspace,
} from "@/lib/workspace-access";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const MAX_LENGTH = 12_000;

// No instagramAccountId → the workspace-wide fallback; otherwise that account's
// own knowledge, scoped to the caller's workspace so ids from elsewhere miss.
async function findKnowledge(workspaceId: string, instagramAccountId: string | null) {
  if (!instagramAccountId) {
    return prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { knowledgeBase: true },
    });
  }
  return prisma.instagramAccount.findFirst({
    where: { id: instagramAccountId, workspaceId },
    select: { knowledgeBase: true },
  });
}

export async function GET(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const found = await findKnowledge(
    context.workspaceId,
    request.nextUrl.searchParams.get("instagramAccountId")
  );
  if (!found) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { knowledgeBase: found.knowledgeBase ?? "" },
  });
}

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can change this" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const knowledgeBase = typeof body?.knowledgeBase === "string" ? body.knowledgeBase : "";
  const instagramAccountId =
    typeof body?.instagramAccountId === "string" && body.instagramAccountId
      ? body.instagramAccountId
      : null;

  if (knowledgeBase.length > MAX_LENGTH) {
    return NextResponse.json(
      { success: false, error: `Max ${MAX_LENGTH} characters` },
      { status: 400 }
    );
  }

  const data = { knowledgeBase: knowledgeBase.trim() || null };

  if (instagramAccountId) {
    const { count } = await prisma.instagramAccount.updateMany({
      where: { id: instagramAccountId, workspaceId: context.workspaceId },
      data,
    });
    if (count === 0) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }
  } else {
    await prisma.workspace.update({
      where: { id: context.workspaceId },
      data,
    });
  }

  return NextResponse.json({ success: true });
}
