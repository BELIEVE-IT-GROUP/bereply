import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { refreshAccountMetrics } from "@/lib/feed/service";

export const maxDuration = 300;

/** Refresca las métricas de todas las cuentas. Una cuenta que falla no frena a las demás. */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.instagramAccount.findMany({ where: { accessToken: { not: "" } }, select: { id: true, username: true } });
  const results: Record<string, number | string> = {};
  for (const account of accounts) {
    try {
      results[account.username] = await refreshAccountMetrics(account.id);
    } catch (error) {
      results[account.username] = error instanceof Error ? error.message.slice(0, 120) : "falló";
    }
  }
  return NextResponse.json({ success: true, results });
}
