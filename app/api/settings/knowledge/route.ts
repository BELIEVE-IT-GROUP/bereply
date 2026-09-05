import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentWorkspaceContext,
  canManageWorkspace,
} from "@/lib/workspace-access";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const MAX_LENGTH = 12_000;

export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: context.workspaceId },
    select: { knowledgeBase: true },
  });

  return NextResponse.json({
    success: true,
    data: { knowledgeBase: workspace?.knowledgeBase ?? "" },
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

  if (knowledgeBase.length > MAX_LENGTH) {
    return NextResponse.json(
      { success: false, error: `Max ${MAX_LENGTH} characters` },
      { status: 400 }
    );
  }

  await prisma.workspace.update({
    where: { id: context.workspaceId },
    data: { knowledgeBase: knowledgeBase.trim() || null },
  });

  return NextResponse.json({ success: true });
}
