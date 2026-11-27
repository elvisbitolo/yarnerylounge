// Storage + persistence for admin-edited public pages.
//
// Reuses the existing private `recordings` bucket and its JSON manifest pattern
// (the Studio catalogue lives there too), so no schema or new bucket is needed.
// Every write goes through the pure transitions in site-pages-core.js: drafts
// are saved separately and only the explicit publish action changes what the
// public route renders.

import { supabaseAdmin } from "@/lib/supabase/service";
import { logError } from "@/lib/server/log";
import { logAudit } from "@/lib/server/audit";
import { ensureRecordingsBucket } from "@/lib/server/recordings";
import { PAGE_SLUGS, isPageSlug } from "@/lib/page-blocks";
import {
  draftBlocksFor,
  emptySitePagesManifest,
  isDraftUnpublished,
  parseSitePagesManifest,
  publishedBlocksFor,
  publishSitePageState,
  saveDraftSitePageState,
  serializeSitePagesManifest,
  sitePageRecord,
} from "./site-pages-core";

const MANIFEST_PATH = "site-pages/manifest.json";

function missingObjectError(error) {
  return /not.?found|does not exist|no such file/i.test(error?.message || "");
}

async function readManifest() {
  const { data, error } = await supabaseAdmin.storage.from("recordings").download(MANIFEST_PATH);
  if (error) {
    if (missingObjectError(error)) return emptySitePagesManifest();
    logError("sitePages.manifest_read_failed", { message: error?.message });
    throw new Error("Could not read saved pages");
  }
  let text = "";
  try {
    text = await data.text();
  } catch (readError) {
    logError("sitePages.manifest_body_failed", { message: readError?.message });
    throw new Error("Could not read saved pages");
  }
  return parseSitePagesManifest(text);
}

async function writeManifest(state) {
  if (!(await ensureRecordingsBucket())) {
    return { ok: false, status: 503, error: "Storage is unavailable right now" };
  }
  const bytes = new TextEncoder().encode(serializeSitePagesManifest(state));
  const { error } = await supabaseAdmin.storage
    .from("recordings")
    .upload(MANIFEST_PATH, bytes, { contentType: "application/json", upsert: true });
  if (error) {
    logError("sitePages.manifest_write_failed", { message: error?.message });
    return { ok: false, status: 502, error: "Could not save the page" };
  }
  return { ok: true };
}

export { isPageSlug };

async function pageSummary(state, slug) {
  const record = sitePageRecord(state, slug);
  const spec = PAGE_SLUGS[slug];
  return {
    slug,
    label: spec.label,
    path: spec.path,
    blocks: draftBlocksFor(state, slug),
    hasDraft: Boolean(record?.draft),
    hasPublished: Boolean(record?.published),
    unpublished: isDraftUnpublished(record),
    updatedAt: record?.updatedAt || null,
    updatedBy: record?.updatedBy || "",
    publishedAt: record?.publishedAt || null,
    publishedBy: record?.publishedBy || "",
  };
}

export async function getAdminPage(slug) {
  if (!isPageSlug(slug)) return { ok: false, status: 404, error: "Unknown page" };
  const state = await readManifest();
  return { ok: true, page: await pageSummary(state, slug) };
}

export async function savePageDraft({ slug, blocks, actor } = {}) {
  if (!isPageSlug(slug)) return { ok: false, status: 404, error: "Unknown page" };
  const result = saveDraftSitePageState(await readManifest(), slug, blocks, actor);
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.reason === "empty-page" ? "Add at least one block" : "Unknown page" };
  }
  const saved = await writeManifest(result.state);
  if (!saved.ok) return saved;
  await logAudit({
    actorId: actor?.uid || "",
    actorName: actor?.displayName || actor?.name || actor?.email || "",
    action: `${slug}.page_draft_saved`,
    targetId: slug,
  });
  return { ok: true, page: await pageSummary(result.state, slug) };
}

export async function publishPage({ slug, actor } = {}) {
  if (!isPageSlug(slug)) return { ok: false, status: 404, error: "Unknown page" };
  const result = publishSitePageState(await readManifest(), slug, actor);
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.reason === "no-draft" ? "Save a draft before publishing" : "Unknown page" };
  }
  const saved = await writeManifest(result.state);
  if (!saved.ok) return saved;
  await logAudit({
    actorId: actor?.uid || "",
    actorName: actor?.displayName || actor?.name || actor?.email || "",
    action: `${slug}.page_published`,
    targetId: slug,
  });
  return { ok: true, page: await pageSummary(result.state, slug) };
}

export async function getPublicPageBlocks(slug) {
  if (!isPageSlug(slug)) return [];
  try {
    return publishedBlocksFor(await readManifest(), slug);
  } catch {
    return [];
  }
}

export async function getPreviewPageBlocks(slug) {
  if (!isPageSlug(slug)) return [];
  try {
    return draftBlocksFor(await readManifest(), slug);
  } catch {
    return [];
  }
}
