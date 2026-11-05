import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ensureWorkspaceForUser } from "@/lib/workspace";
import type { Actor } from "./stages";

export const ACCOUNT_COOKIE = "feed_account";

/** Quién mira y qué marca tiene elegida. Si no hay sesión, al login. */
export async function feedContext() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await ensureWorkspaceForUser(session.user.id, session.user.email);
  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { connectedAt: "asc" },
    select: { id: true, instagramId: true, username: true, name: true, maasyProjectId: true, maas2ProjectId: true, tokenExpiresAt: true, connectedAt: true },
  });
  const chosen = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  const account = accounts.find((a) => a.id === chosen) ?? accounts[0] ?? null;
  const actor: Actor = { type: "person", name: session.user.name ?? session.user.email ?? "Persona" };
  return { workspaceId: workspace.id, accounts, account, actor };
}
