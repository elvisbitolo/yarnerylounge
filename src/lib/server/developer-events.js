import { getPrisma } from "@/lib/db/prisma";

// Persist only operational metadata. Never pass credentials, payment details,
// request bodies, IP addresses, or raw provider payloads to this helper.
export async function recordDeveloperEvent({
  actorId,
  actorName,
  action,
  targetId = null,
  severity = "error",
  category = "system",
  summary = "",
  metadata = {},
}) {
  if (!actorId || !action) return false;
  try {
    const prisma = getPrisma();
    if (!prisma) return false;
    const safeMetadata = {
      severity: ["critical", "error", "warning", "info"].includes(severity) ? severity : "error",
      category: String(category).slice(0, 40),
      summary: String(summary).slice(0, 240),
      ...metadata,
    };
    await prisma.auditLog.create({
      data: {
        actorId: String(actorId).slice(0, 120),
        actorName: String(actorName || "Member").slice(0, 100),
        action: String(action).slice(0, 120),
        targetId: targetId ? String(targetId).slice(0, 120) : null,
        metadata: safeMetadata,
      },
    });
    return true;
  } catch {
    // Diagnostics must never break the operation being diagnosed.
    return false;
  }
}
