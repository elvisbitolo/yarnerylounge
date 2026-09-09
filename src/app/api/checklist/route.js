import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { logError } from "@/lib/server/log";

const COUNT_CHECKS = [
  { model: "post", field: "authorId" },
  { model: "rsvp", field: "userId" },
  { model: "roomEvent", field: "userId" },
];

async function hasAny(model, field, uid) {
  try {
    const count = await getPrisma()[model].count({ where: { [field]: uid } });
    return count > 0;
  } catch (err) {
    logError(`checklist.prisma_${model}_failed`, { error: err.message });
    return false;
  }
}

// Returns the member's current welcome-checklist progress. All four checks are
// derived server-side (Prisma-first).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const [userDoc, post, rsvp, room] = await Promise.all([
    getUserDoc(user.uid),
    hasAny(COUNT_CHECKS[0].model, COUNT_CHECKS[0].field, user.uid),
    hasAny(COUNT_CHECKS[1].model, COUNT_CHECKS[1].field, user.uid),
    hasAny(COUNT_CHECKS[2].model, COUNT_CHECKS[2].field, user.uid),
  ]);

  return NextResponse.json({
    check: {
      profile: {
        name: userDoc?.name || user.name || "",
        headline: userDoc?.headline || "",
        location: userDoc?.location || "",
        bio: userDoc?.bio || "",
      },
      post,
      rsvp,
      room,
    },
  });
}