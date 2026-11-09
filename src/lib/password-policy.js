// Password-change rules shared by the API route (enforcement) and the
// Account -> Settings form (live feedback). Pure — no imports — so the same
// checks are unit-testable and the client can never disagree with the server.

export function validatePasswordChange({ currentPassword = "", newPassword = "" } = {}) {
  if (!currentPassword || !newPassword) {
    return "Enter your current password and a new one.";
  }
  if (newPassword.length < 5) {
    return "Choose a password with at least 5 characters.";
  }
  if (newPassword === currentPassword) {
    return "The new password must be different from the current one.";
  }
  return null;
}

// 0..4 for the strength meter in the form. Deliberately generous: length
// carries the most weight, because it is what actually resists guessing.
export function passwordStrength(value) {
  const v = String(value || "");
  if (!v) return 0;
  let score = 0;
  if (v.length >= 5) score += 1;
  if (v.length >= 12) score += 1;
  if (/[A-Za-z]/.test(v) && /\d/.test(v)) score += 1;
  if (/[^\w\s]/.test(v)) score += 1;
  return Math.min(4, score);
}

export const STRENGTH_LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];
