import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  normalizeFeatures,
} from "@/lib/server/spaces-core";

export const PAGE_VISIBILITIES = ["all", "members"];

function toMillisValue(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return new Date(v).getTime();
}

function mapPageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || "",
    slug: row.slug || "",
    content: row.content || "",
    spaceId: row.spaceId || "",
    position: Number(row.position) || 0,
    visibility: PAGE_VISIBILITIES.includes(row.visibility) ? row.visibility : "all",
    createdBy: row.createdBy || "",
    createdAt: toMillisValue(row.createdAt) || null,
    updatedAt: toMillisValue(row.updatedAt) || null,
  };
}

export async function createPage({ title, slug, content, spaceId, position, visibility, createdBy }) {
  const now = new Date();
  const pageData = {
    title,
    slug,
    content,
    spaceId,
    position: Number(position) || 0,
    visibility: PAGE_VISIBILITIES.includes(visibility) ? visibility : "all",
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.spacePage.create({ data: pageData });

      const spaceRow = await prisma.space.findUnique({ where: { id: spaceId } });
      if (spaceRow) {
        const features = spaceRow.features || {};
        if (!features.pages) {
          await prisma.space.update({
            where: { id: spaceId },
            data: { features: normalizeFeatures({ ...features, pages: true }) },
          });
        }
      }

      return { id: created.id, title, slug, spaceId };
    } catch (err) {
      logError("pages.prisma_create_failed", { error: err.message });
    }
  }
  return { id: "", title, slug, spaceId };
}

export async function listPages(spaceId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.spacePage.findMany({
        where: { spaceId },
        orderBy: { position: "asc" },
      });
      return rows.map(mapPageRow).sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
    } catch (err) {
      logError("pages.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}

export async function getPage(pageId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.spacePage.findUnique({ where: { id: pageId } });
      return row ? mapPageRow(row) : null;
    } catch (err) {
      logError("pages.prisma_get_failed", { error: err.message });
    }
  }
  return null;
}

export async function getPageBySlug(spaceId, slug) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.spacePage.findUnique({ where: { spaceId_slug: { spaceId, slug } } });
      return row ? mapPageRow(row) : null;
    } catch (err) {
      logError("pages.prisma_get_by_slug_failed", { error: err.message });
    }
  }
  return null;
}

export async function updatePage(pageId, { title, slug, content, position, visibility } = {}) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const existing = await prisma.spacePage.findUnique({ where: { id: pageId } });
      if (!existing) return null;
      const data = {};
      if (title !== undefined) data.title = title;
      if (slug !== undefined) data.slug = slug;
      if (content !== undefined) data.content = content;
      if (position !== undefined) data.position = Number(position) || 0;
      if (visibility !== undefined) {
        data.visibility = PAGE_VISIBILITIES.includes(visibility) ? visibility : "all";
      }
      data.updatedAt = new Date();
      const updated = await prisma.spacePage.update({ where: { id: pageId }, data });
      return { id: pageId, ...existing, ...updated, ...data };
    } catch (err) {
      logError("pages.prisma_update_failed", { error: err.message });
    }
  }
  return null;
}

export async function deletePage(pageId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.spacePage.delete({ where: { id: pageId } });
      return;
    } catch (err) {
      logError("pages.prisma_delete_failed", { error: err.message });
    }
  }
}

export async function reorderPages(spaceId, pageIds) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.$transaction(
        pageIds.map((pageId, index) =>
          prisma.spacePage.update({
            where: { id: pageId },
            data: { position: index, updatedAt: new Date() },
          })
        )
      );
      return { ok: true };
    } catch (err) {
      logError("pages.prisma_reorder_failed", { error: err.message });
    }
  }
  return { ok: true };
}
