// Ordered content blocks for public/marketing pages.
//
// Dependency-free on purpose: the admin editor, the public renderer and the
// server validator all use the same shapes. Stored blocks are untrusted input,
// so normalization here is the allow list for both fields and link targets.

export const PAGE_BLOCK_TYPES = ["heading", "paragraph", "list", "image", "link"];
export const MAX_PAGE_BLOCKS = 80;
export const MAX_LIST_ITEMS = 30;

const LIMITS = {
  heading: 200,
  paragraph: 8000,
  list: 500,
  imageSrc: 600,
  imageAlt: 200,
  caption: 400,
  linkLabel: 200,
  linkText: 200,
  href: 600,
  id: 80,
};

function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanId(value, fallback) {
  return cleanText(value, LIMITS.id).replace(/[^a-zA-Z0-9_-]/g, "") || fallback;
}

/** Only relative paths and http(s) URLs may become links or image sources. */
export function safeBlockHref(value) {
  const href = cleanText(value, LIMITS.href);
  if (!href || /[\u0000-\u001f\\]/.test(href)) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return /^https?:\/\//i.test(href) ? href : "";
  return href.startsWith("/") && !href.startsWith("//") ? href : "";
}

/** Coerce one untrusted block into its canonical shape, or null if unusable. */
export function normalizePageBlock(raw, index = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const type = String(raw.type || "");
  const id = cleanId(raw.id, `block-${index}`);
  if (!PAGE_BLOCK_TYPES.includes(type)) return null;

  if (type === "heading") {
    const text = cleanText(raw.text, LIMITS.heading);
    if (!text) return null;
    return { id, type, text, level: Number(raw.level) === 1 ? 1 : 2 };
  }

  if (type === "paragraph") {
    const text = cleanText(raw.text, LIMITS.paragraph);
    if (!text) return null;
    return { id, type, text, lead: raw.lead === true };
  }

  if (type === "list") {
    const items = Array.isArray(raw.items)
      ? raw.items.map((item) => cleanText(item, LIMITS.list)).filter(Boolean).slice(0, MAX_LIST_ITEMS)
      : [];
    if (!items.length) return null;
    return { id, type, items };
  }

  if (type === "image") {
    const src = safeBlockHref(raw.src);
    if (!src) return null;
    return {
      id,
      type,
      src,
      alt: cleanText(raw.alt, LIMITS.imageAlt),
      caption: cleanText(raw.caption, LIMITS.caption),
    };
  }

  const label = cleanText(raw.label, LIMITS.linkLabel);
  const href = safeBlockHref(raw.href);
  if (!label || !href) return null;
  return { id, type, label, href, text: cleanText(raw.text, LIMITS.linkText) };
}

export function normalizePageBlocks(raw) {
  if (!Array.isArray(raw)) return [];
  const used = new Set();
  return raw
    .slice(0, MAX_PAGE_BLOCKS)
    .map((block, index) => {
      const normalized = normalizePageBlock(block, index);
      if (!normalized) return null;
      let id = normalized.id;
      let suffix = 2;
      while (used.has(id)) id = `${normalized.id}-${suffix++}`;
      used.add(id);
      return { ...normalized, id };
    })
    .filter(Boolean);
}

/** A blank block of `type`, ready for the editor to fill in. */
export function newPageBlock(type, id) {
  const safeType = PAGE_BLOCK_TYPES.includes(type) ? type : "paragraph";
  const blockId = cleanId(id, `block-${safeType}`);
  if (safeType === "heading") return { id: blockId, type: safeType, text: "", level: 2 };
  if (safeType === "list") return { id: blockId, type: safeType, items: [] };
  if (safeType === "image") return { id: blockId, type: safeType, src: "", alt: "", caption: "" };
  if (safeType === "link") return { id: blockId, type: safeType, label: "", href: "", text: "" };
  return { id: blockId, type: safeType, text: "", lead: false };
}

/** Deterministic unique id for a newly added editor block. */
export function nextBlockId(blocks) {
  const used = new Set((Array.isArray(blocks) ? blocks : []).map((block) => block?.id));
  let index = 1;
  while (used.has(`block-${index}`)) index += 1;
  return `block-${index}`;
}

/** Move a block by list index. Invalid moves return the input unchanged. */
export function movePageBlock(blocks, from, to) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (!Number.isInteger(from) || !Number.isInteger(to)) return list;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [block] = next.splice(from, 1);
  next.splice(to, 0, block);
  return next;
}

export function removePageBlock(blocks, id) {
  return (Array.isArray(blocks) ? blocks : []).filter((block) => block?.id !== id);
}

// The first page that uses blocks keeps its existing copy as the fallback, so a
// deployment with no stored manifest still renders exactly the same page. Only
// an explicit publish replaces these blocks on the public route.
export const PAGE_SLUGS = {
  about: {
    label: "About",
    path: "/about",
    fallback: [
      { id: "about-title", type: "heading", level: 1, text: "About Secret Yarnery" },
      {
        id: "about-lead",
        type: "paragraph",
        lead: true,
        text: "Secret Yarnery is a paid membership community where people connect live, learn together and build real relationships — not just feeds of posts.",
      },
      { id: "about-offer-heading", type: "heading", level: 2, text: "What you get" },
      {
        id: "about-offer-list",
        type: "list",
        items: [
          "Live lounges — real-time video lounges for conversations, coworking and broadcasts with your community.",
          "Courses — structured lessons, progress tracking and certificates of completion.",
          "Events — recurring meetups and one-off gatherings with RSVPs, calendar invites and reminders.",
          "Groups & spaces — interest-based spaces to organize discussions, share and go deeper on topics that matter to you.",
          "Conversation — direct messages, group chats, polls, hashtags and a leaderboard that celebrates engaged members.",
        ],
      },
      { id: "about-why-heading", type: "heading", level: 2, text: "Why membership?" },
      {
        id: "about-why-body",
        type: "paragraph",
        text: "Membership keeps the community focused and safe. By charging a fair price, Secret Yarnery stays free of ads and sponsored noise, and we can invest in moderators, high-quality content and reliable live infrastructure.",
      },
      { id: "about-commitments-heading", type: "heading", level: 2, text: "Our commitments" },
      {
        id: "about-commitments-list",
        type: "list",
        items: [
          "Your personal data stays private — never sold, never shared.",
          "Clear, respectful community guidelines, enforced consistently.",
          "You can cancel your membership anytime from your account.",
        ],
      },
      {
        id: "about-cta",
        type: "link",
        text: "Ready to join?",
        label: "Join the clubhouse",
        href: "/signup",
      },
    ],
  },
};

export const PAGE_SLUG_LIST = Object.keys(PAGE_SLUGS);

export function isPageSlug(slug) {
  return Object.hasOwn(PAGE_SLUGS, slug);
}

export function fallbackBlocksFor(slug) {
  return isPageSlug(slug) ? normalizePageBlocks(PAGE_SLUGS[slug].fallback) : [];
}
