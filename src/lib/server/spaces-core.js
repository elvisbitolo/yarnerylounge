export const SPACE_FEATURES = ["feed", "chat", "members", "events", "courses", "live", "pages"];

export const SPACE_FEATURE_LABELS = {
  feed: "Feed",
  chat: "Chat",
  members: "Members",
  events: "Events",
  courses: "Courses",
  live: "Live lounges",
  pages: "Pages",
};

export const SPACE_ACCESS = ["public", "private", "invite"];

export const SPACE_ACCESS_LABELS = {
  public: "Public",
  private: "Private",
  invite: "Invite only",
};

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function normalizeFeatures(features = {}) {
  const out = {};
  for (const feature of SPACE_FEATURES) {
    out[feature] = !!features[feature];
  }
  return out;
}

export function normalizeAccess(access) {
  return SPACE_ACCESS.includes(access) ? access : "public";
}
