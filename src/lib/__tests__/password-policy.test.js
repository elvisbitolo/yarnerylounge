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

test("passwords shorter than five characters are refused", () => {
  assert.match(validatePasswordChange({ currentPassword: CURRENT, newPassword: "abcd" }), /5 characters/i);
});

test("five characters pass without uppercase, numbers, or symbols", () => {
  assert.equal(validatePasswordChange({ currentPassword: CURRENT, newPassword: "abcde" }), null);
  assert.equal(validatePasswordChange({ currentPassword: CURRENT, newPassword: "12345" }), null);
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
  assert.equal(passwordStrength("abcde"), 1);
  assert.equal(passwordStrength("abcdefgh1234"), 2);
  assert.equal(passwordStrength("abcdefghijklmnopqrst"), 4);
  assert.equal(passwordStrength("YarnLounge42!"), 2);
  // The label list always covers every reachable score.
  for (let s = 0; s <= 4; s++) assert.ok(STRENGTH_LABELS[s]);
});
