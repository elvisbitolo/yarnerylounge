// Pure state transitions for admin-edited public pages.
//
// The manifest lives in the existing private Storage bucket (see site-pages.js)
// and holds separate `published` and `draft` block arrays. Editing a draft must
// never touch `published`: this module is the only place that copies draft into
// published, and only publishSitePageState() does it.

import { fallbackBlocksFor, isPageSlug, normalizePageBlocks } from "../page-blocks.js";

export const SITE_PAGES_MANIFEST_VERSION = 1;

function cleanText(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isoOrNull(value) {
  if (!value) return null;
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

export function actorName(actor) {
  return cleanText(actor?.displayName || actor?.name || actor?.email || "");
}

export function emptySitePagesManifest() {
  return { version: SITE_PAGES_MANIFEST_VERSION, pages: {} };
}

/** Tolerate a missing, corrupt or old manifest without ever trusting raw blocks. */
export function parseSitePagesManifest(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return emptySitePagesManifest();
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptySitePagesManifest();

  const pages = {};
  for (const [slug, value] of Object.entries(parsed.pages || {})) {
    if (!isPageSlug(slug) || !value || typeof value !== "object" || Array.isArray(value)) continue;
    pages[slug] = {
      published: Array.isArray(value.published) ? normalizePageBlocks(value.published) : null,
      draft: Array.isArray(value.draft) ? normalizePageBlocks(value.draft) : null,
      updatedAt: isoOrNull(value.updatedAt),
      updatedBy: cleanText(value.updatedBy),
      publishedAt: isoOrNull(value.publishedAt),
      publishedBy: cleanText(value.publishedBy),
    };
  }
  return { version: SITE_PAGES_MANIFEST_VERSION, pages };
}

export function serializeSitePagesManifest(state) {
  const parsed = parseSitePagesManifest(state);
  return JSON.stringify(parsed, null, 2);
}

export function sitePageRecord(state, slug) {
  if (!isPageSlug(slug)) return null;
  const record = parseSitePagesManifest(state).pages[slug];
  return record || {
    published: null,
    draft: null,
    updatedAt: null,
    updatedBy: "",
    publishedAt: null,
    publishedBy: "",
  };
}

/** Save a new draft. The published blocks are copied through, never edited. */
export function saveDraftSitePageState(state, slug, rawBlocks, actor, now = new Date().toISOString()) {
  if (!isPageSlug(slug)) return { ok: false, status: 400, reason: "unknown-page" };
  const blocks = normalizePageBlocks(rawBlocks);
  if (!blocks.length) return { ok: false, status: 400, reason: "empty-page" };

  const base = parseSitePagesManifest(state);
  const current = sitePageRecord(base, slug);
  const next = {
    ...current,
    draft: blocks,
    updatedAt: isoOrNull(now) || new Date().toISOString(),
    updatedBy: actorName(actor),
  };
  return {
    ok: true,
    state: { ...base, pages: { ...base.pages, [slug]: next } },
  };
}

/** Publish the saved draft. A page with no draft cannot be published. */
export function publishSitePageState(state, slug, actor, now = new Date().toISOString()) {
  if (!isPageSlug(slug)) return { ok: false, status: 400, reason: "unknown-page" };
  const base = parseSitePagesManifest(state);
  const current = sitePageRecord(base, slug);
  if (!current.draft?.length) return { ok: false, status: 400, reason: "no-draft" };

  const next = {
    ...current,
    published: current.draft,
    publishedAt: isoOrNull(now) || new Date().toISOString(),
    publishedBy: actorName(actor),
  };
  return {
    ok: true,
    state: { ...base, pages: { ...base.pages, [slug]: next } },
  };
}

/** A draft that differs from what the public route currently renders. */
export function isDraftUnpublished(record) {
  if (!record?.draft?.length) return false;
  return JSON.stringify(record.draft) !== JSON.stringify(record.published || []);
}

/** Public pages read only this; drafts and corrupt rows can never leak. */
export function publishedBlocksFor(state, slug) {
  const record = sitePageRecord(state, slug);
  return record?.published?.length ? record.published : fallbackBlocksFor(slug);
}

/** Preview reads the draft, falling back to the live copy when none exists. */
export function draftBlocksFor(state, slug) {
  const record = sitePageRecord(state, slug);
  if (record?.draft?.length) return record.draft;
  return record?.published?.length ? record.published : fallbackBlocksFor(slug);
}
