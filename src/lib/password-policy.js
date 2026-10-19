// Password-change rules shared by the API route (enforcement) and the
// Account -> Settings form (live feedback). Pure — no imports — so the same
// checks are unit-testable and the client can never disagree with the server.

// The shared onboarding password ("12345678") and anything equally trivial
// must not survive a "change password" — the whole point of the spot is to
// become stronger than what the account was handed.
const TRIVIAL = new Set(["12345678", "password", "password1", "qwerty123", "11111111", "87654321"]);

export function validatePasswordChange({ currentPassword = "", newPassword = "" } = {}) {
  if (!currentPassword || !newPassword) {
    return "Enter your current password and a new one.";
  }
  if (newPassword.length < 8) {
    return "Choose a password with at least 8 characters.";
  }
  if (newPassword === currentPassword) {
    return "The new password must be different from the current one.";
  }
  if (TRIVIAL.has(newPassword.toLowerCase())) {
    return "That password is too easy to guess — pick something less obvious.";
  }
  if (!/[A-Za-z]/.test(newPassword)) {
    return "Use at least one letter.";
  }
  if (!/\d/.test(newPassword) && !/[^\w\s]/.test(newPassword)) {
    return "Add at least one number or symbol.";
  }
  return null;
}

// 0..4 for the strength meter in the form. Deliberately generous: length
// carries the most weight, because it is what actually resists guessing.
export function passwordStrength(value) {
  const v = String(value || "");
  if (!v) return 0;
  let score = 0;
  if (v.length >= 8) score += 1;
  if (v.length >= 12) score += 1;
  if (/[A-Za-z]/.test(v) && /\d/.test(v)) score += 1;
  if (/[^\w\s]/.test(v)) score += 1;
  return Math.min(4, score);
}

export const STRENGTH_LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];
