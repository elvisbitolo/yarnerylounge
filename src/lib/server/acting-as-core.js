// Pure grant rules for delegated-account access. No imports on purpose: this
// module is unit-tested with `node --test`, which cannot resolve the `@/`
// alias. The database side lives in acting-as.js.

export const GRANT_SCOPE_ACT = "act";

// Returns the grant that should apply to `granteeId`, or null.
//
// The two rejections that are not obvious:
//   * A self-grant is ignored. principalId === granteeId would make a member
//     their own principal, which is meaningless and hides a seeding mistake.
//   * `act` must be in scopes. The column is a list so narrower grants can be
//     added later; a grant without a recognised scope grants nothing, which
//     fails closed rather than treating an unknown scope as a wildcard.
export function pickActiveGrant(grants, granteeId) {
  if (!Array.isArray(grants) || !granteeId) return null;
  return (
    grants.find(
      (g) =>
        g &&
        !g.revokedAt &&
        g.granteeId === granteeId &&
        g.principalId &&
        g.principalId !== granteeId &&
        Array.isArray(g.scopes) &&
        g.scopes.includes(GRANT_SCOPE_ACT)
    ) || null
  );
}

// True when `principalId` is itself acting as somebody else's account.
//
// Delegation is deliberately not transitive. If it were, revoking the grant
// nearest the principal would not remove the delegate's access — a chain would
// have to be walked and unwound, and a cycle would hand someone owner rights
// permanently. Rejecting the chain at resolution time keeps a single revoked row
// sufficient to end it.
export function isActingAsSomebodyElse(grants, principalId) {
  if (!Array.isArray(grants) || !principalId) return false;
  return pickActiveGrant(grants, principalId) !== null;
}

// The identity the rest of the server should act as: the principal's, carrying
// the grantee alongside so the write path can record who was really there.
//
// `actorUid`/`actorEmail` are the audit hook. They are absent for an ordinary
// member, which is what makes `createdById IS NOT NULL` mean "delegated".
export function buildActingIdentity(identity, principal, grant) {
  if (!identity || !principal || !grant) return identity || null;
  return {
    ...principal,
    uid: principal.id,
    email: principal.email || "",
    // Carry the grantee's own verification flag: it describes the credential
    // that was actually presented, not the account being acted as.
    email_verified: identity.email_verified,
    name: principal.name || identity.name,
    photoURL: principal.photoURL || identity.photoURL,
    role: principal.role || "owner",
    actorUid: identity.uid,
    actorEmail: identity.email || "",
    grantId: grant.id,
  };
}

// The id to store in a content row's createdById, or null when nobody is acting
// on anyone's behalf. Null for ordinary members is what keeps the column
// meaningful: set means delegated, unset means the account acted for itself.
export function resolveActorId(identity) {
  const uid = identity?.actorUid;
  return typeof uid === "string" && uid ? uid : null;
}
