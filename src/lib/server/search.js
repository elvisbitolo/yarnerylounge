import { getPrisma } from "@/lib/db/prisma";
import { canModerate } from "@/lib/server/auth";
import { rankResults } from "@/lib/server/search-engine";
import { logError } from "@/lib/server/log";

function toMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

const FETCH_MODELS = {
  posts: "post",
  users: "user",
  groups: "group",
  spaces: "space",
  courses: "course",
  events: "event",
  rooms: "room",
};

async function fetchDocs(collectionName, limit = 300) {
  const prisma = getPrisma();
  const model = FETCH_MODELS[collectionName];
  if (prisma && model) {
    try {
      return await prisma[model].findMany({ take: limit });
    } catch (err) {
      logError("search.prisma_fetch_failed", { error: err.message, collectionName });
    }
  }
  return [];
}

async function getUserMemberships(uid) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const [spaceRows, groupRows] = await Promise.all([
        prisma.spaceMember.findMany({ where: { userId: uid }, take: 500 }),
        prisma.groupMember.findMany({ where: { userId: uid }, take: 500 }),
      ]);
      return {
        spaceIds: new Set(spaceRows.map((m) => m.spaceId)),
        groupIds: new Set(groupRows.map((m) => m.groupId)),
      };
    } catch (err) {
      logError("search.prisma_memberships_failed", { error: err.message, uid });
    }
  }
  return { spaceIds: new Set(), groupIds: new Set() };
}

const TYPE_LIMIT = 20;

const TYPE_CATEGORIES = {
  posts: ["posts"],
  members: ["members"],
  spaces: ["spaces", "groups", "rooms"],
  courses: ["courses"],
  events: ["events"],
};

export async function searchCommunity(
  { q = "", hashtag = "", type = "", spaceId = "" },
  uid = "",
  role = ""
) {
  const needle = q.trim().toLowerCase();
  const tag = hashtag.trim().toLowerCase().replace(/^#/, "");
  const isStaff = canModerate({ role });
  const normalizedType =
    ["posts", "members", "spaces", "courses", "events"].includes(type) ? type : "";

  const includeCategory = (category) =>
    !normalizedType || (TYPE_CATEGORIES[normalizedType] || []).includes(category);

  const memberships = isStaff ? null : await getUserMemberships(uid);

  const canReadPost = (post) => {
    if (isStaff || post.authorId === uid) return true;
    if (post.status === "deleted") return false;
    if (post.spaceId && !memberships.spaceIds.has(post.spaceId)) return false;
    if (post.groupId && !memberships.groupIds.has(post.groupId)) return false;
    return true;
  };

  const inSpaceScope = (item) => !spaceId || item.spaceId === spaceId;

  const postText = (p) => [
    p.text,
    p.authorName,
    ...(Array.isArray(p.pollOptions) ? p.pollOptions : []),
    ...(Array.isArray(p.hashtags) ? p.hashtags : []),
  ];

  let rawPosts = [];
  if (tag) {
    const prisma = getPrisma();
    if (prisma) {
      try {
        rawPosts = await prisma.post.findMany({ where: { hashtags: { has: tag } }, take: 60 });
      } catch (err) {
        logError("search.prisma_hashtag_failed", { error: err.message, tag });
      }
    }
  } else if (needle && includeCategory("posts")) {
    rawPosts = await fetchDocs("posts");
  }

  const visiblePosts = rawPosts.filter(canReadPost).filter(inSpaceScope);

  let posts;
  if (tag) {
    posts = [...visiblePosts].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } else if (needle) {
    posts = rankResults(needle, visiblePosts, postText);
  } else {
    posts = [];
  }

  posts = posts.slice(0, TYPE_LIMIT).map((p) => {
      const out = {
        id: p.id,
        text: p.text || "",
        authorName: p.authorName || "",
        authorId: p.authorId || "",
        kind: p.kind || "post",
        hashtags: p.hashtags || [],
        likeCount: Object.keys(p.likes || {}).length,
        likedByMe: !!(p.likes || {})[uid],
        bookmarkedByMe: !!(p.bookmarks || {})[uid],
        createdAt: toMillis(p.createdAt),
        spaceId: p.spaceId || "",
        groupId: p.groupId || "",
      };
      if (p._score) out._score = p._score;
      return out;
    });

  const [members, groups, spaces, courses, events, rooms] = await Promise.all([
    needle && includeCategory("members")
      ? rankResults(needle, await fetchDocs("users"), (u) => [u.name, u.username]).slice(0, TYPE_LIMIT)
      : [],
    needle && includeCategory("spaces")
      ? rankResults(
          needle,
          (await fetchDocs("groups")).filter((g) => g.status === "active"),
          (g) => g.name
        ).slice(0, TYPE_LIMIT)
      : [],
    needle && includeCategory("spaces")
      ? rankResults(
          needle,
          (await fetchDocs("spaces")).filter(
            (s) =>
              s.status === "active" &&
              (s.publicPreview || isStaff || memberships.spaceIds.has(s.id))
          ),
          (s) => s.name
        ).slice(0, TYPE_LIMIT)
      : [],
    needle && includeCategory("courses")
      ? rankResults(
          needle,
          (await fetchDocs("courses"))
            .filter((c) => c.status === "published")
            .filter(inSpaceScope),
          (c) => c.title
        ).slice(0, TYPE_LIMIT)
      : [],
    needle && includeCategory("events")
      ? rankResults(
          needle,
          (await fetchDocs("events"))
            .filter(
              (e) =>
                e.status !== "deleted" &&
                (e.publicPreview ||
                  isStaff ||
                  !e.spaceId ||
                  memberships.spaceIds.has(e.spaceId))
            )
            .filter(inSpaceScope),
          (e) => [e.title, e.description]
        ).slice(0, TYPE_LIMIT)
      : [],
    needle && includeCategory("spaces")
      ? rankResults(
          needle,
          (await fetchDocs("rooms")).filter(
            (r) =>
              r.status === "active" &&
              (r.publicPreview ||
                isStaff ||
                (r.spaceId && memberships.spaceIds.has(r.spaceId)) ||
                (r.groupId && memberships.groupIds.has(r.groupId)))
          ),
          (r) => r.name
        ).slice(0, TYPE_LIMIT)
      : [],
  ]);

  const prisma = getPrisma();

  return {
    posts,
    members: members.map((m) => ({
      id: m.id,
      name: m.name || "",
      role: m.role || "member",
      _score: m._score,
    })),
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      description: g.description || "",
      _score: g._score,
    })),
    spaces: await Promise.all(
      spaces.map(async (s) => {
        let memberCount = 0;
        if (prisma) {
          try {
            memberCount = await prisma.spaceMember.count({ where: { spaceId: s.id } });
          } catch (err) {
            logError("search.prisma_member_count_failed", { error: err.message, spaceId: s.id });
          }
        }
        return {
          id: s.id,
          name: s.name,
          slug: s.slug,
          description: s.description || "",
          memberCount,
          _score: s._score,
        };
      })
    ),
    courses: courses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description || "",
      _score: c._score,
    })),
    events: events
      .sort((a, b) => toMillis(b.startTime) - toMillis(a.startTime))
      .map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description || "",
        startTime: toMillis(e.startTime),
        _score: e._score,
      })),
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description || "",
      _score: r._score,
    })),
  };
}
