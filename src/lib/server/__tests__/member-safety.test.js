import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOCKED_KEY, isSafetyId, updateSafetyExtra } from "../member-safety-core.js";

test("member safety stores unique blocked ids without dropping profile data", () => {
  const extra = { timezone: "Africa/Nairobi", [BLOCKED_KEY]: ["u2", "u2"] };
  const updated = updateSafetyExtra(extra, BLOCKED_KEY, "u3", true);
  assert.deepEqual(updated[BLOCKED_KEY], ["u2", "u3"]);
  assert.equal(updated.timezone, "Africa/Nairobi");
  assert.equal(isSafetyId(updated, BLOCKED_KEY, "u3"), true);
});

test("member safety can remove a preference", () => {
  const updated = updateSafetyExtra({ [BLOCKED_KEY]: ["u2", "u3"] }, BLOCKED_KEY, "u2", false);
  assert.deepEqual(updated[BLOCKED_KEY], ["u3"]);
});
