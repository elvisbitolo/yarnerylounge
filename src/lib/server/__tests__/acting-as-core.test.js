import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildActingIdentity,
  isActingAsSomebodyElse,
  pickActiveGrant,
  resolveActorId,
} from "../acting-as-core.js";

const PRINCIPAL = "principal-1";
const GRANTEE = "grantee-1";

function grant(overrides = {}) {
  return {
    id: "grant-1",
    principalId: PRINCIPAL,
    granteeId: GRANTEE,
    scopes: ["act"],
    revokedAt: null,
    ...overrides,
  };
}

function principalRow(overrides = {}) {
  return {
    id: PRINCIPAL,
    name: "Secret Yarnery",
    email: "secretyarnery@gmail.com",
    photoURL: "/brand/secret.webp",
    role: "owner",
    ...overrides,
  };
}

function identity(overrides = {}) {
  return {
    uid: GRANTEE,
    email: "teamtsy254@gmail.com",
    email_verified: true,
    name: "Team TSY",
    photoURL: "/avatar.png",
    role: "member",
    ...overrides,
  };
}

// --- pickActiveGrant ------------------------------------------------------

test("an active grant applies", () => {
  assert.equal(pickActiveGrant([grant()], GRANTEE)?.id, "grant-1");
});

test("no grant means no delegation", () => {
  assert.equal(pickActiveGrant([], GRANTEE), null);
  assert.equal(pickActiveGrant(undefined, GRANTEE), null);
  assert.equal(pickActiveGrant(null, GRANTEE), null);
});

test("a revoked grant does not apply", () => {
  const revoked = grant({ revokedAt: new Date("2026-01-01T00:00:00Z") });
  assert.equal(pickActiveGrant([revoked], GRANTEE), null);
});

test("a grant for somebody else does not apply", () => {
  assert.equal(pickActiveGrant([grant()], "someone-else"), null);
});

test("a self-grant is ignored", () => {
  // principalId === granteeId would make a member their own principal, which is
  // meaningless and would mask a seeding mistake.
  const self = grant({ principalId: GRANTEE, granteeId: GRANTEE });
  assert.equal(pickActiveGrant([self], GRANTEE), null);
});

test("a grant without the act scope grants nothing", () => {
  // Fails closed: an unrecognised scope must not be treated as a wildcard.
  assert.equal(pickActiveGrant([grant({ scopes: [] })], GRANTEE), null);
  assert.equal(pickActiveGrant([grant({ scopes: ["read"] })], GRANTEE), null);
  assert.equal(pickActiveGrant([grant({ scopes: null })], GRANTEE), null);
});

test("act is accepted alongside other scopes", () => {
  const g = grant({ scopes: ["read", "act"] });
  assert.equal(pickActiveGrant([g], GRANTEE)?.id, "grant-1");
});

test("a revoked grant earlier in the list does not shadow a live one", () => {
  const rows = [grant({ id: "old", revokedAt: new Date() }), grant({ id: "live" })];
  assert.equal(pickActiveGrant(rows, GRANTEE)?.id, "live");
});

test("malformed rows are skipped rather than throwing", () => {
  const rows = [null, undefined, { id: "x" }, grant()];
  assert.equal(pickActiveGrant(rows, GRANTEE)?.id, "grant-1");
  assert.doesNotThrow(() => pickActiveGrant([{}], GRANTEE));
});

test("a missing grantee id is not delegated", () => {
  assert.equal(pickActiveGrant([grant()], ""), null);
  assert.equal(pickActiveGrant([grant()], null), null);
});

// --- transitivity ---------------------------------------------------------

test("isActingAsSomebodyElse detects a principal that is itself a delegate", () => {
  const chained = grant({ granteeId: PRINCIPAL, principalId: "boss" });
  assert.equal(isActingAsSomebodyElse([chained], PRINCIPAL), true);
});

test("a real principal is not itself a delegate", () => {
  // The normal case: the brand owner holds a grant but is nobody's delegate.
  assert.equal(isActingAsSomebodyElse([grant()], PRINCIPAL), false);
  assert.equal(isActingAsSomebodyElse([], PRINCIPAL), false);
});

