import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const subscription = body?.subscription;
  if (!subscription?.endpoint || !subscription?.keys) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  try {
    await getPrisma().pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId: user.uid,
        endpoint: subscription.endpoint,
        keys: subscription.keys || {},
      },
      update: {
        userId: user.uid,
        keys: subscription.keys || {},
      },
    });
  } catch (err) {
    logError("push.subscribe_prisma_failed", { error: err.message, uid: user.uid });
    return NextResponse.json({ error: "Could not save subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";

  try {
    const prisma = getPrisma();
    if (endpoint) {
      // Only remove this browser/device; other registered devices stay enabled.
      await prisma.pushSubscription.deleteMany({
        where: { userId: user.uid, endpoint },
      });
    } else {
      // Backwards-compatible behaviour for older clients that request account-wide removal.
      await prisma.pushSubscription.deleteMany({ where: { userId: user.uid } });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("push.unsubscribe_prisma_failed", { error: err.message, uid: user.uid });
    return NextResponse.json({ error: "Could not disable push notifications" }, { status: 500 });
  }
}
