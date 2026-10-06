import { test } from "node:test";
import assert from "node:assert/strict";
import { needsTosConsent, TOS_CONSENT_SINCE, TOS_VERSION } from "../tos.js";
import { mapUserRow } from "../server/user-core.js";

// An account created the moment this runs, with no acceptance recorded: the
// one case the whole gate exists for.
test("a brand-new account must accept the Terms of Service", () => {
  const doc = { id: "u1", createdAt: Date.now(), tosAcceptedAt: 0 };
  assert.equal(needsTosConsent(doc), true);
});

test("a recorded acceptance releases the gate", () => {
  const doc = { id: "u1", createdAt: Date.now(), tosAcceptedAt: Date.now() };
  assert.equal(needsTosConsent(doc), false);
});

// The grandfather clause. Every account that predates the consent screen was
// created before TOS_CONSENT_SINCE and must keep working even if the migration
// back-fill never ran against it — locking the existing member base out of
// their own accounts is the failure mode this second signal exists to prevent.
test("accounts created before the regime are grandfathered without a recorded acceptance", () => {
  const doc = { id: "old", createdAt: TOS_CONSENT_SINCE - 1, tosAcceptedAt: 0 };
  assert.equal(needsTosConsent(doc), false);
});

test("the grandfather cutoff applies on either side of the boundary", () => {
  assert.equal(
    needsTosConsent({ createdAt: TOS_CONSENT_SINCE - 1, tosAcceptedAt: 0 }),
    false,
    "one millisecond before the cutoff is grandfathered"
  );
  assert.equal(
    needsTosConsent({ createdAt: TOS_CONSENT_SINCE, tosAcceptedAt: 0 }),
    true,
    "created exactly at the cutoff is treated as new"
  );
});

// getUserDoc() returns null when Prisma is unreachable. Failing open here is
// deliberate: consent is a compliance checkbox, not an access-control system,
// and a database blip must never lock everybody out of the app.
test("fails open when there is no user doc", () => {
  assert.equal(needsTosConsent(null), false);
  assert.equal(needsTosConsent(undefined), false);
});

// mapUserRow() emits epoch millis, and needsTosConsent() reads that shape —
// the two must agree, otherwise a persisted acceptance would read as absent
// and re-prompt every member on every page load.
test("the mapped Prisma row satisfies needsTosConsent", () => {
  const accepted = mapUserRow({
    id: "u1",
    createdAt: new Date(),
    tosAcceptedAt: new Date("2026-10-07T00:00:00.000Z"),
    tosVersion: TOS_VERSION,
  });
  assert.equal(accepted.tosAcceptedAt > 0, true);
  assert.equal(accepted.tosVersion, TOS_VERSION);
  assert.equal(needsTosConsent(accepted), false);

  const pending = mapUserRow({
    id: "u2",
    createdAt: new Date(TOS_CONSENT_SINCE + 60_000),
    tosAcceptedAt: null,
    tosVersion: null,
  });
  assert.equal(pending.tosAcceptedAt, 0);
  assert.equal(pending.tosVersion, "");
  assert.equal(needsTosConsent(pending), true);
});

// The version string is what the consent POST echoes back and what the column
// stores, so changing it silently would re-collect consent for nobody and
// leave old acceptances indistinguishable from new ones.
test("the ToS version is a stable, non-empty marker", () => {
  assert.equal(typeof TOS_VERSION, "string");
  assert.match(TOS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test("the grandfather cutoff is a real instant in the past-to-near future", () => {
  assert.equal(Number.isFinite(TOS_CONSENT_SINCE), true);
  assert.ok(TOS_CONSENT_SINCE > Date.UTC(2020, 0, 1));
  assert.ok(TOS_CONSENT_SINCE < Date.UTC(2030, 0, 1));
});
