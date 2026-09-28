// Database side of delegated-account resolution. The rules live in
// acting-as-core.js so they can be unit-tested without a database.
//
// A grantee signs in with their own credentials and gets their own Session row,
// so authentication, password reset and revocation are all honestly theirs.
// While a grant is active they resolve to the *principal's* identity instead —
// same uid, name, role and email — so everything downstream treats them as the
// principal with no per-endpoint special-casing.
//
// Two things follow from doing the swap here rather than at the session write:
//
//   * Revoking a grant takes effect on the next request. No sessions to hunt.
//   * Session.userId stays the real member, so "which sessions were the
//     delegate's?" is a plain equality filter on a column that already exists.

import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  buildActingIdentity,
  isActingAsSomebodyElse,
  pickActiveGrant,
} from "@/lib/server/acting-as-core";

const GRANT_SELECT = {
  id: true,
  principalId: true,
  granteeId: true,
  scopes: true,
  revokedAt: true,
};

const PRINCIPAL_SELECT = {
  id: true,
  name: true,
  email: true,
  photoURL: true,
  role: true,
};

async function isPrincipalAlsoADelegate(principalId) {
  const prisma = getPrisma();
  if (!prisma) return false;
  try {
    const chain = await prisma.accountGrant.findMany({
      where: { granteeId: principalId, revokedAt: null },
      select: GRANT_SELECT,
    });
    return isActingAsSomebodyElse(chain, principalId);
  } catch (err) {
    logError("acting_as.chain_check_failed", { error: err.message });
    // Fail closed. If we cannot prove the principal is a real account rather
    // than another delegate's alias, treat it as a chain and grant nothing.
    return true;
  }
}

// Swaps `identity` for the principal's account when an active grant applies.
// Returns the identity untouched when there is no grant, or when any part of
// the lookup fails — a grant that cannot be read must not silently escalate
// anyone, and it must not lock a member out of their own account either.
export async function resolveActingIdentity(identity) {
  if (!identity?.uid) return identity;
  const prisma = getPrisma();
  if (!prisma) return identity;

  let grants;
  try {
    grants = await prisma.accountGrant.findMany({
      where: { granteeId: identity.uid, revokedAt: null },
      select: { ...GRANT_SELECT, principal: { select: PRINCIPAL_SELECT } },
    });
  } catch (err) {
    logError("acting_as.grant_read_failed", { error: err.message });
    return identity;
  }

  const grant = pickActiveGrant(grants, identity.uid);
  if (!grant || !grant.principal) return identity;

  if (await isPrincipalAlsoADelegate(grant.principalId)) {
    logError("acting_as.chained_grant_rejected", {
      granteeId: identity.uid,
      principalId: grant.principalId,
    });
    return identity;
  }

  return buildActingIdentity(identity, grant.principal, grant);
}

// Whether a member may read a principal's account record. Kept next to the
// resolution logic so the two cannot drift: anything that exposes a principal's
// details has to ask the same question that decides who acts as them.
export async function canReadPrincipal(identity, principalId) {
  if (!identity?.uid || !principalId) return false;
  if (identity.uid === principalId) return true;
  if (identity.actorUid && identity.grantId) return true;
  const prisma = getPrisma();
  if (!prisma) return false;
  try {
    const grant = await prisma.accountGrant.findFirst({
      where: { granteeId: identity.uid, principalId, revokedAt: null },
      select: GRANT_SELECT,
    });
    return pickActiveGrant([grant].filter(Boolean), identity.uid) !== null;
  } catch (err) {
    logError("acting_as.read_check_failed", { error: err.message });
    return false;
  }
}
