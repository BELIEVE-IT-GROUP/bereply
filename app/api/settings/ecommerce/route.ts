import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  getCurrentWorkspaceContext,
  canManageWorkspace,
} from "@/lib/workspace-access";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

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
    select: { ecommerceStoreSlug: true, ecommerceWebhookSecret: true },
  });

  return NextResponse.json({
    success: true,
    data: {
      slug: workspace?.ecommerceStoreSlug ?? null,
      hasSecret: Boolean(workspace?.ecommerceWebhookSecret),
      webhookUrl: `${getBaseUrl()}/api/webhooks/ecommerce`,
    },
  });
}

/**
 * Sets the BeCommerce store slug and/or (re)generates the shared secret.
 * The secret is returned exactly once, here — same pattern as an API key
 * generator. Losing it means generating a new one, not recovering the old.
 */
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
  const slug =
    typeof body?.slug === "string" && body.slug.trim()
      ? body.slug.trim()
      : undefined;

  const secret = crypto.randomBytes(32).toString("hex");

  try {
    await prisma.workspace.update({
      where: { id: context.workspaceId },
      data: {
        ...(slug ? { ecommerceStoreSlug: slug } : {}),
        ecommerceWebhookSecret: secret,
      },
    });
  } catch (error: unknown) {
    // Unique constraint on ecommerceStoreSlug — another workspace already
    // claimed it.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { success: false, error: "That store slug is already in use" },
        { status: 409 }
      );
    }
    throw error;
  }

  return NextResponse.json({
    success: true,
    data: { secret, webhookUrl: `${getBaseUrl()}/api/webhooks/ecommerce` },
  });
}
