import { NextResponse } from "next/server";
import { requireHostUser, guardJson } from "@/lib/server/authorize";
import { listHostAssignments } from "@/lib/server/hosts";
import { getRoom } from "@/lib/server/rooms";
import { getEvent } from "@/lib/server/events";
import { getCourse } from "@/lib/server/courses";
import { getGroup } from "@/lib/server/groups";
import { getSpace } from "@/lib/server/spaces";

export async function GET() {
  const auth = await requireHostUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const assignments = await listHostAssignments({ userId: auth.user.uid });
  const scopes = [];

  for (const a of assignments) {
    let info = null;
    if (a.scopeType === "room") {
      const room = await getRoom(a.scopeId);
      info = room ? { name: room.name, slug: room.slug } : null;
    } else if (a.scopeType === "event") {
      const event = await getEvent(a.scopeId);
      info = event ? { name: event.title } : null;
    } else if (a.scopeType === "course") {
      const course = await getCourse(a.scopeId);
      info = course ? { name: course.title } : null;
    } else if (a.scopeType === "group") {
      const group = await getGroup(a.scopeId);
      info = group ? { name: group.name, slug: group.slug } : null;
    } else if (a.scopeType === "space") {
      const space = await getSpace(a.scopeId);
      info = space ? { name: space.name, slug: space.slug } : null;
    }
    if (!info) continue;
    scopes.push({
      scopeType: a.scopeType,
      scopeId: a.scopeId,
      role: a.role,
      ...info,
    });
  }

  scopes.sort((x, y) => x.scopeType.localeCompare(y.scopeType) || x.name.localeCompare(y.name));

  return NextResponse.json({ scopes });
}
