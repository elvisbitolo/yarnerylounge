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
  if (
    !subscription ||
    typeof subscription.endpoint !== "string" ||
    !subscription.endpoint.startsWith("https://") ||
    !subscription.keys ||
    typeof subscription.keys.p256dh !== "string" ||
    typeof subscription.keys.auth !== "string"
  ) {
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ error: "Notifications database unavailable" }, { status: 503 });
  }

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId: user.uid,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      update: {
        userId: user.uid,
        keys: subscription.keys,
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

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
    return NextResponse.json({ error: "A valid subscription endpoint is required" }, { status: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ error: "Notifications database unavailable" }, { status: 503 });
  }

  try {
    // Disable only the current device. Other phones/browsers registered to this
    // member must remain subscribed.
    await prisma.pushSubscription.deleteMany({
      where: { userId: user.uid, endpoint },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("push.unsubscribe_prisma_failed", { error: err.message, uid: user.uid });
    return NextResponse.json({ error: "Could not disable push notifications" }, { status: 500 });
  }
}
