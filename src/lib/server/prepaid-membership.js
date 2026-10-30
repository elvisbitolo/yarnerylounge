// Creates a Supabase-UID account and atomically claims any Shopify prepaid
// placeholder. Kept separate so the transaction can be exercised with an isolated
// Prisma-compatible test double without touching production data.
export async function provisionNewMember({
  prisma,
  identity,
  memberName,
  prepaidEmail,
  openAccess,
  openAccessPlan,
}) {
  return prisma.$transaction(async (tx) => {
      const racedMember = await tx.user.findUnique({
        where: { id: identity.uid },
      });
      if (racedMember) return { member: racedMember, created: false };

      const prepaid = prepaidEmail
        ? await tx.user.findFirst({
            where: { email: prepaidEmail, isPrePaid: true },
            include: { subscription: true },
          })
        : null;

      // Anyone may create a free Flirting account. A paid Shopify
      // placeholder, when present, is claimed below and keeps its paid
      // membership; otherwise the new account starts on Flirting.

      const createdMember = await tx.user.create({
        data: {
          id: identity.uid,
          name: memberName || prepaid?.name || "Member",
          email: identity.email || prepaid?.email || null,
          photoURL: identity.photoURL || prepaid?.photoURL || null,
          role: prepaid?.role || "member",
          plan: prepaid?.plan || (openAccess ? openAccessPlan : "flirting"),
          paymentStatus: prepaid?.paymentStatus || (openAccess ? "paid" : "unpaid"),
          isPrePaid: false,
          shopifyCustomerId: prepaid?.shopifyCustomerId || null,
          shopifyOrderId: prepaid?.shopifyOrderId || null,
          expiresAt: prepaid?.expiresAt || null,
          createdAt: new Date(),
        },
      });

      // Older or manually-created prepaid records may already have a
      // subscription row. Re-key it to the authenticated UID before
      // removing the email placeholder.
      if (prepaid?.subscription) {
        const oldSub = prepaid.subscription;
        await tx.subscription.upsert({
          where: { id: identity.uid },
          create: {
            id: identity.uid,
            userId: identity.uid,
            provider: oldSub.provider,
            status: oldSub.status,
            plan: oldSub.plan,
            planName: oldSub.planName,
            tier: oldSub.tier,
            role: oldSub.role,
            shopifyCustomerId: oldSub.shopifyCustomerId,
            shopifyOrderId: oldSub.shopifyOrderId,
            providerCustomerId: oldSub.providerCustomerId,
            providerSubscriptionId: oldSub.providerSubscriptionId,
            priceId: oldSub.priceId,
            currentPeriodStart: oldSub.currentPeriodStart,
            currentPeriodEnd: oldSub.currentPeriodEnd,
            trialStart: oldSub.trialStart,
            trialEnd: oldSub.trialEnd,
            cancelAtPeriodEnd: oldSub.cancelAtPeriodEnd,
            canceledAt: oldSub.canceledAt,
          },
          update: {
            userId: identity.uid,
            provider: oldSub.provider,
            status: oldSub.status,
            plan: oldSub.plan,
            planName: oldSub.planName,
            tier: oldSub.tier,
            role: oldSub.role,
            shopifyCustomerId: oldSub.shopifyCustomerId,
            shopifyOrderId: oldSub.shopifyOrderId,
            providerCustomerId: oldSub.providerCustomerId,
            providerSubscriptionId: oldSub.providerSubscriptionId,
            priceId: oldSub.priceId,
            currentPeriodStart: oldSub.currentPeriodStart,
            currentPeriodEnd: oldSub.currentPeriodEnd,
            trialStart: oldSub.trialStart,
            trialEnd: oldSub.trialEnd,
            cancelAtPeriodEnd: oldSub.cancelAtPeriodEnd,
            canceledAt: oldSub.canceledAt,
          },
        });
        await tx.subscription.delete({ where: { id: prepaid.id } });
      } else if (prepaid) {
        // Backfill a subscription row for older prepaid placeholders that
        // predate the transactional Shopify subscription write. Without
        // this row, the normal access resolver would fall back to Flirting
        // even though the paid User record had been transferred.
        const tier = prepaid.plan || "flirting";
        await tx.subscription.upsert({
          where: { id: identity.uid },
          create: {
            id: identity.uid,
            userId: identity.uid,
            provider: "shopify",
            status: "active",
            plan: "monthly",
            planName: tier,
            tier,
            role: prepaid.role || "member",
            shopifyCustomerId: prepaid.shopifyCustomerId || "",
            shopifyOrderId: prepaid.shopifyOrderId || "",
            ...(prepaid.expiresAt ? { currentPeriodEnd: prepaid.expiresAt } : {}),
            updatedAt: new Date(),
          },
          update: {
            userId: identity.uid,
            provider: "shopify",
            status: "active",
            planName: tier,
            tier,
            role: prepaid.role || "member",
            shopifyCustomerId: prepaid.shopifyCustomerId || "",
            shopifyOrderId: prepaid.shopifyOrderId || "",
            ...(prepaid.expiresAt ? { currentPeriodEnd: prepaid.expiresAt } : {}),
            updatedAt: new Date(),
          },
        });
      }

      if (prepaid) {
        await tx.user.delete({ where: { id: prepaid.id } });
      }

      if (openAccess && !prepaid?.subscription) {
        await tx.subscription.upsert({
          where: { id: identity.uid },
          create: {
            id: identity.uid,
            userId: identity.uid,
            provider: "open-access",
            status: "active",
            plan: openAccessPlan,
            planName: openAccessPlan,
            tier: openAccessPlan,
            role: "member",
            updatedAt: new Date(),
          },
          update: {
            provider: "open-access",
            status: "active",
            plan: openAccessPlan,
            planName: openAccessPlan,
            tier: openAccessPlan,
            role: "member",
            updatedAt: new Date(),
          },
        });
      }

      return { member: createdMember, created: true };
  });
}
