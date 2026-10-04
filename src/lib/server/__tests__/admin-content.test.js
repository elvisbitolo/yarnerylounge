import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizePatch, EDITABLE_FIELDS, isEditableKind } from "../admin-content-core.js";

test("trims and keeps only allow-listed fields", () => {
  const { data, errors } = sanitizePatch("event", {
    title: "  Yarn night  ",
    description: "  Bring a project  ",
    publicPreview: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(data, { title: "Yarn night", description: "Bring a project", publicPreview: true });
});

test("IGNORES fields that are not on the allow list", () => {
  const { data, errors } = sanitizePatch("event", {
    title: "Keep me",
    id: "attacker-chosen-id",
    startTime: "1999-01-01",
    hostUid: "someone-else",
  });
  assert.deepEqual(errors, []);
  // Only the allow-listed field survives; nothing else is passed to Prisma.
  assert.deepEqual(Object.keys(data), ["title"]);
});

test("rejects a prototype-pollution style key", () => {
  const { data } = sanitizePatch("group", { name: "Fine", __proto__: { polluted: true } });
  assert.deepEqual(Object.keys(data), ["name"]);
  assert.equal({}.polluted, undefined);
});

test("rejects an empty body", () => {
  assert.equal(sanitizePatch("event", {}).errors[0], "Nothing to update");
  assert.equal(sanitizePatch("event", null).errors[0], "Body must be an object");
  assert.equal(sanitizePatch("event", []).errors[0], "Body must be an object");
});

test("enforces required fields", () => {
  const { errors } = sanitizePatch("event", { title: "   " });
  assert.ok(errors[0].includes("required"));
});

test("enforces max length", () => {
  const { errors } = sanitizePatch("event", { title: "x".repeat(5000) });
  assert.ok(errors[0].includes("characters or fewer"));
});

test("rejects wrong types instead of coercing", () => {
  assert.match(sanitizePatch("event", { title: 42 }).errors[0], /must be text/);
  assert.match(sanitizePatch("event", { title: "Ok", publicPreview: "yes" }).errors[0], /true or false/);
});

test("unknown content type is refused", () => {
  assert.equal(sanitizePatch("user", { role: "owner" }).errors[0], "Unknown content type");
  assert.equal(sanitizePatch("__proto__", { name: "x" }).errors[0], "Unknown content type");
  assert.equal(isEditableKind("user"), false);
  assert.equal(isEditableKind("event"), true);
});

test("article and lesson bodies allow long markdown", () => {
  const body = "# Heading\n\nSome **bold** copy and a [link](https://example.com).";
  assert.deepEqual(sanitizePatch("article", { title: "T", content: body }).errors, []);
  assert.deepEqual(sanitizePatch("lesson", { title: "T", body }).errors, []);
});

test("every editable kind has a model, label and at least one required field", () => {
  for (const [kind, spec] of Object.entries(EDITABLE_FIELDS)) {
    assert.ok(spec.model, `${kind} missing model`);
    assert.ok(spec.label, `${kind} missing label`);
    const fields = Object.values(spec.fields);
    assert.ok(fields.length > 0, `${kind} has no fields`);
    assert.ok(fields.some((f) => f.required), `${kind} has no required field`);
    for (const [key, f] of Object.entries(spec.fields)) {
      assert.ok(["string", "text", "boolean", "stringArray"].includes(f.type), `${kind} bad type`);
      if (f.type === "boolean") {
        assert.ok(!f.required, `${kind} boolean must not be required`);
      } else {
        assert.ok(f.max > 0, `${kind}.${key} missing max`);
      }
    }
  }
});

test("no editable spec exposes a sensitive column", () => {
  const banned = ["id", "uid", "createdBy", "creator", "hostUid", "role", "ownerId", "slug"];
  for (const spec of Object.values(EDITABLE_FIELDS)) {
    for (const key of Object.keys(spec.fields)) {
      assert.ok(!banned.includes(key), `${spec.model}.${key} must not be editable`);
    }
  }
});
test("hashtags is normalized to a Postgres text[] and never a bare string", () => {
  assert.deepEqual(sanitizePatch("article", { hashtags: "yarn, crochet ,yarn" }).data.hashtags, ["yarn", "crochet"]);
  assert.deepEqual(sanitizePatch("article", { hashtags: ["a", "b", "a"] }).data.hashtags, ["a", "b"]);
  assert.deepEqual(sanitizePatch("article", { hashtags: "" }).data.hashtags, []);
  assert.deepEqual(sanitizePatch("article", { hashtags: [] }).data.hashtags, []);
  assert.match(sanitizePatch("article", { hashtags: [1, 2] }).errors[0], /list of text/);
  assert.match(sanitizePatch("article", { hashtags: 7 }).errors[0], /must be a list/);
});

test("hashtag lists are capped", () => {
  const many = Array.from({ length: 50 }, (_, i) => `tag${i}`);
  const { data } = sanitizePatch("article", { hashtags: many });
  assert.ok(data.hashtags.length <= 12);
});
