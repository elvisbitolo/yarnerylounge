import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  DEFAULT_CHECKLIST_STEPS,
  CHECKLIST_KEYS,
  normalizeChecklistSteps,
} from "@/lib/server/settings-core";

export { DEFAULT_CHECKLIST_STEPS, CHECKLIST_KEYS, normalizeChecklistSteps };

const SETTINGS_ID = "community";

export async function getSettings() {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.setting.findUnique({ where: { id: SETTINGS_ID } });
      if (row) {
        const data = row.welcomeChecklist;
        return { welcomeChecklist: normalizeChecklistSteps(data) };
      }
    } catch (err) {
      logError("settings.prisma_get_failed", { error: err.message });
    }
  }
  return { welcomeChecklist: DEFAULT_CHECKLIST_STEPS };
}

export async function updateSettings(patch = {}) {
  const data = {};
  if (patch.welcomeChecklist !== undefined) {
    data.welcomeChecklist = normalizeChecklistSteps(patch.welcomeChecklist);
  }
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.setting.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, welcomeChecklist: data.welcomeChecklist },
        update: { welcomeChecklist: data.welcomeChecklist },
      });
    } catch (err) {
      logError("settings.prisma_update_failed", { error: err.message });
    }
  }
}
