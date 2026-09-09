import { NextResponse } from "next/server";
import webpush from "web-push";
import { requireOwner, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logAudit } from "@/lib/server/audit";
import { clean } from "@/lib/server/validate";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`push-send:${auth.user.uid}`, { limit: 10 });
  if (limited) return limited;

  const { title, body, url } = await req.json();
  const cleanTitle = clean(title, 100);
  const cleanBody = clean(body, 500);
  const cleanUrl = clean(url, 500);
  if (!cleanTitle || !cleanBody) {
    return NextResponse.json({ error: "title and body required" }, { status: 400 });
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    return NextResponse.json(
      { error: "Push not configured — add VAPID keys." },
      { status: 501 }
    );
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const payload = JSON.stringify({ title: cleanTitle, body: cleanBody, url: cleanUrl || "/" });

  let sent = 0;
  let failed = 0;
  const PAGE = 500;

  const prisma = getPrisma();
  try {
    let lastCursor = null;
    for (;;) {
      const subs = await prisma.pushSubscription.findMany({
        take: PAGE,
        ...(lastCursor ? { cursor: { id: lastCursor }, skip: 1 } : {}),
        orderBy: { id: "asc" },
        select: { id: true, endpoint: true, keys: true },
      });
      if (subs.length === 0) break;

      const jobs = [];
      for (const sub of subs) {
        jobs.push(
          webpush
            .sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload)
            .then(() => {
              sent++;
            })
            .catch(async (err) => {
              failed++;
              if (err.statusCode === 404 || err.statusCode === 410) {
                try {
                  await prisma.pushSubscription.delete({ where: { id: sub.id } });
                } catch {
                  // ignore clean-up failures
                }
              }
            })
        );
      }
      await Promise.all(jobs);

      lastCursor = subs[subs.length - 1].id;
      if (subs.length < PAGE) break;
    }
  } catch (err) {
    logError("push.send_prisma_failed", { error: err.message });
  }
  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: "push.announcement_sent",
    metadata: { title: cleanTitle, sent, failed },
  });

  return NextResponse.json({ sent, failed });
}