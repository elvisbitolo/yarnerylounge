import { NextResponse } from "next/server";
import { listDueQuestions, postScheduledQuestion, advanceQuestion } from "@/lib/server/questions";
import { cleanupExpiredSessions } from "@/lib/server/session-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const due = await listDueQuestions(now);
  let posted = 0;
  for (const question of due) {
    try {
      await postScheduledQuestion(question, new Date(now));
      await advanceQuestion(question, now);
      posted += 1;
    } catch {
      // A failed post is skipped; the question stays due for the next run.
    }
  }

  return NextResponse.json({ posted, sweptSessions: await cleanupExpiredSessions() });
}
