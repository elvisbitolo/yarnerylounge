import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember } from "@/lib/server/authorize";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const RECORDINGS_BUCKET = process.env.SUPABASE_RECORDINGS_BUCKET || "recordings";

export async function POST(req, { params }) {
  const auth = await requireActiveMember();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (auth.userDoc?.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const prisma = getPrisma();
    const rec = await prisma.recording.findUnique({ where: { id } });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const paths = [];
    if (rec.storagePath) paths.push(rec.storagePath);
    if (rec.thumbnailPath) paths.push(rec.thumbnailPath);
    if (rec.transcriptPath) paths.push(rec.transcriptPath);
    if (paths.length) {
      try {
        await supabaseAdmin.storage.from(RECORDINGS_BUCKET).remove(paths);
      } catch {
        /* best effort */
      }
    }

    await prisma.recording.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}
