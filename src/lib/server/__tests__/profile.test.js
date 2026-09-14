import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeProfile, profileChanged } from "../profile.js";

test("normalizeProfile: name is required", () => {
  const { patch, errors } = normalizeProfile({ name: "   " });
  assert.equal(patch.name, undefined);
  assert.equal(errors.name, "Name is required");
});

test("normalizeProfile: trims and caps name length", () => {
  const { patch, errors } = normalizeProfile({ name: "  Ada Lovelace  " });
  assert.deepEqual(errors, {});
  assert.equal(patch.name, "Ada Lovelace");
});

test("normalizeProfile: optional fields are cleaned and capped", () => {
  const { patch } = normalizeProfile({
    headline: "  Engineer  ",
    location: " London ",
    bio: "x".repeat(900),
  });
  assert.equal(patch.headline, "Engineer");
  assert.equal(patch.location, "London");
  assert.equal(patch.bio.length, 600);
});

test("normalizeProfile: quiz fields are cleaned and validated", () => {
  const { patch, errors } = normalizeProfile({
    yarnType: ["  Soft and squishy  ", "  Not an option  "],
    idealHookBrand: "  Clover  ",
  });
  assert.equal(errors.idealHookBrand, undefined);
  assert.deepEqual(patch.yarnType, ["Soft and squishy"]);
  assert.equal(patch.idealHookBrand, "Clover");
});

test("normalizeProfile: quiz single answers reject unknown values", () => {
  const { patch, errors } = normalizeProfile({ idealHookBrand: "x".repeat(300) });
  assert.equal(patch.idealHookBrand, undefined);
  assert.ok(errors.idealHookBrand);
});

test("normalizeProfile: quiz single answers may be cleared", () => {
  const { patch, errors } = normalizeProfile({ idealHookBrand: "" });
  assert.equal(patch.idealHookBrand, "");
  assert.deepEqual(errors, {});
});

test("normalizeProfile: unknown fields are ignored", () => {
  const { patch } = normalizeProfile({ name: "A", role: "owner", suspended: true });
  assert.deepEqual(Object.keys(patch).sort(), ["name"]);
});

test("normalizeProfile: empty body yields no patch and no errors", () => {
  const { patch, errors } = normalizeProfile({});
  assert.deepEqual(patch, {});
  assert.deepEqual(errors, {});
});

test("normalizeProfile: notifications coerces to on/off only", () => {
  assert.equal(normalizeProfile({ notifications: "on" }).patch.notifications, "on");
  assert.equal(normalizeProfile({ notifications: "off" }).patch.notifications, "off");
  const { patch, errors } = normalizeProfile({ notifications: "maybe" });
  assert.equal(patch.notifications, undefined);
  assert.equal(errors.notifications, "Notifications must be \"on\" or \"off\"");
});

test("profileChanged: detects no-op saves", () => {
  const prev = { name: "Ada", headline: "Engineer" };
  const { changed, hasChanges } = profileChanged(prev, { name: "Ada", headline: "Engineer" });
  assert.equal(changed.length, 0);
  assert.equal(hasChanges, false);
});

test("profileChanged: detects real changes", () => {
  const prev = { name: "Ada" };
  const { changed, hasChanges } = profileChanged(prev, { name: "Grace", headline: "Dev" });
  assert.deepEqual(changed, ["name", "headline"]);
  assert.equal(hasChanges, true);
});
