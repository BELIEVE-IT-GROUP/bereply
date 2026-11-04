import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { installSkill, SKILLS, type SkillName } from "@/lib/feed/skills";

export const maxDuration = 300;

const MAX_BYTES = 100 * 1024 * 1024;

/** Lo llama la GitHub Action de cada skill en cada push a main, con el repo empaquetado. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const expected = Buffer.from(`Bearer ${process.env.BEFEED_SKILLS_TOKEN ?? ""}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (!process.env.BEFEED_SKILLS_TOKEN || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const { name } = await params;
  if (!SKILLS.includes(name as SkillName)) return NextResponse.json({ error: "Ese skill no existe." }, { status: 404 });
  const sha = request.headers.get("x-sha") ?? "";
  if (!/^[0-9a-f]{40}$/.test(sha)) return NextResponse.json({ error: "Falta el commit." }, { status: 400 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return NextResponse.json({ error: "Pesa demasiado." }, { status: 413 });
  const version = await installSkill(name as SkillName, sha, Buffer.from(await request.arrayBuffer()));
  return NextResponse.json({ ok: true, version });
}
