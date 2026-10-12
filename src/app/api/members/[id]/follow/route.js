import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { followUser, unfollowUser, isFollowing, getFollowerCount, getFollowingCount } from "@/lib/server/follows";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

// Upper bound on how many members the followers/following dialog lists. We fetch
// one extra row to detect truncation without a second count query.
const LIST_LIMIT = 100;

// Suspended accounts never appear in a public list. `suspended` is nullable, so
// `{ not: true }` (rather than `{ equals: false }`) keeps rows where it is null.
const VISIBLE = { NOT: { suspended: true } };

export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const list = req.nextUrl.searchParams.get("list");
  if (list === "followers" || list === "following") {
    const limited = rateLimitGuard(`follow-list:${user.uid}`, { limit: 60 });
    if (limited) return limited;

    const isFollowers = list === "followers";
    try {
      const rows = await getPrisma().follow.findMany({
        where: isFollowers
          ? { followingId: id, follower: VISIBLE }
          : { followerId: id, following: VISIBLE },
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT + 1,
        select: {
          follower: {
            select: { id: true, name: true, username: true, photoURL: true, extra: true, suspended: true },
          },
          following: {
            select: { id: true, name: true, username: true, photoURL: true, extra: true, suspended: true },
          },
        },
      });

      const truncated = rows.length > LIST_LIMIT;
      const members = rows
        .slice(0, LIST_LIMIT)
        .map((row) => (isFollowers ? row.follower : row.following))
        .filter((member) => {
          const extra = member.extra && typeof member.extra === "object" ? member.extra : {};
          return member.name && extra.profileVisibility !== "private";
        })
        .map(({ id: memberId, name, username, photoURL }) => ({
          id: memberId,
          name,
          username: username || "",
          photoURL: photoURL || "",
        }));

      return NextResponse.json({ members, truncated });
    } catch (err) {
      logError("follows.prisma_list_failed", { list, error: err.message });
      return NextResponse.json({ error: "Failed to load member list" }, { status: 500 });
    }
  }

  const [following, followerCount, followingCount] = await Promise.all([
    isFollowing(user.uid, id),
    getFollowerCount(id),
    getFollowingCount(id),
  ]);

  return NextResponse.json({ following, followerCount, followingCount });
}

export async function POST(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limited = rateLimitGuard(`follow:${user.uid}`, { limit: 30 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "follow";

  let following;
  if (action === "unfollow") {
    following = (await unfollowUser(user.uid, id)).following;
  } else {
    const alreadyFollowing = await isFollowing(user.uid, id);
    const result = await followUser(user.uid, id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    following = result.following;
    if (!alreadyFollowing && following) {
      notifyNewFollower(id, user).catch(() => {});
    }
  }

  const [followerCount, followingCount] = await Promise.all([
    getFollowerCount(id),
    getFollowingCount(id),
  ]);

  return NextResponse.json({
    following: Boolean(following),
    followerCount: Number(followerCount) || 0,
    followingCount: Number(followingCount) || 0,
  });
}

async function notifyNewFollower(followedUserId, user) {
  if (!followedUserId || followedUserId === user.uid) return;
  const userDoc = await getUserDoc(user.uid);
  const actorName = userDoc?.name || user.name || user.email?.split("@")[0] || "Member";
  const { createNotification } = await import("@/lib/server/notifications");
  await createNotification({
    userId: followedUserId,
    type: "follow",
    actorId: user.uid,
    actorName,
    targetId: user.uid,
    href: `/members/${user.uid}`,
    text: `started following you`,
  });
}
