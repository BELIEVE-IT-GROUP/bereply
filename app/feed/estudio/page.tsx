import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { feedContext } from "@/lib/feed/context";
import { JOB_LABEL } from "./job";
import { day, Head } from "../ui";

export default async function EstudioPage() {
  const { workspaceId, account } = await feedContext();
  const pieces = await prisma.feedPiece.findMany({
    where: { OR: [{ needsVideo: true }, { videoUrl: { not: null } }], week: { workspaceId, ...(account ? { instagramAccountId: account.id } : {}) } },
    include: { job: true },
    orderBy: { publishOn: "desc" },
    take: 40,
  });

  return (
    <>
      <Head back={{ href: "/feed", label: "Hoy" }} eye={account ? `@${account.username} · Reels que se producen aquí` : "Reels que se producen aquí"}>
        Del guion al <i>MP4</i>
      </Head>
      <p className="sub">Solo Reels sin tráiler, sala real ni personas reales: lo demás se graba o lo edita Carol. Un guion llega aquí con el botón Enviar a Estudio de su pieza.</p>
      <section className="plano">
        {pieces.length === 0 ? <p className="sub">Nada todavía. Abre una pieza de la <Link href="/feed/semana" style={{ color: "inherit" }}>semana</Link> y envíala a Estudio.</p> : null}
        <div className="lista">
          {pieces.map((p) => (
            <Link key={p.id} href={`/feed/estudio/${p.id}`} style={{ color: "inherit", textDecoration: "none" }}>
              <span style={{ flex: "1 1 300px" }}><b style={{ fontWeight: 500 }}>{p.title}</b><br /><span className="mute" style={{ fontSize: 13 }}>{day(p.publishOn)}</span></span>
              <span className={p.job?.status === "LISTO" ? "tag ok" : p.job?.status === "FALLO" ? "tag freno" : "tag"}>{p.job ? JOB_LABEL[p.job.status] : p.videoUrl ? "Adjunto" : "Sin ficha"}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
