// Per-kind authorization for the generic admin content editor.
//
// /api/admin/content/[kind]/[id] originally called requireModerator() and
// nothing else, which handed every moderator write access to every record of
// every kind. That is strictly broader than the screens the editor sits behind:
//
//   /admin/questions  -> wrapped in <RequireOwner>, i.e. owner only
//   /api/events/[id]   -> deliberately canManageScope(), so a host may only
//                         edit their own event
//   /api/groups/[id]   -> owner-only delete
//
// So a moderator could edit questions through the generic route that the
// questions page deliberately hides from them, and could edit any event that
// /api/events/[id] refuses. Each kind now carries the guard its own screen
// already promised (see PENDING_SECTIONS/ADMIN_SECTIONS in lib/admin/nav.js).
//
// Pure and dependency-free so it is unit-testable with node:test; the route
// supplies the role and scope facts.

export const CONTENT_POLICY = {
  // Owner only: /admin/questions is wrapped in RequireOwner.
  question: "owner",

  // Staff, or the host of this specific event. Mirrors canManageScope(),
  // which is isStaff || isHost - so /api/events/[id] and this route agree.
  event: "scope:event",

  // Moderator-level staff. Matches the moderator guard on /admin/groups,
  // /admin/rooms, /admin/spaces, /admin/announcements and /admin/courses.
  group: "moderator",
  article: "moderator",
  lesson: "moderator",
  module: "moderator",
  announcement: "moderator",
  room: "moderator",
  space: "moderator",
};

export const STAFF_ROLES = ["owner", "moderator"];

export function isStaffRole(role) {
  return STAFF_ROLES.includes(String(role || "").trim().toLowerCase());
}

// Returns { allowed: true, reason } or { allowed: false, reason, status }.
// `isHost` should only be supplied for scope-scoped kinds, and must reflect
// authority over the record in question, not a global role.
export function evaluateContentPolicy({ kind, role, isHost = false } = {}) {
  const policy = CONTENT_POLICY[kind];

  if (!policy) {
    return { allowed: false, reason: "unknown-kind", status: 400 };
  }

  if (policy === "owner") {
    if (String(role || "").trim().toLowerCase() === "owner") {
      return { allowed: true, reason: "owner" };
    }
    return { allowed: false, reason: "owner-required", status: 403 };
  }

  if (policy === "scope:event") {
    // Staff first, matching canManageScope()'s isStaff || isHost ordering.
    if (isStaffRole(role)) {
      return { allowed: true, reason: "staff" };
    }
    if (isHost) {
      return { allowed: true, reason: "event-host" };
    }
    return { allowed: false, reason: "event-host-or-staff-required", status: 403 };
  }

  if (isStaffRole(role)) {
    return { allowed: true, reason: "staff" };
  }
  return { allowed: false, reason: "moderator-required", status: 403 };
}