test("a revoked upstream grant does not make the principal a delegate", () => {
  const upstream = grant({
    granteeId: PRINCIPAL,
    principalId: "boss",
    revokedAt: new Date(),
  });
  assert.equal(isActingAsSomebodyElse([upstream], PRINCIPAL), false);
});

// --- buildActingIdentity --------------------------------------------------

test("the acting identity is the principal's, in every field that renders", () => {
  const acting = buildActingIdentity(identity(), principalRow(), grant());
  assert.equal(acting.uid, PRINCIPAL);
  assert.equal(acting.name, "Secret Yarnery");
  assert.equal(acting.email, "secretyarnery@gmail.com");
  assert.equal(acting.role, "owner");
});

test("the grantee is retained on the acting identity for the audit trail", () => {
  const acting = buildActingIdentity(identity(), principalRow(), grant());
  assert.equal(acting.actorUid, GRANTEE);
  assert.equal(acting.actorEmail, "teamtsy254@gmail.com");
  assert.equal(acting.grantId, "grant-1");
});

test("an ordinary member's identity has no actor, which is what keeps createdById null", () => {
  const plain = identity();
  assert.equal(plain.actorUid, undefined);
  assert.equal(resolveActorId(plain), null);
});

test("the principal's own verification flag is not inherited from the account", () => {
  // email_verified describes the credential that was presented, not the account
  // being acted as, so it stays the grantee's.
  const acting = buildActingIdentity(
    identity({ email_verified: false }),
    principalRow(),
    grant()
  );
  assert.equal(acting.email_verified, false);
});

test("missing principal fields fall back without throwing", () => {
  const sparse = principalRow({ name: "", email: null, photoURL: null, role: null });
  const acting = buildActingIdentity(identity(), sparse, grant());
  assert.equal(acting.email, "");
  assert.equal(acting.name, "Team TSY");
  assert.equal(acting.photoURL, "/avatar.png");
  assert.equal(acting.role, "owner");
});

test("buildActingIdentity is total: missing input never swaps the identity", () => {
  // A missing principal or grant must return the member's own identity, so a
  // half-read grant cannot escalate anyone. Returning null here would lock a
  // member out of their own account.
  assert.equal(buildActingIdentity(null, principalRow(), grant()), null);
  const id = identity();
  assert.equal(buildActingIdentity(id, null, grant()), id);
  assert.equal(buildActingIdentity(id, principalRow(), null), id);
});

// --- resolveActorId -------------------------------------------------------

test("resolveActorId returns the grantee only while delegated", () => {
  const acting = buildActingIdentity(identity(), principalRow(), grant());
  assert.equal(resolveActorId(acting), GRANTEE);
  assert.equal(resolveActorId(identity()), null);
  assert.equal(resolveActorId(null), null);
  assert.equal(resolveActorId({}), null);
  assert.equal(resolveActorId({ actorUid: "" }), null);
});

// --- the property the whole design rests on -------------------------------

test("a delegated session is indistinguishable from the principal in every rendered field", () => {
  // This is the requirement: nothing a member sees should reveal the grantee.
  const acting = buildActingIdentity(identity(), principalRow(), grant());
  const principal = principalRow();
  assert.equal(acting.uid, principal.id);
  assert.equal(acting.name, principal.name);
  assert.equal(acting.email, principal.email);
  assert.equal(acting.role, principal.role);
  assert.equal(acting.photoURL, principal.photoURL);
  // Nothing derived from the grantee may leak into a rendered field.
  const rendered = JSON.stringify({
    uid: acting.uid,
    name: acting.name,
    email: acting.email,
    role: acting.role,
    photoURL: acting.photoURL,
  });
  assert.doesNotMatch(rendered, /Team TSY/);
  assert.doesNotMatch(rendered, /teamtsy254/);
  // ...while the audit fields are the only ones that differ.
  assert.equal(acting.actorUid, GRANTEE);
  assert.equal(acting.actorEmail, "teamtsy254@gmail.com");
});
