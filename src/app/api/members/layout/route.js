import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/same-origin";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  LAYOUT_PIN_KEY,
  isLayoutEditor,
  pinFromVirtual,
  sanitizePin,
} from "@/lib/server/members-layout-core";

// Save or clear a dragged avatar's coordinate on /members.
//
// Three shapes:
//   { id, x, y, width, height }  pin the centre of the dropped avatar
//   { id, reset: true }          release one avatar back to the spiral
//   { reset: "all" }             release every avatar
//
// Permission is an exact allow-list (members-layout-core.js), checked here and
// again on the page that decides whether to render the drag affordances — the
// UI check is a courtesy, this one is the rule.

export async function POST(req) {
  const crossOrigin = assertSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!isLayoutEditor(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // A drag is one pointerup, but the editor is trying positions live. Loose
  // enough to be invisible, tight enough that a runaway loop cannot hammer Postgres.
  const limited = rateLimitGuard(`members-layout:${user.uid}`, { limit: 120 });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  try {
    if (body.reset === "all") {
      const cleared = await clearAllPins(prisma);
      return NextResponse.json({ ok: true, cleared });
    }

    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, extra: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Read-merge-write: User.extra also carries skillLevel, timezone,
    // onboarding answers and the block list, so it is never overwritten whole.
    const extra = { ...(target.extra || {}) };

    if (body.reset === true) {
      delete extra[LAYOUT_PIN_KEY];
    } else {
      const pin = pinFromVirtual(
        Number(body.x),
        Number(body.y),
        Number(body.width),
        Number(body.height)
      );
      if (!pin) {
        return NextResponse.json({ error: "Invalid position" }, { status: 400 });
      }
      extra[LAYOUT_PIN_KEY] = pin;
    }

    await prisma.user.update({ where: { id: target.id }, data: { extra } });
    return NextResponse.json({ ok: true, pin: sanitizePin(extra[LAYOUT_PIN_KEY]) });
  } catch (error) {
    logError("members_layout_write", error, { uid: user.uid });
    return NextResponse.json({ error: "Could not save layout" }, { status: 500 });
  }
}

// Every row whose extra carries a pin is rewritten without it. Rows are read
// first rather than updated blind, because Prisma cannot remove a single key
// from a jsonb value — and extra must not be clobbered. The directory is
// hundreds of rows at most, so one pass is cheaper than a JSON-path bulk write
// that would also have to special-case extra IS NULL.
async function clearAllPins(prisma) {
  const rows = await prisma.user.findMany({ select: { id: true, extra: true } });
  const pinned = rows.filter((row) => row.extra && row.extra[LAYOUT_PIN_KEY] !== undefined);
  if (pinned.length === 0) return 0;

  await prisma.$transaction(
    pinned.map((row) => {
      const extra = { ...row.extra };
      delete extra[LAYOUT_PIN_KEY];
      return prisma.user.update({ where: { id: row.id }, data: { extra } });
    })
  );
  return pinned.length;
}
