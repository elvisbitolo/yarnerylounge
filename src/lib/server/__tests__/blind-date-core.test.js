import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayKeyFor,
  hashingKey,
  seededPick,
  profilePieces,
  tierWeight,
  computeScore,
  memberTimezone,
  utcOffsetHours,
  timezoneProximity,
} from "../blind-date-core.js";

test("dayKeyFor: formats an ISO UTC date (YYYY-MM-DD)", () => {
  assert.equal(dayKeyFor(Date.parse("2026-09-07T15:30:00Z")), "2026-09-07");
  assert.equal(dayKeyFor(Date.parse("2026-01-05T23:59:59Z")), "2026-01-05");
});

test("hashingKey: composes uid and date", () => {
  assert.equal(hashingKey("abc", "2026-09-07"), "abc:2026-09-07");
  assert.equal(hashingKey("abc"), "abc:");
});

test("seededPick: is deterministic per user+day", () => {
  const candidates = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const first = seededPick(candidates, "u1", "2026-09-07");
  const second = seededPick(candidates, "u1", "2026-09-07");
  assert.equal(second.id, first.id);
  // Different day picks from the same candidates.
  const nextDay = seededPick(candidates, "u1", "2026-09-08");
  assert.equal(typeof nextDay.id, "string");
  assert.ok(candidates.some((c) => c.id === nextDay.id));
});

test("seededPick: returns null for empty candidates", () => {
  assert.equal(seededPick([], "u1", "2026-09-07"), null);
  assert.equal(seededPick(null, "u1", "2026-09-07"), null);
});

test("computeScore: same country adds 4 points (weighted by host tier)", () => {
  const me = { country: "US", hobbies: [], crafts: [], favoriteColors: [] };
  const member = { country: "US", hobbies: [], crafts: [], favoriteColors: [], role: "member" };
  assert.equal(computeScore(me, member), 4);
  const host = { ...member, role: "host" };
  assert.equal(computeScore(me, host), 4 * 1.3);
});

test("computeScore: hobby overlap weights shared crafts/hobbies/colors", () => {
  const me = {
    country: "",
    hobbies: ["crochet"],
    crafts: ["granny squares"],
    favoriteColors: ["teal"],
  };
  const member = {
    country: "",
    hobbies: ["crochet", "knitting"],
    crafts: ["granny squares"],
    favoriteColors: ["teal"],
    role: "member",
  };
  // 4 shared text words (crochet, granny, squares, teal) + 1 shared hobby *3
  // + 1 shared craft *2 + 1 shared color *2 = 11
  assert.equal(computeScore(me, member), 11);
});

test("computeScore: profile text overlap raises the score", () => {
  const base = { country: "", hobbies: [], crafts: [], favoriteColors: [] };
  const me = { ...base, headline: "amigurumi monster maker" };
  const member = { ...base, headline: "amigurumi patterns", bio: "maker" };
  assert.ok(computeScore(me, member) > 0);
  assert.equal(computeScore(me, base), 0);
});

test("tierWeight: hosts weigh more than ordinary members", () => {
  assert.equal(tierWeight({ role: "host" }), 1.3);
  assert.equal(tierWeight({ role: "moderator" }), 1.2);
  assert.equal(tierWeight({ role: "member" }), 1);
});

test("profilePieces: joins the searchable fields, lowercased", () => {
  const pieces = profilePieces({
    headline: "Slow Hooker",
    bio: "Loves granny squares",
    hobbies: ["Crochet", "Tea"],
    crafts: ["Blankets"],
    country: "CA",
    favoriteColors: ["Teal"],
  });
  assert.ok(pieces.includes("slow hooker"));
  assert.ok(pieces.includes("crochet tea"));
  assert.ok(pieces.includes("blankets"));
  assert.ok(pieces.includes("ca"));
});

// --- timezone proximity -----------------------------------------------------
// Reference instant pinned to a date where DST is in effect in the northern
// hemisphere, so offset arithmetic is deterministic regardless of when the
// suite runs.
const WHEN = Date.UTC(2026, 5, 15, 12, 0, 0); // 2026-06-15T12:00:00Z

