import test from "node:test";
import assert from "node:assert/strict";
import {
  API_PAGE_DEFAULT,
  API_PAGE_MAX,
  API_OFFSET_MAX,
  clampLimit,
  clampOffset,
  publicMember,
  publicPost,
  publicEvent,
  isMemberVisible,
  matchesMemberQuery,
} from "../api-v1-core.js";

test("clampLimit: defaults, caps and rejects junk", () => {
  assert.equal(clampLimit(undefined), API_PAGE_DEFAULT);
  assert.equal(clampLimit("10"), 10);
  assert.equal(clampLimit("999"), API_PAGE_MAX);
  assert.equal(clampLimit("0"), API_PAGE_DEFAULT);
  assert.equal(clampLimit("-3"), API_PAGE_DEFAULT);
  assert.equal(clampLimit("abc"), API_PAGE_DEFAULT);
});

test("clampOffset: floors at zero and caps runaway paging", () => {
  assert.equal(clampOffset(undefined), 0);
  assert.equal(clampOffset("40"), 40);
  assert.equal(clampOffset("-5"), 0);
  assert.equal(clampOffset("999999"), API_OFFSET_MAX);
});

test("publicMember: exposes public fields only", () => {
  const row = {
    id: "u1",
    name: "Ada",
    username: "ada",
    headline: "Crocheter",
    bio: "hi",
    location: "Nairobi",
    country: "KE",
    photoURL: "p.png",
    role: "member",
    crafts: ["crochet"],
    hobbies: ["reading"],
    skillLevel: "beginner",
    yearsExperience: "2",
    favoriteYarnBrand: "Brand",
    goToYarn: "Cotton",
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    extra: { quizAnswer: "secret", skillLevel: "advanced" },
  };
  const out = publicMember(row);
  assert.equal(out.id, "u1");
  assert.equal(out.skillLevel, "advanced");
  assert.equal(out.createdAt, "2026-01-02T00:00:00.000Z");
  assert.equal(out.quizAnswer, undefined);
  assert.equal(out.extra, undefined);
  assert.equal(out.expiresAt, undefined);
  assert.equal(publicMember(null), null);
});

test("publicPost: counts likes and never leaks the like map", () => {
  const out = publicPost({
    id: "p1",
    text: "hello",
    authorId: "u1",
    authorName: "Ada",
    likes: { a: 1, b: 2 },
    commentCount: 3,
    hashtags: ["yarn"],
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
  });
  assert.equal(out.likeCount, 2);
  assert.equal(out.likes, undefined);
  assert.deepEqual(out.author, { id: "u1", name: "Ada" });
  assert.equal(out.createdAt, "2026-01-02T00:00:00.000Z");
  assert.equal(publicPost(null), null);
});

test("publicEvent: carries creator name and null-safe end time", () => {
  const out = publicEvent(
    { id: "e1", title: "Knit", startTime: new Date("2026-02-01T10:00:00.000Z"), createdBy: "u1" },
    "Ada"
  );
  assert.equal(out.title, "Knit");
  assert.equal(out.endTime, null);
  assert.deepEqual(out.creator, { id: "u1", name: "Ada" });
  assert.equal(publicEvent(null), null);
});

test("isMemberVisible: hides private profiles and honours blocks both ways", () => {
  const pub = { id: "u1", name: "Ada", extra: {} };
  assert.equal(isMemberVisible(pub), true);
  assert.equal(isMemberVisible({ ...pub, name: "" }), false);
  assert.equal(isMemberVisible(null), false);

  const priv = { id: "u2", name: "Bea", extra: { profileVisibility: "private" } };
  assert.equal(isMemberVisible(priv, { viewerId: "v" }), false);
  assert.equal(isMemberVisible(priv, { viewerId: "v", canModerate: true }), true);

  assert.equal(isMemberVisible(pub, { viewerId: "v", blockedIds: ["u1"] }), false);
  assert.equal(
    isMemberVisible({ id: "u3", name: "Cy", extra: { blockedMemberIds: ["v"] } }, { viewerId: "v" }),
    false
  );
});

test("matchesMemberQuery: matches name/username/headline, empty matches all", () => {
  const row = { name: "Ada", username: "ada-knits", headline: "Loves yarn", location: "Nairobi" };
  assert.equal(matchesMemberQuery(row, ""), true);
  assert.equal(matchesMemberQuery(row, "ada"), true);
  assert.equal(matchesMemberQuery(row, "yarn"), true);
  assert.equal(matchesMemberQuery(row, "nairobi"), true);
  assert.equal(matchesMemberQuery(row, "zzz"), false);
});
