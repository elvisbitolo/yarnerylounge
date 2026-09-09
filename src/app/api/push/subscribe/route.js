import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { subscription } = await req.json();
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  try {
    await getPrisma().pushSubscription.upsert({
      where: { id: user.uid },
      create: {
        id: user.uid,
        userId: user.uid,
        endpoint: subscription.endpoint,
        keys: subscription.keys || {},
      },
      update: {
        endpoint: subscription.endpoint,
        keys: subscription.keys || {},
      },
    });
  } catch (err) {
    logError("push.subscribe_prisma_failed", { error: err.message, uid: user.uid });
    return NextResponse.json({ error: "Could not save subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
