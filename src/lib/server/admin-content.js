import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { logAudit } from "@/lib/server/audit";
import { EDITABLE_FIELDS, sanitizePatch } from "./admin-content-core.js";

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