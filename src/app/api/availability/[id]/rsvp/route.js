import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { canModerate } from "@/lib/server/auth";
import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";
import { toggleAvailabilityRsvp, getAvailability } from "@/lib/server/availability";
import { createNotification } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const caps = await getCapabilities(auth.user.uid);
  if (!canUseMatchmaker(caps) && !canModerate(auth.userDoc)) {
    return NextResponse.json({ error: "The matchmaker calendar is a Hooking Up + perk" }, { status: 403 });
  }

  const { id } = await params;
  const result = await toggleAvailabilityRsvp(id, {
    uid: auth.user.uid,
    name: auth.userDoc?.name || auth.user.displayName || "Member",
  });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

  if (result.joined && result.hostId && result.hostId !== auth.user.uid) {
    await createNotification({
      userId: result.hostId,
      type: "availability_rsvp",
      actorId: auth.user.uid,
      actorName: auth.userDoc?.name || auth.user.displayName || "Member",
      targetId: id,
      href: "/calendar",
      text: `wants to stitch along${result.title ? ` — "${result.title}"` : ""}.`,
    }).catch(() => {});
  }

  return NextResponse.json({ joined: result.joined });
}