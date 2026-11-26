import { TIERS } from "./plans.js";
import { isActiveSub } from "./billing.js";

export const ADMIN_ASSIGNABLE_ROLES = ["member", "host", "moderator"];

export function normalizeAdminPlan(value) {
  if (value === undefined || value === null || value === "") return { ok: true, plan: undefined };
  const plan = String(value).trim().toLowerCase();
  if (!TIERS.includes(plan)) return { ok: false, error: "Invalid plan" };
  return { ok: true, plan };
}

export function normalizeAdminRole(value) {
  if (value === undefined || value === null || value === "") return { ok: true, role: undefined };
  const role = String(value).trim().toLowerCase();
  if (!ADMIN_ASSIGNABLE_ROLES.includes(role)) return { ok: false, error: "Invalid role" };
  return { ok: true, role };
}

export function normalizeAdminExpiry(value) {
  if (value === undefined || value === null || value === "") return { ok: true, expiresAt: null };
  const raw = String(value).trim();
  if (!raw) return { ok: true, expiresAt: null };
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw;
  const expiresAt = new Date(iso);
  if (Number.isNaN(expiresAt.getTime())) return { ok: false, error: "Enter a valid expiry date." };
  return { ok: true, expiresAt };
}

export function resolveAdminMemberStatus(user, sub, now = Date.now()) {
  if (user?.suspended) return { category: "suspended", label: "Suspended", code: "suspended" };
  const role = String(user?.role || "").toLowerCase();
  if (role === "owner" || role === "moderator") {
    return { category: "active", label: "Role access", code: "role" };
  }
  if (!sub) return { category: "inactive", label: "Inactive", code: "none" };
  const active = isActiveSub(sub, now);
  if (sub.status === "trialing" && active) return { category: "active", label: "Trial", code: "trial" };
  if (sub.status === "past_due" && active) {
    return { category: "active", label: "Payment past due", code: "past_due" };
  }
  if (active) return { category: "active", label: "Active", code: "active" };
  return { category: "inactive", label: "Inactive", code: "inactive" };
}
