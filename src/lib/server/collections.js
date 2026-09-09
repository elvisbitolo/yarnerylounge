import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { getSpace } from "@/lib/server/spaces";

function toMillisValue(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return new Date(v).getTime();
}

export function normalizeSpaceIds(spaceIds) {
  if (!Array.isArray(spaceIds)) return [];
  const seen = new Set();
  return spaceIds
    .map((id) => String(id || "").trim())
    .filter((id) => id && !seen.has(id) && seen.add(id));
}

function mapCollectionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    spaceIds: row.spaceIds || [],
    createdBy: row.createdBy,
    createdAt: toMillisValue(row.createdAt) || null,
  };
}

export async function listCollections() {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.spaceCollection.findMany({
        orderBy: { createdAt: "asc" },
      });
      if (rows.length) return rows.map(mapCollectionRow);
    } catch (err) {
      logError("collections.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}

export async function createCollection({ name, description, spaceIds, createdBy }) {
  const title = String(name || "").trim();
  if (!title) {
    throw Object.assign(new Error("Collection name required"), { code: 400 });
  }
  const data = {
    name: title,
    description: description || "",
    spaceIds: normalizeSpaceIds(spaceIds),
    createdBy,
    createdAt: new Date(),
  };
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.spaceCollection.create({ data });
      return { id: created.id, name: created.name };
    } catch (err) {
      logError("collections.prisma_create_failed", { error: err.message });
    }
  }
  return null;
}

export async function updateCollection(id, { name, description, spaceIds }) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const existing = await prisma.spaceCollection.findUnique({ where: { id } });
      if (!existing) return null;
      const data = {};
      if (typeof name === "string" && name.trim()) data.name = name.trim();
      if (typeof description === "string") data.description = description;
      if (spaceIds !== undefined) data.spaceIds = normalizeSpaceIds(spaceIds);
      const updated = await prisma.spaceCollection.update({ where: { id }, data });
      return mapCollectionRow(updated);
    } catch (err) {
      logError("collections.prisma_update_failed", { error: err.message });
    }
  }
  return null;
}

export async function deleteCollection(id) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.spaceCollection.deleteMany({ where: { id } });
    } catch (err) {
      logError("collections.prisma_delete_failed", { error: err.message });
    }
  }
}

export async function getCollectionsWithSpaces() {
  const collections = await listCollections();
  return Promise.all(
    collections.map(async (collection) => {
      const spaces = [];
      for (const spaceId of collection.spaceIds || []) {
        const space = await getSpace(spaceId);
        if (space && space.status !== "deleted") {
          spaces.push({
            id: space.id,
            name: space.name,
            slug: space.slug,
            access: space.access || "public",
            requiredTier: space.requiredTier || "",
            purchasePriceCents: space.purchasePriceCents || 0,
            publicPreview: !!space.publicPreview,
          });
        }
      }
      return { ...collection, spaces };
    })
  );
}
