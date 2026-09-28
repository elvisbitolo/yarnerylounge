import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEMBER_TABS,
  NEWEST_WINDOW_DAYS,
  TOP_LIMIT,
  applyMemberTab,
  emptyViewMessage,
  matchesMemberTab,
} from "../../members/tabs-core.js";

const NOW = Date.parse("2026-09-28T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const TODAY = "2026-09-28";

function member(over = {}) {
  return {
    id: "u",
    name: "Member",
    role: "member",
    live: false,
    points: 0,
    createdAt: NOW - 400 * DAY,
    lastVisitDate: "",
    ...over,
  };
}

const names = (r) => r.list.map((m) => m.name);

// --- the regression -------------------------------------------------------
// "Newest" and "Top" used to re-sort the whole pool. The directory renders a
// scatter with no cap, so both drew every member and read as "All".

test("newest narrows to recent joiners instead of showing everyone", () => {
  const pool = [
    member({ name: "Ancient", createdAt: NOW - 400 * DAY }),
    member({ name: "RecentA", createdAt: NOW - 2 * DAY }),
    member({ name: "RecentB", createdAt: NOW - 10 * DAY }),
  ];
  const r = applyMemberTab(pool, "newest", { nowMs: NOW, todayKey: TODAY });
  assert.equal(pool.length, 3, "input must not be mutated by filtering");
  assert.deepEqual(names(r), ["RecentA", "RecentB"]);
  assert.equal(r.total, 2);
  assert.equal(r.capped, false);
});

test("top narrows to the leaderboard, not the full pool", () => {
  const pool = Array.from({ length: 10 }, (_, i) =>
    member({ name: `M${i}`, points: (i + 1) * 10 })
  );
  const r = applyMemberTab(pool, "top", { nowMs: NOW, todayKey: TODAY, topLimit: 3 });
  assert.deepEqual(names(r), ["M9", "M8", "M7"]);
  assert.equal(r.list.length, 3);
});

test("a capped view reports its true total so it is not read as complete", () => {
  const pool = Array.from({ length: 40 }, (_, i) => member({ name: `M${i}`, points: 100 + i }));
  const r = applyMemberTab(pool, "top", { nowMs: NOW, todayKey: TODAY });
  assert.equal(r.list.length, TOP_LIMIT);
  assert.equal(r.total, 40);
  assert.equal(r.capped, true);
});

test("a top view that fits is not reported as capped", () => {
  const pool = Array.from({ length: 5 }, (_, i) => member({ name: `M${i}`, points: i + 1 }));
  const r = applyMemberTab(pool, "top", { nowMs: NOW, todayKey: TODAY });
  assert.equal(r.capped, false);
  assert.equal(r.total, 5);
});

test("members with no points are excluded from top", () => {
  const pool = [member({ name: "Scored", points: 10 }), member({ name: "Zero", points: 0 })];
  const r = applyMemberTab(pool, "top", { nowMs: NOW, todayKey: TODAY });
  assert.deepEqual(names(r), ["Scored"]);
});

test("top survives a community where everyone has visit points", () => {
  // DAILY_VISIT pays 10 on first visit, so points > 0 is nearly universal.
  // A cut at 0 would make Top a synonym for All again.
  const pool = Array.from({ length: 50 }, (_, i) => member({ name: `M${i}`, points: 10 + i }));
  const r = applyMemberTab(pool, "top", { nowMs: NOW, todayKey: TODAY });
  assert.equal(r.list.length, TOP_LIMIT);
  assert.equal(r.total, 50);
});

// --- window edges ---------------------------------------------------------

test("newest window edge is exclusive at exactly the boundary", () => {
  const onEdge = member({ name: "OnEdge", createdAt: NOW - NEWEST_WINDOW_DAYS * DAY });
  const justInside = member({ name: "Inside", createdAt: NOW - NEWEST_WINDOW_DAYS * DAY + 1000 });
  const r = applyMemberTab([onEdge, justInside], "newest", { nowMs: NOW, todayKey: TODAY });
  assert.deepEqual(names(r), ["Inside"]);
});

test("an unknown join date is not treated as newly joined", () => {
  const pool = [
    member({ name: "NoDate", createdAt: 0 }),
    member({ name: "RealNew", createdAt: NOW - DAY }),
  ];
  const r = applyMemberTab(pool, "newest", { nowMs: NOW, todayKey: TODAY });
  assert.deepEqual(names(r), ["RealNew"]);
});

// --- the pre-existing tabs keep their behaviour ---------------------------

test("all keeps every member and sorts by name", () => {
  const pool = [
    member({ name: "Zoe" }),
    member({ name: "Ana" }),
    member({ name: "Mel" }),
  ];
  const r = applyMemberTab(pool, "all", { nowMs: NOW, todayKey: TODAY });
  assert.deepEqual(names(r), ["Ana", "Mel", "Zoe"]);
  assert.equal(r.capped, false);
});

test("lounge narrows to members currently present", () => {
  const pool = [member({ name: "Here", live: true }), member({ name: "Away" })];
  assert.deepEqual(names(applyMemberTab(pool, "lounge", { nowMs: NOW, todayKey: TODAY })), ["Here"]);
});

test("online narrows to the caller's today, not a freshly derived one", () => {
  const pool = [
    member({ name: "Today", lastVisitDate: TODAY }),
    member({ name: "Yesterday", lastVisitDate: "2026-09-27" }),
  ];
  assert.deepEqual(names(applyMemberTab(pool, "online", { nowMs: NOW, todayKey: TODAY })), ["Today"]);
});

test("hosts includes owner, moderator and host roles", () => {
  const pool = [
    member({ name: "Owner", role: "owner" }),
    member({ name: "Mod", role: "moderator" }),
    member({ name: "Host", role: "host" }),
    member({ name: "Plain", role: "member" }),
  ];
  const r = applyMemberTab(pool, "hosts", { nowMs: NOW, todayKey: TODAY });
  assert.deepEqual(names(r), ["Host", "Mod", "Owner"]);
});

test("hosts does not cap a large staff list", () => {
  const pool = Array.from({ length: TOP_LIMIT + 5 }, (_, i) =>
    member({ name: `H${i}`, role: "host" })
  );
  const r = applyMemberTab(pool, "hosts", { nowMs: NOW, todayKey: TODAY });
  assert.equal(r.list.length, TOP_LIMIT + 5);
  assert.equal(r.capped, false);
});

test("an unknown tab falls back to showing everyone", () => {
  const pool = [member({ name: "A" }), member({ name: "B" })];
  assert.deepEqual(names(applyMemberTab(pool, "nonsense", { nowMs: NOW, todayKey: TODAY })), ["A", "B"]);
});

// --- guards ---------------------------------------------------------------

test("the tab strip still carries all six tabs in order", () => {
  assert.deepEqual(
    MEMBER_TABS.map((t) => t.key),
    ["all", "lounge", "online", "newest", "top", "hosts"]
  );
  assert.equal(MEMBER_TABS.find((t) => t.key === "online").label, "Online today");
});

test("an empty or missing pool is safe", () => {
  for (const pool of [[], null, undefined]) {
    const r = applyMemberTab(pool, "top", { nowMs: NOW, todayKey: TODAY });
    assert.deepEqual(r.list, []);
    assert.equal(r.total, 0);
    assert.equal(r.capped, false);
  }
});

test("matchesMemberTab is total over an unknown tab", () => {
  assert.equal(matchesMemberTab(member(), "nonsense", { nowMs: NOW, todayKey: TODAY }), true);
});

// --- empty-state copy -----------------------------------------------------
// The regression: listActiveRoomMemberIds() returned a bare [] when its query
// failed, so a presence blip was reported to the member as a deserted lounge.

test("an unavailable presence read does not claim the lounge is empty", () => {
  const msg = emptyViewMessage({ tab: "lounge", presenceAvailable: false });
  assert.match(msg, /couldn't check/i);
  assert.doesNotMatch(msg, /nobody is in the lounge/i);
});

test("a successful empty read does say the lounge is empty", () => {
  assert.equal(
    emptyViewMessage({ tab: "lounge", presenceAvailable: true }),
    "Nobody is in the lounge right now."
  );
});

test("presence availability only changes the lounge tab", () => {
  for (const tab of ["all", "newest", "top", "hosts", "online"]) {
    assert.equal(
      emptyViewMessage({ tab, presenceAvailable: false }),
      emptyViewMessage({ tab, presenceAvailable: true }),
      tab
    );
  }
});

test("a failed presence read does not leak into the empty copy elsewhere", () => {
  // A member filtering on All with no results should never be told about the
  // lounge, even when presence is unavailable.
  const msg = emptyViewMessage({ tab: "all", presenceAvailable: false, activeFilterCount: 3 });
  assert.equal(msg, "No members match this view.");
  assert.doesNotMatch(msg, /lounge/i);
});

test("the empty copy keeps its pre-existing cases", () => {
  assert.equal(emptyViewMessage({ tab: "all" }), "No members yet.");
  assert.equal(emptyViewMessage({ tab: "all", query: "ana" }), "No members match this view.");
  assert.equal(emptyViewMessage({ tab: "top" }), "No members match this view.");
  assert.equal(
    emptyViewMessage({ tab: "all", activeFilterCount: 1 }),
    "No members match this view."
  );
});

test("emptyViewMessage is total with no arguments", () => {
  // No tab is not "all", so this lands on the filtered-view copy rather than
  // claiming the community is empty.
  assert.equal(typeof emptyViewMessage(), "string");
  assert.equal(emptyViewMessage(), "No members match this view.");
});
