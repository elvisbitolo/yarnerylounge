import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { logAudit } from "@/lib/server/audit";
import { EDITABLE_FIELDS, sanitizePatch } from "./admin-content-core.js";
import { CANONICAL_ALWAYS_ON_SLUGS } from "../room-config.js";

export { EDITABLE_FIELDS, sanitizePatch, isEditableKind } from "./admin-content-core.js";

export async function updateContent(kind, id, body, actor) {
  const spec = EDITABLE_FIELDS[kind];
  const { data, errors } = sanitizePatch(kind, body);
  if (errors.length) {
    return { ok: false, status: 400, error: errors[0] };
  }

  const prisma = getPrisma();
  if (!prisma) return { ok: false, status: 503, error: "Database unavailable" };

  try {
    const delegate = prisma[spec.model];
    const existing = await delegate.findUnique({ where: { id } });
    if (!existing) return { ok: false, status: 404, error: `${spec.label} not found` };

    // Always-on is owned by the seeder, not by the content editor; otherwise a
    // moderator could turn any lounge into a scope-free public room. Signature
    // lounges keep their canonical names so links and presets stay aligned.
    if (kind === "room") {
      delete data.alwaysOn;
      if (CANONICAL_ALWAYS_ON_SLUGS.has(existing.slug)) delete data.name;
    }

    const updated = await delegate.update({ where: { id }, data });

    const changed = Object.keys(data).filter((k) => String(existing[k] ?? "") !== String(data[k]));
    if (changed.length) {
      await logAudit({
        actorId: actor?.uid || "",
        actorName: actor?.displayName || actor?.email || "",
        action: `${kind}.content_updated`,
        targetId: id,
        metadata: { fields: changed },
      });
    }
    return { ok: true, updated, changed };
  } catch (err) {
    logError("adminContent.update_failed", { kind, error: err.message });
    return { ok: false, status: 500, error: `Could not update ${spec.label.toLowerCase()}` };
  }
}