import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

// Canonical neighbourhood presentation order, matching the website:
// The Blanket Guild -> The Procrastinator's WIP Jail ->
// The Caffeine & Crochet Club -> The Garment Glam District.
export const NEIGHBOURHOOD_ORDER = [
  "blanket-guild",
  "procrastinators-wip-jail",
  "caffeine-and-crochet-club",
  "garment-glam-district",
];

export const NEIGHBOURHOOD_IMAGES = {
  "blanket-guild": "/images/neighbourhoods/blanket-guild.jpg",
  "procrastinators-wip-jail": "/images/neighbourhoods/procrastinators-wip-jail.jpg",
  "caffeine-and-crochet-club": "/images/neighbourhoods/caffeine-and-crochet-club.jpg",
  "garment-glam-district": "/images/neighbourhoods/garment-glam-district.jpg",
};

export const COMMUNITY_GROUPS = [
  {
    slug: "blanket-guild",
    name: "The Blanket Guild",
    description: "Survive those grueling middle rows of giant throws together.",
    sidebarDescription: "Color palettes, yardage advice, and the accountability to finish those throws.",
    hangoutTag: "Velvet Den",
    hangoutRoomSlug: "velvet-den",
    color: "#6366f1",
    emoji: "\u{1F9F6}",
    imageUrl: "/images/neighbourhoods/blanket-guild.jpg",
    welcomePost: {
      title: "Welcome to the Guild! Show Us Your Blanket! \u{1F6A8}",
      text: "\u{1F5FA}\uFE0F You\u2019ve officially entered The Blanket Guild!\n\nIntroduce yourself with:\n\u2022 The Name of the Blanket: classic ripple, giant star, or mystery crochet-along?\n\u2022 The Recipient: cozy treat for yourself, baby gift, or holiday present?\n\u2022 The Status: what row or percentage are you stuck on?\n\u2022 Drop the Pic: attach your color palette or current progress!",
    },
  },
  {
    slug: "procrastinators-wip-jail",
    name: "The Procrastinator\u2019s WIP Jail",
    description: "Get the funny tough-love you need to finish abandoned projects.",
    sidebarDescription: "Humor, tough love, and high-energy encouragement to get projects paroled.",
    hangoutTag: "Silent Studio",
    hangoutRoomSlug: "silent-studio",
    color: "#ef4444",
    emoji: "\u{1F512}",
    imageUrl: "/images/neighbourhoods/procrastinators-wip-jail.jpg",
    welcomePost: {
      title: "Mugshots inside WIP Jail! \u{1F6A8} Post Your Criminal Projects",
      text: "\u{1F6A8} Halt! You\u2019ve been processed into WIP Jail.\n\nBefore we can bail you out, confess your crimes:\n\u2022 The Inmate Name: what project are you avoiding?\n\u2022 Time Served: 3 weeks? 6 months? 2 years?\n\u2022 The Crime: ran out of yarn? lost the hook? got bored?\n\u2022 Post the Evidence: photo of your abandoned project in all its incomplete glory!",
    },
  },
  {
    slug: "caffeine-and-crochet-club",
    name: "The Caffeine & Crochet Club",
    description: "The ultimate global station for morning coffee stitchers.",
    sidebarDescription: "Morning-makers who never stitch alone. Own the AM calendar blocks.",
    hangoutTag: "Velvet Den",
    hangoutRoomSlug: "velvet-den",
    color: "#f97316",
    emoji: "\u2615",
    imageUrl: "/images/neighbourhoods/caffeine-and-crochet-club.jpg",
    welcomePost: {
      title: "Grab a Mug! Welcome to the Morning Club \u2615",
      text: "\u2600\uFE0F Good morning and welcome to Caffeine & Crochet!\n\nThe kettle is boiling and the hooks are ready. Introduce yourself:\n\u2022 My Location & Time Zone: where in the world are you waking up?\n\u2022 My Morning Beverage of Choice: black coffee, iced latte, herbal tea, or matcha?\n\u2022 My Wake-Up WIP: what easy project do you start your day with?\n\u2022 Mug Shot: post a photo of your favorite crafting mug!",
    },
  },
  {
    slug: "garment-glam-district",
    name: "The Garment Glam District",
    description: "Build a handmade wardrobe that actually fits your body type.",
    sidebarDescription: "Modern sweaters, cardigans, summer tops, and skirts that actually fit.",
    hangoutTag: "Silent Studio",
    hangoutRoomSlug: "silent-studio",
    color: "#ec4899",
    emoji: "\u{1F457}",
    imageUrl: "/images/neighbourhoods/garment-glam-district.jpg",
    welcomePost: {
      title: "Welcome to the District! What\u2019s Your Style? \u{1F9E5}",
      text: "\u{1F457} Welcome to the Garment Glam District!\n\nIntroduce yourself:\n\u2022 My Garment Goal: cozy winter cardigan, trendy summer mesh top, or tailored dress?\n\u2022 Current Wardrobe WIP: what piece are you working on?\n\u2022 My Biggest Fear: sleeve island, sizing, or the sweater stretching in the wash?\n\u2022 Show the Vibe: share your pattern choice or progress panels!",
    },
  },
];

