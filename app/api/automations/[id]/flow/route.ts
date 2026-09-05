import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import {
  FLOW_NODE_TYPES,
  parseFlowEdges,
  parseFlowNodes,
} from "@/lib/flow/engine";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

// The builder reads back what it just wrote, so never cache this.
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

const flowNodeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(FLOW_NODE_TYPES),
  data: z.record(z.string(), z.unknown()),
  position: z.object({ x: z.number(), y: z.number() }),
});

const flowEdgeSchema = z.object({
  id: z.string().min(1).max(128),
  source: z.string().min(1).max(64),
  sourceHandle: z.string().min(1).max(32).optional(),
  target: z.string().min(1).max(64),
});

const flowSchema = z.object({
  nodes: z.array(flowNodeSchema).max(100),
  edges: z.array(flowEdgeSchema).max(200),
});

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await params;
  const automation = await prisma.automation.findFirst({
    where: { id, workspaceId },
    select: { nodes: true, edges: true },
  });

  if (!automation) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        nodes: parseFlowNodes(automation.nodes),
        edges: parseFlowEdges(automation.edges),
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PUT(request: NextRequest, { params }: RouteProps) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can edit campaigns" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = flowSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid input",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const existing = await prisma.automation.findFirst({
    where: { id, workspaceId: context.workspaceId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 }
    );
  }

  const nodeIds = new Set(parsed.data.nodes.map((node) => node.id));
  const danglingEdge = parsed.data.edges.find(
    (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
  );
  if (danglingEdge) {
    return NextResponse.json(
      { success: false, error: "An edge points at a node that is not in the flow" },
      { status: 400 }
    );
  }

  // An empty canvas clears the flow instead of storing `[]`: a present-but-empty
  // flow would leave the campaign doing nothing, while null keeps the worker on
  // the legacy keyword/dmMessage path.
  const isEmpty = parsed.data.nodes.length === 0;

  await prisma.automation.update({
    where: { id },
    data: {
      nodes: isEmpty
        ? Prisma.DbNull
        : (parsed.data.nodes as unknown as Prisma.InputJsonValue),
      edges: isEmpty
        ? Prisma.DbNull
        : (parsed.data.edges as unknown as Prisma.InputJsonValue),
    },
  });

  return NextResponse.json({
    success: true,
    data: { nodes: parsed.data.nodes, edges: parsed.data.edges },
  });
}
