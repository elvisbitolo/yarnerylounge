import { NextResponse } from "next/server";
import { getCurrentUserStatus } from "@/lib/server/auth";
import {
  SESSION_OK,
  SESSION_NEEDS_CONSENT,
  SESSION_UNAVAILABLE,
} from "@/lib/server/session-store";
import { assertSameOrigin } from "@/lib/server/same-origin";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { TOS_VERSION } from "@/lib/tos";

// The only write path for Terms of Service consent. Idempotent: a member who
// has already accepted gets a 200 back rather than an error, so a double
// submit or a reload at the wrong moment cannot look like a failure.
export async function POST(req) {
  const crossOrigin = assertSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  const current = await getCurrentUserStatus();
  if (current.status === SESSION_UNAVAILABLE) {
    return NextResponse.json(
      { error: "Session temporarily unavailable" },
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }

  // Both a live session and one still awaiting consent resolve to an identity
  // here; anything else (no cookie, revoked, suspended) is not signed in.
  const identity = current.identity;
  if (
    !identity ||
    (current.status !== SESSION_OK && current.status !== SESSION_NEEDS_CONSENT)
  ) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limited = rateLimitGuard(`consent:${identity.uid}`, { limit: 20 });
  if (limited) return limited;

  const body = await req.json().catch(() => (null));
  // The client must echo the exact revision it accepted. Without this a
  // replayed or hand-rolled POST could stamp a version nobody ever displayed,
  // and a future ToS revision could not be told apart from an old one.
  if (!body || body.accepted !== true || body.version !== TOS_VERSION) {
    return NextResponse.json({ error: "terms_consent_required" }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    if (!prisma) throw new Error("prisma unavailable");
    await prisma.user.update({
      where: { id: identity.uid },
      data: { tosAcceptedAt: new Date(), tosVersion: TOS_VERSION, updatedAt: new Date() },
    });
  } catch (err) {
    logError("tos.consent_write_failed", { uid: identity.uid, error: err.message });
    return NextResponse.json({ error: "Could not save your acceptance" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tosVersion: TOS_VERSION });
}
