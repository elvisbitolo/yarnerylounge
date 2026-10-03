import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPABILITIES, canPublishRemote, canJoinLounge } from "../capabilities-core.js";
import { deriveMembership } from "../membership.js";
import { isOpenAccess } from "../access-policy.js";
import { isOpenAccessRow, effectiveSubscription } from "../subscription-core.js";
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
    assert.equal(CAPS_BY_TIER.host.profileBadge?.icon, "gem");
    assert.equal(capsForPlanKey(tierForRole(role)).profileBadge?.icon, "gem", `role ${role} lost its badge`);
  }
});

test("a plain member never gains a badge or host rights", () => {
  assert.equal(tierForRole("member"), null);
  assert.equal(CAPS_BY_TIER.free.profileBadge?.icon, "sparkles");
  assert.equal(CAPS_BY_TIER.free.hosting, false);
  assert.equal(capsForPlanKey("flirting").profileBadge?.icon, "sparkles");
});

test("the Flirting tier is view-only: joins, cannot publish, muted", () => {
  // The sales page sells video lounges as a paid perk, so the free tier must
  // not be able to unmute or go live. This is the paywall the app actually
  // enforces, via the Jitsi token's canPublish flag.
  assert.equal(CAPS_BY_TIER.free.video.canPublish, false);
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
  assert.equal(m.profileBadge?.icon, "gem");
  assert.equal(m.capabilities.hosting, true);
});

test("owner and moderator still resolve to Moving In", () => {
  for (const role of ["owner", "moderator"]) {
    const m = withOpenAccess("false", () => deriveMembership({ role, plan: "flirting" }));
    assert.equal(m.planKey, "moving-in", `role ${role} lost the top tier`);
    assert.equal(m.profileBadge?.icon, "gem", `role ${role} lost its badge`);
  }
});

test("a top-tier role overrides a stale free plan", () => {
  // The host's plan string is never updated by Shopify, so role must win.
  const m = withOpenAccess("false", () => deriveMembership({ role: "host", plan: "flirting" }));
  assert.equal(m.plan, "flirting", "the raw plan should still be reported for display");
  assert.equal(m.planKey, "moving-in");
});

test("an ordinary member on a free plan is Flirting with the sparkles badge", () => {
  const m = withOpenAccess("false", () => deriveMembership({ role: "member", plan: "flirting" }));
  assert.equal(m.planKey, "flirting");
  assert.equal(m.label, "Flirting");
  assert.equal(m.profileBadge?.icon, "sparkles");
  assert.equal(m.capabilities.video.canPublish, false);
});

test("paid plans map to the right tier once the paywall is enforced", () => {
  const hooking = withOpenAccess("false", () => deriveMembership({ role: "member", plan: "hooking-up" }));
  assert.equal(hooking.planKey, "hooking-up");
  assert.equal(hooking.profileBadge?.icon, "crown");
  assert.equal(hooking.capabilities.hosting, false);

  const moving = withOpenAccess("false", () => deriveMembership({ role: "member", plan: "moving-in" }));
  assert.equal(moving.planKey, "moving-in");
  assert.equal(moving.profileBadge?.icon, "gem");
  assert.equal(moving.capabilities.hosting, true);
});

test("an expired paid plan falls back to Flirting", () => {
  const m = withOpenAccess("false", () =>
    deriveMembership({ role: "member", plan: "hooking-up", expiresAt: Date.now() - 1000 })
  );
  assert.equal(m.planKey, "flirting");
  assert.equal(m.profileBadge?.icon, "sparkles");
});

test("an unset access override means strict access, not open", () => {
  // This used to be open access, resolving every member to the top tier
  // regardless of plan. The default is now strict, so the plan decides.
  const m = withOpenAccess(null, () => deriveMembership({ role: "member", plan: "flirting" }));
  assert.equal(m.planKey, "flirting");
  assert.equal(m.profileBadge?.icon, "sparkles");
  assert.equal(canJoinLounge(m.capabilities), false);
});

