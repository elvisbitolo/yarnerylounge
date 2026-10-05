// Pure helpers for group sub-group (topic) creation.
//
// The shop page's Moving In tier promises to "launch independent circles and
// sub-groups", but /api/groups/[id]/topics only ever had a GET: every group was
// limited to the four hardcoded TOPIC_DEFS rows ("Future WIMPs", "Pattern
// help", ...) and members could not create their own. The schema already had
// GroupTopic; only the write path was missing.
//
// No I/O here, so it is unit-testable with node:test. See group-topics.js for
// the Prisma-backed storage layer.

export const TOPIC_NAME_MAX = 60;
export const TOPIC_DESC_MAX = 200;
export const TOPIC_EMOJI_MAX = 8;

// Conservative: lowercase alphanumerics and single dashes. GroupTopic.key is
// used in URLs and in a @@unique([groupId, key]) constraint, and is also the
// storage id segment for threads, so it must not contain separators.
export function slugifyTopicKey(name, fallback = "topic") {
  const base = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base || fallback;
}

// Suffix on collision so a second "Pattern help" becomes pattern-help-2 rather
// than violating the unique index and 500-ing.
export function uniqueTopicKey(name, takenKeys = []) {
  const taken = new Set((takenKeys || []).map((k) => String(k).toLowerCase()));
  const base = slugifyTopicKey(name);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`.slice(0, 40).replace(/-+$/g, "");
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// Strips control characters so a crafted name cannot corrupt logs or UI, and
// collapses runaway whitespace.
function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Returns { ok: true, value } or { ok: false, error }.
export function validateTopicDraft({ name, description = "", emoji = "" } = {}) {
  const cleanName = clean(name, TOPIC_NAME_MAX);
  if (cleanName.length < 2) {
    return { ok: false, error: "Give the sub-group a name of at least 2 characters" };
  }
  const cleanEmoji = clean(emoji, TOPIC_EMOJI_MAX);
  const cleanDesc = clean(description, TOPIC_DESC_MAX);
  return {
    ok: true,
    value: {
      name: cleanName,
      description: cleanDesc,
      emoji: cleanEmoji,
    },
  };
}

// Order for a new sub-group: after everything already there. `order` is only
// used for sorting, so a gap is harmless, but keeping it monotonic means new
// sub-groups land at the end of the list rather than jumping to the top.
export function nextTopicOrder(existing = []) {
  // Note: Number(null) and Number("") are both 0, so filter the raw values
  // before coercing — otherwise a topic with a null order reads as order 0 and
  // a genuinely empty list would produce 1 instead of 0.
  const orders = (existing || [])
    .map((t) => t?.order)
    .filter((v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)))
    .map(Number);
  if (!orders.length) return 0;
  return Math.max(...orders) + 1;
}