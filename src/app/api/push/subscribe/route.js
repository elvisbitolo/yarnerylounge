import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let subscription;
  try {
    ({ subscription } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !subscription ||
    typeof subscription.endpoint !== "string" ||
    !subscription.endpoint.startsWith("https://") ||
    !subscription.keys ||
    typeof subscription.keys.p256dh !== "string" ||
    typeof subscription.keys.auth !== "string"
  ) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ error: "Notifications database unavailable" }, { status: 503 });
  }

  try {
    // The current schema stores one subscription per member. A later migration
    // can expand this to one row per device without changing the client contract.
    await prisma.pushSubscription.upsert({
      where: { id: user.uid },
      create: {
        id: user.uid,
        userId: user.uid,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      update: {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    logError("push.subscribe_prisma_failed", { error: err.message, uid: user.uid });
    return NextResponse.json({ error: "Could not save subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ error: "Notifications database unavailable" }, { status: 503 });
  }

  try {
    await prisma.pushSubscription.deleteMany({ where: { id: user.uid, userId: user.uid } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("push.unsubscribe_prisma_failed", { error: err.message, uid: user.uid });
    return NextResponse.json({ error: "Could not disable notifications" }, { status: 500 });
  }
}
