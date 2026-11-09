import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STRENGTH_LABELS,
  passwordStrength,
  validatePasswordChange,
} from "../password-policy.js";

const CURRENT = "12345678";

test("a change needs both passwords", () => {
  assert.match(validatePasswordChange({ currentPassword: "", newPassword: "x" }), /current password/i);
  assert.match(validatePasswordChange({ currentPassword: CURRENT, newPassword: "" }), /new one/i);
});

test("passwords shorter than six characters are refused", () => {
  assert.match(validatePasswordChange({ currentPassword: CURRENT, newPassword: "abcde" }), /6 characters/i);
});

test("five characters pass without uppercase, numbers, or symbols", () => {
  assert.equal(validatePasswordChange({ currentPassword: CURRENT, newPassword: "abcdef" }), null);
  assert.equal(validatePasswordChange({ currentPassword: CURRENT, newPassword: "123456" }), null);
});

test("the new password must differ from the current one", () => {
  assert.match(
    validatePasswordChange({ currentPassword: CURRENT, newPassword: CURRENT }),
    /different/i
  );
});

test("strength grows with length, then mix, then symbols", () => {
  assert.equal(passwordStrength(""), 0);
  assert.equal(passwordStrength("abc"), 0);
  assert.equal(passwordStrength("abcdef"), 1);
  assert.equal(passwordStrength("abcdefghijkl"), 2);
  assert.equal(passwordStrength("abcdefghijklmnop"), 3);
  assert.equal(passwordStrength("abcdefghijklmnopqrst"), 4);
  // The label list always covers every reachable score.
  for (let s = 0; s <= 4; s++) assert.ok(STRENGTH_LABELS[s]);
});
