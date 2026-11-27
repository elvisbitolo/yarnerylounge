export const PENDING_BILLING_STATUS = "pending_client_action";

export function isPendingBillingRequest(entry) {
  const metadata = entry?.metadata;
  return (
    metadata !== null &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    metadata.billingStatus === PENDING_BILLING_STATUS
  );
}

export function selectPendingBillingRequests(entries) {
  return Array.isArray(entries) ? entries.filter(isPendingBillingRequest) : [];
}

export function billingFollowUpRows(entries) {
  return selectPendingBillingRequests(entries).map((entry) => {
    const metadata = entry.metadata;
    return {
      id: entry.id,
      action: entry.action || "",
      member: entry.actorName || entry.targetId || "—",
      memberId: entry.targetId || "",
      requestedAction: metadata.requestedAction || "",
      plan: metadata.plan || metadata.previousTier || "",
      previousTier: metadata.plan && metadata.previousTier ? metadata.previousTier : "",
      shopifyOrderId: metadata.shopifyOrderId || "",
      shopifyCustomerId: metadata.shopifyCustomerId || "",
      email: metadata.email || "",
      createdAt: entry.createdAt || null,
    };
  });
}
