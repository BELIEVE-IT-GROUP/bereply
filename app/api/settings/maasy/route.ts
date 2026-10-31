import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentWorkspaceContext,
  canManageWorkspace,
} from "@/lib/workspace-access";
import { prisma } from "@/lib/db/client";
import { listMaasyBrands, syncAccountFromMaasy } from "@/lib/maasy/brand";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Maasy brands to pick from, plus each account's current link. */
export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [brands, accounts] = await Promise.all([
      listMaasyBrands(),
      prisma.instagramAccount.findMany({
        where: { workspaceId: context.workspaceId },
        select: { id: true, maasyProjectId: true, maasySyncedAt: true },
      }),
    ]);
    return NextResponse.json({ success: true, data: { brands, accounts } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Maasy unavailable" },
      { status: 502 }
    );
  }
}

/** Links an account to a Maasy brand (or unlinks with null) and syncs now. */
export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can change this" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const instagramAccountId = typeof body?.instagramAccountId === "string" ? body.instagramAccountId : "";
  const maasyProjectId =
    typeof body?.maasyProjectId === "string" && body.maasyProjectId ? body.maasyProjectId : null;

  const { count } = await prisma.instagramAccount.updateMany({
    where: { id: instagramAccountId, workspaceId: context.workspaceId },
    data: { maasyProjectId, ...(maasyProjectId ? {} : { maasySyncedAt: null }) },
  });
  if (count === 0) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (!maasyProjectId) {
    return NextResponse.json({ success: true, data: { knowledgeBase: null } });
  }

  try {
    const knowledgeBase = await syncAccountFromMaasy(instagramAccountId);
    return NextResponse.json({ success: true, data: { knowledgeBase } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Sync failed" },
      { status: 502 }
    );
  }
}