async function ensureGroup(spec, ownerUid) {
  const prisma = getPrisma();
  if (!prisma) {
    return {
      ref: null,
      id: "",
      welcomePostId: "",
      welcomePostText: "",
    };
  }
  try {
    const existing = await prisma.group.findUnique({ where: { slug: spec.slug } });
    if (existing) {
      await prisma.group.update({
        where: { id: existing.id },
        data: {
          name: spec.name,
          description: spec.description,
          sidebarDescription: spec.sidebarDescription,
          hangoutTag: spec.hangoutTag,
          hangoutRoomSlug: spec.hangoutRoomSlug,
          color: spec.color,
          emoji: spec.emoji,
          imageUrl: spec.imageUrl || existing.imageUrl || null,
        },
      });
      return {
        ref: { id: existing.id, set: (data) => prisma.group.update({ where: { id: existing.id }, data }) },
        id: existing.id,
        welcomePostId: existing.welcomePostId || "",
        welcomePostText: existing.welcomePostText || "",
      };
    }
    const created = await prisma.group.create({
      data: {
        name: spec.name,
        slug: spec.slug,
        description: spec.description,
        sidebarDescription: spec.sidebarDescription,
        hangoutTag: spec.hangoutTag,
        hangoutRoomSlug: spec.hangoutRoomSlug,
        color: spec.color,
        emoji: spec.emoji,
        imageUrl: spec.imageUrl || null,
        status: "active",
        createdBy: ownerUid || "system",
        createdAt: new Date(),
      },
    });
    return {
      ref: { id: created.id, set: (data) => prisma.group.update({ where: { id: created.id }, data }) },
      id: created.id,
      welcomePostId: "",
      welcomePostText: "",
    };
  } catch (err) {
    logError("community-groups.prisma_ensure_failed", { error: err.message });
  }
  return {
    ref: null,
    id: "",
    welcomePostId: "",
    welcomePostText: "",
  };
}

function formatWelcomePost(spec) {
  return `${spec.welcomePost.title}\n\n${spec.welcomePost.text}`;
}

export async function seedCommunityGroups(ownerUid) {
  const results = [];
  for (const spec of COMMUNITY_GROUPS) {
    const gen = await ensureGroup(spec, ownerUid);
    if (!gen.welcomePostId && !gen.welcomePostText) {
      const welcomeText = formatWelcomePost(spec);
      const prisma = getPrisma();
      if (prisma && gen.id) {
        try {
          const createdPost = await prisma.post.create({
            data: {
              authorId: ownerUid || "system",
              authorName: "The Speakeasy Team",
              text: welcomeText,
              kind: "post",
              pinned: true,
              pinnedAt: new Date(),
              groupId: gen.id,
              spaceId: "",
              likes: {},
              commentCount: 0,
              hashtags: [],
              createdAt: new Date(),
              lastActivityAt: new Date(),
            },
          });
          await prisma.group.update({
            where: { id: gen.id },
            data: { welcomePostId: createdPost.id, welcomePostText: welcomeText },
          });
          results.push({ slug: spec.slug, groupId: gen.id, welcomePostId: createdPost.id });
          continue;
        } catch (err) {
          logError("community-groups.prisma_welcome_post_failed", { error: err.message });
        }
      }
      results.push({ slug: spec.slug, groupId: gen.id, welcomePostId: "" });
    } else {
      results.push({ slug: spec.slug, groupId: gen.id, welcomePostId: gen.welcomePostId });
    }
  }
  return results;
}

// Ensures the four canonical neighbourhood records exist without creating
// welcome posts. This is safe to call from the member-facing directory: the
// first visitor supplies a valid creator FK, while the owner-only seed route
// remains responsible for welcome content and topics.
export async function ensureCommunityGroups(ownerUid) {
  const results = [];
  for (const spec of COMMUNITY_GROUPS) {
    const group = await ensureGroup(spec, ownerUid);
    results.push({ slug: spec.slug, groupId: group.id });
  }
  return results;
}
