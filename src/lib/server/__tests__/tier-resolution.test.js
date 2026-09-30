import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPABILITIES, canPublishRemote } from "../capabilities-core.js";
import { deriveMembership } from "../membership.js";
import { tierForRole, TIER_FOR_ROLE, tierLabel } from "../plans.js";

// Guards the invariant that broke once already: three modules answer "what tier
// is this member?" and they drifted. membership.js honoured owner/moderator
// while capabilities.js also honoured host, so a host member received Moving In
// entitlements with a "Flirting" label and no Diamond badge.
//
// The rule is now shared (tierForRole), and this test asserts the shared rule
// plus the entitlement matrix agree for every role/plan combination, so a
// future fourth copy of this logic fails here instead of in production.

const CAPS_BY_TIER = {
  free: CAPABILITIES.free,
  paid: CAPABILITIES.paid,
  host: CAPABILITIES.host,
};

// Mirrors the branch membership.js takes to turn a planKey into a caps object.
// Kept as a copy on purpose: if membership.js changes shape, this test should
// fail rather than silently follow along.
function capsForPlanKey(planKey) {
  return planKey === "moving-in" ? CAPS_BY_TIER.host : planKey === "hooking-up" ? CAPS_BY_TIER.paid : CAPS_BY_TIER.free;
}

test("tierForRole maps exactly the three top-tier roles", () => {
  assert.equal(tierForRole("owner"), "moving-in");
  assert.equal(tierForRole("moderator"), "moving-in");
  assert.equal(tierForRole("host"), "moving-in");
});

test("tierForRole ignores non-privileged and unknown roles", () => {
  for (const role of ["member", "co-host", "guest", "", null, undefined, "admin"]) {
    assert.equal(tierForRole(role), null, `expected null for ${JSON.stringify(role)}`);
  }
});

test("tierForRole is case and whitespace tolerant", () => {
  assert.equal(tierForRole("HOST"), "moving-in");
  assert.equal(tierForRole(" host "), "moving-in");
});

test("co-host is a per-room assignment role, not a global top tier", () => {
  // co-host rights are scoped to a single room via HostAssignment. Mapping it
  // here would hand a room-scoped helper global Moving In entitlements.
  assert.equal(TIER_FOR_ROLE["co-host"], undefined);
  assert.equal(tierForRole("co-host"), null);
});

test("every top-tier role carries the Diamond badge in the capability matrix", () => {
  for (const role of Object.keys(TIER_FOR_ROLE)) {
    assert.equal(CAPS_BY_TIER.host.profileBadge?.icon, "💎");
    assert.equal(capsForPlanKey(tierForRole(role)).profileBadge?.icon, "💎", `role ${role} lost its badge`);
  }
});

test("a plain member never gains a badge or host rights", () => {
  assert.equal(tierForRole("member"), null);
  assert.equal(CAPS_BY_TIER.free.profileBadge, null);
  assert.equal(CAPS_BY_TIER.free.hosting, false);
  assert.equal(capsForPlanKey("flirting").profileBadge, null);
});

test("the Flirting tier is view-only: joins, cannot publish, muted", () => {
  // The sales page sells video lounges as a paid perk, so the free tier must
  // not be able to unmute or go live. This is the paywall the app actually
  // enforces, via the Jitsi token's canPublish flag.
  assert.equal(CAPS_BY_TIER.free.video.canJoin, true);
  assert.equal(CAPS_BY_TIER.free.video.canPublish, false);
  assert.equal(CAPS_BY_TIER.free.video.muted, true);
  assert.equal(canPublishRemote(CAPS_BY_TIER.free), false);
});

test("both paid tiers may publish and neither is muted", () => {
  for (const caps of [CAPS_BY_TIER.paid, CAPS_BY_TIER.host]) {
    assert.equal(caps.video.canPublish, true);
    assert.equal(caps.video.muted, false);
    assert.equal(canPublishRemote(caps), true);
  }
});

test("hosting and neighbourhood building are Moving In only", () => {
  assert.equal(CAPS_BY_TIER.free.hosting, false);
  assert.equal(CAPS_BY_TIER.paid.hosting, false);
  assert.equal(CAPS_BY_TIER.host.hosting, true);
  assert.equal(CAPS_BY_TIER.paid.neighborhoods.build, false);
  assert.equal(CAPS_BY_TIER.host.neighborhoods.build, true);
  assert.equal(CAPS_BY_TIER.paid.neighborhoods.join, true);
  assert.equal(CAPS_BY_TIER.free.neighborhoods.join, false);
});

test("canPublishRemote fails closed when caps are missing or partial", () => {
  // Regression guard: this used to be `!== false`, which granted camera rights
  // to any caller whose caps failed to load.
  assert.equal(canPublishRemote(undefined), false);
  assert.equal(canPublishRemote(null), false);
  assert.equal(canPublishRemote({}), false);
  assert.equal(canPublishRemote({ video: {} }), false);
  assert.equal(canPublishRemote({ video: { canPublish: undefined } }), false);
  assert.equal(canPublishRemote({ video: { canPublish: "true" } }), false);
  assert.equal(canPublishRemote({ video: { canPublish: false } }), false);
  assert.equal(canPublishRemote({ video: { canPublish: true } }), true);
});

test("tier labels match the names sold on the shop page", () => {
  // Keep these in step with the Shopify tiers: Flirting / Hooking Up / Moving In.
  assert.equal(tierLabel("flirting"), "Flirting");
  assert.equal(tierLabel("hooking-up"), "Hooking Up");
  assert.equal(tierLabel("moving-in"), "Moving In");
});

