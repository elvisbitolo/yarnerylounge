import test from "node:test";
import assert from "node:assert/strict";
import { sectionsForRole, canSee, guardFor, ADMIN_SECTIONS } from "../nav.js";

const everyItem = ADMIN_SECTIONS.flatMap((s) => s.items);

test("every section has at least one item", () => {
  for (const section of ADMIN_SECTIONS) {
    assert.ok(section.items.length > 0, `${section.label} is empty`);
  }
});

test("moderators never see an owner-guarded item", () => {
  const seen = sectionsForRole("moderator")
    .flatMap((s) => s.items)
    .map((i) => i.href);
  for (const item of everyItem) {
    if (item.guard === "owner") {
      assert.ok(!seen.includes(item.href), `moderator can see owner-only ${item.href}`);
    } else {
      assert.ok(seen.includes(item.href), `moderator cannot see ${item.href}`);
    }
  }
});

test("owners see every item", () => {
  const seen = sectionsForRole("owner")
    .flatMap((s) => s.items)
    .map((i) => i.href);
  for (const item of everyItem) assert.ok(seen.includes(item.href), `owner missing ${item.href}`);
});

test("a non-staff role sees no admin navigation at all", () => {
  for (const role of ["member", null, undefined, "", "host"]) {
    const seen = sectionsForRole(role);
    const items = seen.flatMap((s) => s.items);
    assert.ok(items.length === 0, `${role} saw ${items.length} items`);
    for (const section of seen) assert.equal(section.items.length, 0);
  }
});

test("sections never render empty after filtering", () => {
  for (const role of ["owner", "moderator"]) {
    for (const section of sectionsForRole(role)) {
      assert.ok(section.items.length > 0, `${role}/${section.label} rendered empty`);
    }
  }
});

test("hrefs are unique and absolute", () => {
  const seen = new Set();
  for (const item of everyItem) {
    assert.ok(item.href.startsWith("/admin"), `${item.href} is not under /admin`);
    assert.ok(!seen.has(item.href), `duplicate href ${item.href}`);
    seen.add(item.href);
  }
});

test("guardFor and canSee agree with the declared guard", () => {
  for (const item of everyItem) {
    assert.equal(guardFor(item.href), item.guard, `guardFor mismatch for ${item.href}`);
    assert.equal(canSee(item.href, "owner"), true, `owner denied ${item.href}`);
    assert.equal(
      canSee(item.href, "moderator"),
      item.guard === "moderator",
      `canSee mismatch for ${item.href}`
    );
  }
});

test("every item records the guard evidence it was derived from", () => {
  for (const item of everyItem) {
    assert.ok(item.basis && item.basis.length > 0, `${item.href} has no basis`);
    assert.ok(["owner", "moderator"].includes(item.guard), `${item.href} bad guard`);
  }
});

test("unknown hrefs default to owner-only", () => {
  assert.equal(canSee("/admin/does-not-exist", "moderator"), false);
  assert.equal(canSee("/admin/does-not-exist", "owner"), true);
});
