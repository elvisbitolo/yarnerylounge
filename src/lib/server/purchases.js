import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { purchaseKey } from "@/lib/server/purchases-core";

export const PURCHASE_TYPES = ["course", "event", "space"];

export async function getPurchasedKeys(uid) {
  const keys = new Set();
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.purchase.findMany({ where: { uid } });
      rows.forEach((row) => {
        if (row.targetType && row.targetId) {
          keys.add(purchaseKey(row.targetType, row.targetId));
        }
      });
    } catch (err) {
      logError("purchases.prisma_keys_failed", { error: err.message });
    }
  }
  return keys;
}

export async function hasPurchased(uid, targetType, targetId) {
  const id = `${uid}_${targetType}_${targetId}`;
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.purchase.findUnique({ where: { id } });
      if (row) return true;
    } catch (err) {
      logError("purchases.prisma_has_failed", { error: err.message });
    }
  }
  return false;
}

export async function recordPurchase({ uid, targetType, targetId, sessionId, promoCode }) {
  const id = `${uid}_${targetType}_${targetId}`;
  const data = {
    uid,
    targetType,
    targetId,
    sessionId: sessionId || "",
    promoCode: promoCode || "",
    purchasedAt: new Date(),
  };
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.purchase.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    } catch (err) {
      logError("purchases.prisma_write_failed", { error: err.message });
    }
  }
}
