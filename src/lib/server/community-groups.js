import { adminDb } from "@/lib/firebase/admin";

export const COMMUNITY_GROUPS = [
  {
    slug: "scrap-busters-brigade",
    name: "The Scrap-Busters Brigade",
    description: "Where leftover yarn tails, mini-skeins, and single balls become beautiful, functional masterpieces.",
    sidebarDescription: "Eco-friendly corner for transforming chaotic leftovers into crafting gold.",
    hangoutTag: "Happy Hour Hub",
    hangoutRoomSlug: "happy-hour-hub",
    color: "#f59e0b",
    emoji: "🎨",
    welcomePost: {
      title: "Welcome to the Brigade! Dump Your Scraps Below 👇",
      text: "🎨 You are officially a Scrap-Buster!\n\nBefore you dive in, introduce yourself to the feed with:\n• My Scrap Style: organized scrap-winder or a giant bag of mystery threads?\n• Current Scrap Project: magic-cake ball, scrappy market bag, or granny square?\n• My Go-To Join Method: magic knot, weaving as you go, or ignoring ends until the end?\n• Show Us the Stash: drop a photo of your scrap bin!",
    },
  },
  {
    slug: "amigurumi-arcade",
    name: "The Amigurumi Arcade",
    description: "The capital of cute — 3D plushies, stuffed animals, dolls, and miniature food in all their glory.",
    sidebarDescription: "High-visual world of plushies and 3D creatures that need a personality and a face.",
    hangoutTag: "Velvet Accent Den",
    hangoutRoomSlug: "velvet-accent-den",
    color: "#8b5cf6",
    emoji: "👾",
    welcomePost: {
      title: "Welcome to the Arcade! Meet the Plushies 🧸",
      text: "👾 Welcome to the Arcade, Maker!\n\nIntroduce yourself to the arcade feed:\n• My Specialty: tiny keychains, giant velvet plushies, or realistic animals?\n• Current Arcade WIP: what creature is on your hook?\n• The Hardest Part For Me: sewing limbs straight, stuffing evenly, or nose charts?\n• Plushie Tax: drop a photo of the cutest thing you've ever made!",
    },
  },
  {
    slug: "garment-glam-district",
    name: "The Garment Glam District",
    description: "Fashion-forward makers transitioning past blankets to create wearable art that fits your body type.",
    sidebarDescription: "Modern sweaters, cardigans, summer tops, and skirts that actually fit.",
    hangoutTag: "Silent Studio",
    hangoutRoomSlug: "silent-studio",
    color: "#ec4899",
    emoji: "👗",
    welcomePost: {
      title: "Welcome to the District! What's Your Style? 🧥",
      text: "👗 Welcome to the Garment Glam District!\n\nIntroduce yourself:\n• My Garment Goal: cozy winter cardigan, trendy summer mesh top, or tailored dress?\n• Current Wardrobe WIP: what piece are you working on?\n• My Biggest Fear: sleeve island, sizing, or the sweater stretching in the wash?\n• Show the Vibe: share your pattern choice or progress panels!",
    },
  },
  {
    slug: "caffeine-and-crochet-club",
    name: "The Caffeine & Crochet Club",
    description: "The global morning crowd — fresh hot beverage, quiet productive crafting, and sunrise energy.",
    sidebarDescription: "Morning-makers who never stitch alone. Own the AM calendar blocks.",
    hangoutTag: "Velvet Accent Den",
    hangoutRoomSlug: "velvet-accent-den",
    color: "#f97316",
    emoji: "☕",
    welcomePost: {
      title: "Grab a Mug! Welcome to the Morning Club ☕",
      text: "☀️ Good morning and welcome to Caffeine & Crochet!\n\nThe kettle is boiling and the hooks are ready. Introduce yourself:\n• My Location & Time Zone: where in the world are you waking up?\n• My Morning Beverage of Choice: black coffee, iced latte, herbal tea, or matcha?\n• My Wake-Up WIP: what easy project do you start your day with?\n• Mug Shot: post a photo of your favorite crafting mug!",
    },
  },
  {
    slug: "procrastinators-wip-jail",
    name: "The Procrastinator's WIP Jail",
    description: "The ultimate accountability ward for serial project-starters who need tough love to cross the finish line.",
    sidebarDescription: "Humor, tough love, and high-energy encouragement to get projects paroled.",
    hangoutTag: "Silent Studio",
    hangoutRoomSlug: "silent-studio",
    color: "#ef4444",
    emoji: "🔒",
    welcomePost: {
      title: "Mugshots inside WIP Jail! 🚨 Post Your Criminal Projects",
      text: "🚨 Halt! You've been processed into WIP Jail.\n\nBefore we can bail you out, confess your crimes:\n• The Inmate Name: what project are you avoiding?\n• Time Served: 3 weeks? 6 months? 2 years?\n• The Crime: ran out of yarn? lost the hook? got bored?\n• Post the Evidence: photo of your abandoned project in all its incomplete glory!",
    },
  },
  {
    slug: "blanket-guild",
    name: "The Blanket Guild",
    description: "The safe haven for long-distance stitchers facing those endless middle rows of a blanket.",
    sidebarDescription: "Color palettes, yardage advice, and the accountability to finish those throws.",
    hangoutTag: "Velvet Accent Den",
    hangoutRoomSlug: "velvet-accent-den",
    color: "#6366f1",
    emoji: "🧶",
    welcomePost: {
      title: "Welcome to the Guild! Show Us Your Blanket! 🚨",
      text: "🗺️ You've officially entered The Blanket Guild!\n\nIntroduce yourself with:\n• The Name of the Blanket: classic ripple, giant star, or mystery crochet-along?\n• The Recipient: cozy treat for yourself, baby gift, or holiday present?\n• The Status: what row or percentage are you stuck on?\n• Drop the Pic: attach your color palette or current progress!",
    },
  },
];

