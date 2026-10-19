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

test("short new passwords are refused", () => {
  assert.match(validatePasswordChange({ currentPassword: CURRENT, newPassword: "abc123" }), /8 characters/i);
});

test("the new password must differ from the current one", () => {
  assert.match(
    validatePasswordChange({ currentPassword: CURRENT, newPassword: CURRENT }),
    /different/i
  );
});

test("the shared onboarding password cannot be kept", () => {
  assert.match(
    validatePasswordChange({ currentPassword: "something-else", newPassword: "12345678" }),
    /too easy/i
  );
});

test("letters plus a number or symbol pass", () => {
  assert.equal(
    validatePasswordChange({ currentPassword: CURRENT, newPassword: "yarnlounge42" }),
    null
  );
  assert.equal(
    validatePasswordChange({ currentPassword: CURRENT, newPassword: "purple-yarn!" }),
    null
  );
});

test("letters alone are not enough", () => {
  assert.match(validatePasswordChange({ currentPassword: CURRENT, newPassword: "lettersonly" }), /number or symbol/i);
  assert.match(validatePasswordChange({ currentPassword: CURRENT, newPassword: "1234567890" }), /at least one letter/i);
});

test("strength grows with length, then mix, then symbols", () => {
  assert.equal(passwordStrength(""), 0);
  assert.equal(passwordStrength("abc"), 0);
  assert.equal(passwordStrength("abcdefgh"), 1);
  assert.equal(passwordStrength("abcdefgh1234"), 3);
  assert.equal(passwordStrength("abcdefgh1234!"), 4);
  assert.equal(passwordStrength("YarnLounge42!"), 4);
  // The label list always covers every reachable score.
  for (let s = 0; s <= 4; s++) assert.ok(STRENGTH_LABELS[s]);
});
