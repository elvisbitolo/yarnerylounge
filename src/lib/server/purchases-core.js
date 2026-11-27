export function purchaseKey(targetType, targetId) {
  return `${targetType}:${targetId}`;
}

export function isPurchasable(item) {
  return Number(item?.purchasePriceCents) > 0;
}

export function canAccessPaid(targetType, item, purchasedKeys) {
  if (!isPurchasable(item)) return true;
  if (!item.id) return false;
  return typeof purchasedKeys?.has === "function" && purchasedKeys.has(purchaseKey(targetType, item.id));
}

export function verifyPurchaseAmount(paidCents, expectedCents) {
  const expected = Number(expectedCents);
  const paid = Number(paidCents);
  if (!Number.isFinite(expected) || !Number.isFinite(paid)) {
    return { ok: false, reason: `Invalid amount paid=${paidCents} expected=${expectedCents}` };
  }
  if (expected <= 0) {
    return { ok: false, reason: "Item is not purchasable" };
  }
  if (paid !== expected) {
    return { ok: false, reason: `Amount mismatch: paid ${paid}, expected ${expected}` };
  }
  return { ok: true, reason: "" };
}
