const PLAN_ADMIN_EMAILS = new Set([
  "elvisbitolo11@gmail.com",
  "secretyarnery@gmail.com",
]);

export const MEMBER_PLANS = ["flirting", "hooking-up", "moving-in"];

export function canManageMemberPlans(email) {
  return PLAN_ADMIN_EMAILS.has(String(email || "").trim().toLowerCase());
}
