import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { FeedNav } from "./nav";
import "./feed.css";

export const metadata: Metadata = {
  title: "BeFeed",
  robots: { index: false, follow: false },
};

export default async function FeedLayout({ children }: { children: React.ReactNode }) {
  const { workspaceId, account, actor } = await feedContext();
  const today = new Date(new Date().toISOString().slice(0, 10));
  const pendientes = await prisma.feedPiece.count({
    where: { week: { workspaceId, endsOn: { gte: today } }, blockedBy: { not: null } },
  });

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
      />
      <div className="app">
        <aside className="side">
          <div className="wm">
            <span>Be</span>Feed<small className="by">by Believe</small>
          </div>
          <Link className="marca" href="/feed/cuentas">
            <small>Marca</small>
            <b>{account ? `@${account.username}` : "Sin cuentas"}</b>
          </Link>
          <FeedNav pendientes={pendientes} />
          <div className="quien"><b>{actor.name}</b></div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </>
  );
}