test("the capability matrix stays aligned with the canonical tier list", () => {
  // CAPABILITIES is keyed free/paid/host, the shop is keyed flirting/hooking-up/
  // moving-in. If a tier is renamed, this fails instead of silently defaulting
  // members to the Flirting experience.
  const shopTiers = ["flirting", "hooking-up", "moving-in"];
  for (const [capsKey, caps] of Object.entries(CAPABILITIES)) {
    assert.ok(caps.key, `${capsKey} is missing a shop tier key`);
    assert.ok(shopTiers.includes(caps.key), `${capsKey} points at unknown tier ${caps.key}`);
    assert.equal(CAPS_BY_TIER[capsKey].key, caps.key);
  }
});

// ------------------------------------------- the bug this file was written for

// SHOPIFY_OPEN_ACCESS defaults to true (see access-policy.js), which short
// circuits deriveMembership to the top tier for everyone. These tests pin the
// env var so the plan/role branches are actually exercised, and assert the
// open-access behaviour separately.
function withOpenAccess(value, fn) {
  const prior = process.env.SHOPIFY_OPEN_ACCESS;
  if (value == null) delete process.env.SHOPIFY_OPEN_ACCESS;
  else process.env.SHOPIFY_OPEN_ACCESS = value;
  try {
    return fn();
  } finally {
    if (prior == null) delete process.env.SHOPIFY_OPEN_ACCESS;
    else process.env.SHOPIFY_OPEN_ACCESS = prior;
  }
}

test("a host role is Moving In, not Flirting, when the paywall is enforced", () => {
  // The regression. deriveMembership only honoured owner/moderator, so a
  // manually granted host was labelled Flirting and given no badge even though
  // capabilities.js granted it full Moving In entitlements.
  const m = withOpenAccess("false", () => deriveMembership({ role: "host", plan: "flirting" }));
  assert.equal(m.planKey, "moving-in");
  assert.equal(m.label, "Moving In");
  assert.equal(m.profileBadge?.icon, "💎");
  assert.equal(m.capabilities.hosting, true);
});

test("owner and moderator still resolve to Moving In", () => {
  for (const role of ["owner", "moderator"]) {
    const m = withOpenAccess("false", () => deriveMembership({ role, plan: "flirting" }));
    assert.equal(m.planKey, "moving-in", `role ${role} lost the top tier`);
    assert.equal(m.profileBadge?.icon, "💎", `role ${role} lost its badge`);
  }
});

test("a top-tier role overrides a stale free plan", () => {
  // The host's plan string is never updated by Shopify, so role must win.
  const m = withOpenAccess("false", () => deriveMembership({ role: "host", plan: "flirting" }));
  assert.equal(m.plan, "flirting", "the raw plan should still be reported for display");
  assert.equal(m.planKey, "moving-in");
});

test("an ordinary member on a free plan is Flirting and badgeless", () => {
  const m = withOpenAccess("false", () => deriveMembership({ role: "member", plan: "flirting" }));
  assert.equal(m.planKey, "flirting");
  assert.equal(m.label, "Flirting");
  assert.equal(m.profileBadge, null);
  assert.equal(m.capabilities.video.canPublish, false);
});

test("paid plans map to the right tier once the paywall is enforced", () => {
  const hooking = withOpenAccess("false", () => deriveMembership({ role: "member", plan: "hooking-up" }));
  assert.equal(hooking.planKey, "hooking-up");
  assert.equal(hooking.profileBadge?.icon, "👑");
  assert.equal(hooking.capabilities.hosting, false);

  const moving = withOpenAccess("false", () => deriveMembership({ role: "member", plan: "moving-in" }));
  assert.equal(moving.planKey, "moving-in");
  assert.equal(moving.profileBadge?.icon, "💎");
  assert.equal(moving.capabilities.hosting, true);
});

test("an expired paid plan falls back to Flirting", () => {
  const m = withOpenAccess("false", () =>
    deriveMembership({ role: "member", plan: "hooking-up", expiresAt: Date.now() - 1000 })
  );
  assert.equal(m.planKey, "flirting");
  assert.equal(m.profileBadge, null);
});

test("open access still admits every signed-in member at the top tier", () => {
  // Current production state: SHOPIFY_OPEN_ACCESS is unset, so this branch is
  // what every member resolves to today.
  const m = withOpenAccess(null, () => deriveMembership({ role: "member", plan: "flirting" }));
  assert.equal(m.planKey, "moving-in");
  assert.equal(m.profileBadge?.icon, "💎");
});

test("a null user doc does not throw", () => {
  const m = withOpenAccess("false", () => deriveMembership(null));
  assert.equal(m.planKey, "flirting");
  assert.equal(m.capabilities.video.canPublish, false);
});

test("every role and plan combination yields a label that exists on the shop page", () => {
  const roles = ["owner", "moderator", "host", "member", "co-host", null];
  const plans = ["flirting", "hooking-up", "moving-in", null];
  const shopNames = new Set(["Flirting", "Hooking Up", "Moving In"]);
  for (const openAccess of ["true", "false"]) {
    for (const role of roles) {
      for (const plan of plans) {
        const m = withOpenAccess(openAccess, () => deriveMembership({ role, plan }));
        assert.ok(shopNames.has(m.label), `unknown label ${m.label} for role=${role} plan=${plan}`);
        assert.equal(m.label, tierLabel(m.planKey), `label/planKey disagree for role=${role} plan=${plan}`);
      }
    }
  }
});
