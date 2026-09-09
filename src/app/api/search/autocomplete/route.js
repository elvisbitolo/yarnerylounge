import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import {
  buildAutocompleteSuggestions,
  rankResults,
} from "@/lib/server/search-engine";
import { getPrisma } from "@/lib/db/prisma";

export async function GET(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`search:autocomplete:${auth.user.uid}`, { limit: 30 });
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const isStaff =
    auth.userDoc?.role === "owner" || auth.userDoc?.role === "moderator";
  const uid = auth.user.uid;

  const prisma = getPrisma();
  const membershipRows = await prisma.spaceMember.findMany({
    where: { userId: uid },
    take: 500,
    select: { spaceId: true },
  });
  const memberSpaceIds = new Set(membershipRows.map((r) => r.spaceId));

  const [members, spaces, courses, events] = await Promise.all([
    prisma.user.findMany({ take: 300 }),
    prisma.space.findMany({ take: 300 }),
    prisma.course.findMany({ take: 300 }),
    prisma.event.findMany({ take: 300 }),
  ]);

  const accessibleSpaces = spaces.filter(
    (s) =>
      s.status === "active" &&
      (s.publicPreview || isStaff || memberSpaceIds.has(s.id))
  );

  const accessibleEvents = events.filter(
    (e) =>
      e.publicPreview || isStaff || !e.spaceId || memberSpaceIds.has(e.spaceId)
  );

  const rankedMembers = rankResults(q, members, (m) => [m.name, m.username]);
  const rankedSpaces = rankResults(q, accessibleSpaces, (s) => s.name);
  const rankedCourses = rankResults(
    q,
    courses.filter((c) => c.status === "published"),
    (c) => c.title
  );
  const rankedEvents = rankResults(q, accessibleEvents, (e) => e.title);

  const suggestions = buildAutocompleteSuggestions(
    q,
    rankedMembers,
    rankedSpaces,
    rankedCourses,
    rankedEvents
  );

  return NextResponse.json({ suggestions });
}