async function ensureGroup(spec, ownerUid) {
  const snap = await adminDb()
    .collection("groups")
    .where("slug", "==", spec.slug)
    .limit(1)
    .get();
  if (!snap.empty) {
    const doc = snap.docs[0];
    const data = doc.data();
    const patch = {
      sidebarDescription: spec.sidebarDescription,
      hangoutTag: spec.hangoutTag,
      hangoutRoomSlug: spec.hangoutRoomSlug,
      color: spec.color,
      emoji: spec.emoji,
    };
    if (data.description !== spec.description) patch.description = spec.description;
    if (data.name !== spec.name) patch.name = spec.name;
    await doc.ref.set(patch, { merge: true });
    return {
      ref: doc.ref,
      id: doc.id,
      welcomePostId: data.welcomePostId || "",
      welcomePostText: data.welcomePostText || "",
    };
  }
  const groupRef = adminDb().collection("groups").doc();
  const doc = {
    name: spec.name,
    slug: spec.slug,
    description: spec.description,
    sidebarDescription: spec.sidebarDescription,
    hangoutTag: spec.hangoutTag,
    hangoutRoomSlug: spec.hangoutRoomSlug,
    color: spec.color,
    emoji: spec.emoji,
    status: "active",
    createdBy: ownerUid || "system",
    createdAt: new Date(),
  };
  await groupRef.set(doc);
  return {
    ref: groupRef,
    id: groupRef.id,
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
      const postRef = adminDb().collection("posts").doc();
      await postRef.set({
        authorId: ownerUid || "system",
        authorName: "The Speakeasy Team",
        text: welcomeText,
        kind: "post",
        pinned: true,
        pinnedAt: new Date(),
        groupId: gen.id,
        spaceId: "",
        likes: 0,
        commentCount: 0,
        hashtags: [],
        mentions: [],
        createdAt: new Date(),
        lastActivityAt: new Date(),
      });
      await gen.ref.set({ welcomePostId: postRef.id, welcomePostText: welcomeText }, { merge: true });
      results.push({ slug: spec.slug, groupId: gen.id, welcomePostId: postRef.id });
    } else {
      results.push({ slug: spec.slug, groupId: gen.id, welcomePostId: gen.welcomePostId });
    }
  }
  return results;
}