test("memberTimezone reads extra.timezone first, then the column", () => {
  assert.equal(memberTimezone({ extra: { timezone: "Africa/Nairobi" } }), "Africa/Nairobi");
  assert.equal(memberTimezone({ timezone: "Europe/London" }), "Europe/London");
  assert.equal(
    memberTimezone({ timezone: "Europe/London", extra: { timezone: "Africa/Nairobi" } }),
    "Africa/Nairobi"
  );
  assert.equal(memberTimezone({}), "");
  assert.equal(memberTimezone(null), "");
  assert.equal(memberTimezone({ extra: "not-an-object" }), "");
});

test("utcOffsetHours returns real offsets and survives DST", () => {
  // June: London is on BST (+1), Nairobi is +3 year-round.
  assert.equal(utcOffsetHours("Europe/London", WHEN), 1);
  assert.equal(utcOffsetHours("Africa/Nairobi", WHEN), 3);
  assert.equal(utcOffsetHours("America/New_York", WHEN), -4);
  // January: London is on GMT (+0).
  assert.equal(utcOffsetHours("Europe/London", Date.UTC(2026, 0, 15, 12)), 0);
});

test("utcOffsetHours returns null for an unknown zone instead of throwing", () => {
  assert.equal(utcOffsetHours("Not/AZone"), null);
  assert.equal(utcOffsetHours(""), null);
  assert.equal(utcOffsetHours(undefined), null);
});

test("timezoneProximity is 1 for the identical zone", () => {
  assert.equal(timezoneProximity({ extra: { timezone: "Africa/Nairobi" } }, { extra: { timezone: "Africa/Nairobi" } }, WHEN), 1);
});

test("timezoneProximity is case-insensitive for the zone name", () => {
  assert.equal(timezoneProximity({ extra: { timezone: "europe/london" } }, { extra: { timezone: "Europe/London" } }, WHEN), 1);
});

test("timezoneProximity buckets by hours apart", () => {
  const tz = (z) => ({ extra: { timezone: z } });
  // London +1 vs Nairobi +3 = 2h apart
  assert.equal(timezoneProximity(tz("Europe/London"), tz("Africa/Nairobi"), WHEN), 0.5);
  // London +1 vs New York -4 = 5h apart
  assert.equal(timezoneProximity(tz("Europe/London"), tz("America/New_York"), WHEN), 0.25);
  // London +1 vs Los Angeles -7 = 8h apart
  assert.equal(timezoneProximity(tz("Europe/London"), tz("America/Los_Angeles"), WHEN), 0.1);
});

test("timezoneProximity is 0 when either side has no usable timezone", () => {
  const tz = (z) => ({ extra: { timezone: z } });
  assert.equal(timezoneProximity(tz("Europe/London"), {}, WHEN), 0);
  assert.equal(timezoneProximity({}, tz("Europe/London"), WHEN), 0);
  assert.equal(timezoneProximity(tz("Europe/London"), tz("Bad/Zone"), WHEN), 0);
});

test("computeScore gives timezone credit across different countries", () => {
  const me = { country: "Kenya", extra: { timezone: "Africa/Nairobi" } };
  const near = { country: "Germany", extra: { timezone: "Europe/Berlin" } }; // +3 vs +2
  const far = { country: "United States", extra: { timezone: "America/Los_Angeles" } };
  assert.ok(computeScore(me, near) > computeScore(me, far));
  assert.ok(computeScore(me, near) > 0);
  // Berlin is CEST (+2) in June, Nairobi +3: 1h apart -> 0.75 * 3 = 2.25
  assert.equal(computeScore(me, near), 2.25);
});

test("computeScore adds no timezone credit when neither side has one", () => {
  const me = { country: "Kenya" };
  const member = { country: "Kenya" };
  // 5, not 4: profilePieces() folds `country` into the searchable bio text, so
  // "kenya" is also a shared word (+1) on top of sameCountry * 4. That quirk
  // predates timezone scoring; the point of this test is that adding timezone
  // support contributed nothing here.
  assert.equal(computeScore(me, member), 5);
});

test("computeScore is unaffected by a timezone only one side can resolve", () => {
  const withBadZone = { country: "Kenya", extra: { timezone: "Not/AZone" } };
  const noZone = { country: "Kenya" };
  assert.equal(computeScore(noZone, withBadZone), 5);
  assert.equal(computeScore(withBadZone, noZone), 5);
});