test("the override still admits every signed-in member at the top tier", () => {
  // The emergency path, when explicitly switched on.
  const m = withOpenAccess("true", () => deriveMembership({ role: "member", plan: "flirting" }));
  assert.equal(m.planKey, "moving-in");
  assert.equal(m.profileBadge?.icon, "gem");
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

// ----------------------------------------------------- the closed paywall

test("open access is off unless explicitly turned on", () => {
  // Fails closed. This used to default to true, which resolved every member to
  // the top tier and showed an unpaid member the $179.50/yr tier and its badge.
  assert.equal(withOpenAccess(null, () => isOpenAccess()), false);
  assert.equal(withOpenAccess("", () => isOpenAccess()), false);
  assert.equal(withOpenAccess("false", () => isOpenAccess()), false);
  assert.equal(withOpenAccess("0", () => isOpenAccess()), false);
  assert.equal(withOpenAccess("nonsense", () => isOpenAccess()), false);
});

test("the emergency override still reopens the gate", () => {
  assert.equal(withOpenAccess("true", () => isOpenAccess()), true);
  assert.equal(withOpenAccess("1", () => isOpenAccess()), true);
  assert.equal(withOpenAccess("yes", () => isOpenAccess()), true);
});

test("Flirting cannot enter the video lounges at all", () => {
  // "Full access to the 24/7 Video Lounges" is sold as a Hooking Up perk, so the
  // free tier is refused entry rather than seated muted in a silent room.
  assert.equal(CAPS_BY_TIER.free.video.canJoin, false);
  assert.equal(canJoinLounge(CAPS_BY_TIER.free), false);
  assert.equal(canJoinLounge(undefined), false);
  assert.equal(canJoinLounge({}), false);
  assert.equal(canJoinLounge({ video: {} }), false);
});

test("both paid tiers may enter the lounges", () => {
  for (const caps of [CAPS_BY_TIER.paid, CAPS_BY_TIER.host]) {
    assert.equal(caps.video.canJoin, true);
    assert.equal(canJoinLounge(caps), true);
  }
});

test("every tier combination either may enter the lounge or may not", () => {
  // Ties the gate to the resolved membership, so a Flirting member is refused
  // the moment the paywall is enforced and admitted at every paid tier.
  const cases = [
    [{ role: "member", plan: "flirting" }, false],
    [{ role: "member", plan: "hooking-up" }, true],
    [{ role: "member", plan: "moving-in" }, true],
    [{ role: "host", plan: "flirting" }, true],
    [{ role: "owner", plan: "flirting" }, true],
    [{ role: "moderator", plan: "flirting" }, true],
  ];
  for (const [userDoc, expected] of cases) {
    const m = withOpenAccess("false", () => deriveMembership(userDoc));
    assert.equal(canJoinLounge(m.capabilities), expected, `role=${userDoc.role} plan=${userDoc.plan}`);
  }
});

test("an expired paid plan loses lounge access again", () => {
  const m = withOpenAccess("false", () =>
    deriveMembership({ role: "member", plan: "hooking-up", expiresAt: Date.now() - 1000 })
  );
  assert.equal(canJoinLounge(m.capabilities), false);
});

test("the emergency override still admits a free member to the lounges", () => {
  // Deliberate: the override ignores tiers entirely, which is the point of it.
  const m = withOpenAccess("true", () => deriveMembership({ role: "member", plan: "flirting" }));
  assert.equal(canJoinLounge(m.capabilities), true);
});

test("Flirting keeps the front-parlor perks that are not gated on video", () => {
  // The shop page promises Flirting a profile, the calendar, sharing creations
  // and browsing the feed. Only the lounges are withheld, so closing the paywall
  // must not turn a free member into a locked-out user entirely.
  const m = withOpenAccess("false", () => deriveMembership({ role: "member", plan: "flirting" }));
  assert.equal(m.capabilities.chat.read, true);
  assert.equal(m.capabilities.video.canJoin, false);
});

// ------------------------- the stale open-access grant (the tiers-not-applying bug)

test("a row written by the open-access override is recognised as such", () => {
  assert.equal(isOpenAccessRow({ provider: "open-access", tier: "moving-in" }), true);
  assert.equal(isOpenAccessRow({ provider: "shopify", tier: "moving-in", priceId: "gid://x" }), false);
  assert.equal(isOpenAccessRow({ provider: "stripe", tier: "premium" }), false);
  assert.equal(isOpenAccessRow({}), false);
  assert.equal(isOpenAccessRow(null), false);
  assert.equal(isOpenAccessRow(undefined), false);
});

test("a stale open-access row stops deciding access once the override is off", () => {
  // The bug. 28 members hold provider="open-access" / tier="moving-in" rows
  // written by the signup route while the override was on. Nothing invalidated
  // them when it was switched off, so every one of them kept the top tier and
  // the tiers never applied. The row must be discarded, not honoured.
  const stale = { provider: "open-access", status: "active", tier: "moving-in", plan: "moving-in" };
  assert.equal(effectiveSubscription(stale), null);
});

test("a real purchase still decides access", () => {
  // The guard must not demote anyone who actually paid: those rows carry a
  // priceId and a shopifyCustomerId and are passed through untouched.
  for (const paid of [
    { provider: "shopify", status: "active", tier: "moving-in", priceId: "gid://shopify/PriceVariant/1" },
    { provider: "shopify", status: "active", tier: "hooking-up", priceId: "gid://shopify/PriceVariant/2" },
    { provider: "stripe", status: "trialing", tier: "premium", priceId: "price_1" },
  ]) {
    assert.equal(effectiveSubscription(paid), paid, `a real purchase was dropped: ${paid.tier}`);
    assert.equal(isOpenAccessRow(paid), false);
  }
});

test("a missing row decides nothing", () => {
  assert.equal(effectiveSubscription(null), null);
  assert.equal(effectiveSubscription(undefined), null);
});

test("the 28 stale open-access members land on Flirting, not Moving In", () => {
  // End to end over the pure pieces: the stale row is discarded, so the tier
  // that reaches the membership layer is the free one and the lounge gate
  // closes. Before the fix this resolved to Moving In and admitted everyone.
  const stale = { provider: "open-access", status: "active", tier: "moving-in", plan: "moving-in" };
  const effective = effectiveSubscription(stale) || { tier: "flirting" };
  const m = withOpenAccess("false", () => deriveMembership({ role: "member", plan: effective.tier }));
  assert.equal(m.planKey, "flirting");
  assert.equal(m.profileBadge?.icon, "sparkles");
  assert.equal(canJoinLounge(m.capabilities), false);
});

test("the override still admits everyone while it is switched on", () => {
  // The escape hatch is unaffected: with the override on, the read path returns
  // the top tier from the env var before any stored row is consulted.
  const m = withOpenAccess("true", () => deriveMembership({ role: "member", plan: "flirting" }));
  assert.equal(m.planKey, "moving-in");
  assert.equal(canJoinLounge(m.capabilities), true);
});
