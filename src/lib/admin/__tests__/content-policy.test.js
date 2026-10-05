import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_POLICY,
  isStaffRole,
  evaluateContentPolicy,
} from "../content-policy.js";
import { EDITABLE_FIELDS } from "../content-fields.js";

test("every editable kind has an explicit policy, and only those kinds do", () => {
  // Imports the real EDITABLE_FIELDS rather than restating it, so adding an
  // editable kind without a policy fails here instead of silently defaulting
  // the route to open. EDITABLE_FIELDS is deliberately import-free, which is
  // what makes this safe in a plain node:test run.
  const editable = Object.keys(EDITABLE_FIELDS);
  assert.ok(editable.length > 0);
  for (const kind of editable) {
    assert.ok(CONTENT_POLICY[kind], `kind ${kind} has no policy`);
  }
  const policies = Object.keys(CONTENT_POLICY);
  assert.equal(policies.length, editable.length, "policy list and editable kinds diverged");
  for (const kind of policies) {
    assert.ok(editable.includes(kind), `policy exists for non-editable kind ${kind}`);
  }
});

test("isStaffRole accepts owner and moderator only", () => {
  assert.equal(isStaffRole("owner"), true);
  assert.equal(isStaffRole("moderator"), true);
  assert.equal(isStaffRole("OWNER"), true);
  assert.equal(isStaffRole("  Moderator "), true);
  assert.equal(isStaffRole("host"), false);
  assert.equal(isStaffRole("member"), false);
  assert.equal(isStaffRole(""), false);
  assert.equal(isStaffRole(null), false);
});

test("questions are owner-only, closing the moderator escalation", () => {
  assert.equal(evaluateContentPolicy({ kind: "question", role: "owner" }).allowed, true);
  for (const role of ["moderator", "host", "member", ""]) {
    const r = evaluateContentPolicy({ kind: "question", role });
    assert.equal(r.allowed, false, `role ${role} must not edit questions`);
    assert.equal(r.status, 403);
  }
});

test("a moderator cannot edit questions even when flagged as host", () => {
  const r = evaluateContentPolicy({ kind: "question", role: "moderator", isHost: true });
  assert.equal(r.allowed, false);
});

test("events allow staff or the event's own host", () => {
  assert.equal(evaluateContentPolicy({ kind: "event", role: "owner" }).allowed, true);
  assert.equal(evaluateContentPolicy({ kind: "event", role: "moderator" }).allowed, true);
  assert.equal(evaluateContentPolicy({ kind: "event", role: "member", isHost: true }).allowed, true);
});

test("events refuse a non-host non-staff member", () => {
  const r = evaluateContentPolicy({ kind: "event", role: "member", isHost: false });
  assert.equal(r.allowed, false);
  assert.equal(r.status, 403);
  assert.equal(r.reason, "event-host-or-staff-required");
});

test("moderator kinds allow owner and moderator, refuse everyone else", () => {
  const kinds = ["group", "article", "lesson", "module", "announcement", "room", "space"];
  for (const kind of kinds) {
    assert.equal(evaluateContentPolicy({ kind, role: "owner" }).allowed, true, kind);
    assert.equal(evaluateContentPolicy({ kind, role: "moderator" }).allowed, true, kind);
    for (const role of ["host", "member", "", null]) {
      const r = evaluateContentPolicy({ kind, role });
      assert.equal(r.allowed, false, `${kind} must refuse ${role}`);
      assert.equal(r.status, 403);
    }
  }
});

test("a plain host role gets no blanket access to moderator kinds", () => {
  // Hosts are staff-adjacent in some paths (e.g. requireHostUser) but must not
  // inherit admin-wide write access here.
  const r = evaluateContentPolicy({ kind: "group", role: "host", isHost: true });
  assert.equal(r.allowed, false);
});

test("an unknown kind is rejected rather than allowed", () => {
  const r = evaluateContentPolicy({ kind: "subscription", role: "owner" });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "unknown-kind");
  assert.equal(r.status, 400);
});

test("a missing argument object fails closed", () => {
  const r = evaluateContentPolicy();
  assert.equal(r.allowed, false);
});