import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { syncAccountFromMaasy } from "@/lib/maasy/brand";

export const maxDuration = 900;

/**
 * Re-pulls every Maasy-linked account's brand DNA, so an edit in Maasy reaches
 * the DM assistant by the next day without anyone touching BeReply.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.instagramAccount.findMany({
    where: { maasyProjectId: { not: null } },
    select: { id: true, username: true },
  });

  const failed: string[] = [];
  for (const account of accounts) {
    try {
      await syncAccountFromMaasy(account.id);
    } catch (error) {
      console.error(`[sync-maasy] @${account.username}:`, error);
      failed.push(account.username);
    }
  }

  return NextResponse.json(
    { success: failed.length === 0, synced: accounts.length - failed.length, failed },
    { status: failed.length ? 500 : 200 }
  );
}
