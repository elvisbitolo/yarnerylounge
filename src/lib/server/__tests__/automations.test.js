import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTOMATION_TRIGGERS,
  AUTOMATION_ACTIONS,
  fillTemplate,
  normalizeAutomation,
} from "../automations-core.js";

test("fillTemplate: replaces known placeholders", () => {
  const result = fillTemplate("Hi {{memberName}} ({{memberEmail}})", {
    memberName: "Ada",
    memberEmail: "ada@example.com",
  });
  assert.equal(result, "Hi Ada (ada@example.com)");
});

test("fillTemplate: leaves unknown placeholders intact", () => {
  assert.equal(fillTemplate("Hi {{unknown}}", {}), "Hi {{unknown}}");
});

test("fillTemplate: handles non-strings", () => {
  assert.equal(fillTemplate(null, {}), null);
  assert.equal(fillTemplate(42, {}), 42);
});

test("fillTemplate: escapes null values as-is", () => {
  assert.equal(fillTemplate("x{{a}}y", { a: null }), "x{{a}}y");
});

test("normalizeAutomation: accepts valid inputs", () => {
  const result = normalizeAutomation({
    name: "  Welcome  ",
    trigger: "new_member",
    action: "award_points",
    config: { points: 10 },
  });
  assert.equal(result.name, "Welcome");
  assert.equal(result.trigger, "new_member");
  assert.equal(result.action, "award_points");
  assert.deepEqual(result.config, { points: 10 });
});

test("normalizeAutomation: rejects unknown trigger/action", () => {
  const result = normalizeAutomation({ trigger: "nope", action: "nope" });
  assert.equal(result.trigger, "");
  assert.equal(result.action, "");
});

test("normalizeAutomation: defaults config to empty object", () => {
  assert.deepEqual(normalizeAutomation({}).config, {});
});

test("constant lists cover the implemented actions", () => {
  assert.ok(AUTOMATION_TRIGGERS.includes("new_member"));
  assert.ok(AUTOMATION_TRIGGERS.includes("new_post"));
  assert.ok(AUTOMATION_TRIGGERS.includes("event_rsvp"));
  assert.ok(AUTOMATION_ACTIONS.includes("award_points"));
  assert.ok(AUTOMATION_ACTIONS.includes("add_member_to_space"));
});
