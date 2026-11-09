export const PENDING_SECTIONS = [
  { href: "/admin/recordings", label: "Recordings", guard: "moderator" },
  { href: "/admin/music", label: "Music library", guard: "moderator" },
];

export const ADMIN_SECTIONS = [
  { label: "Overview", items: [
    { href: "/admin", label: "Dashboard", guard: "owner", basis: "/api/admin/overview -> requireOwner()" },
    { href: "/admin/content", label: "All content", guard: "moderator", isNew: true, basis: "new unified index" },
    { href: "/admin/audit", label: "Audit log", guard: "owner", isNew: true, basis: "AuditLog exposes actor ids" },
  ] },
  { label: "Community", items: [
    { href: "/admin/members", label: "Members", guard: "moderator", basis: "/api/admin/members -> requireModerator()" },
    { href: "/admin/moderation", label: "Moderation", guard: "moderator", basis: "/api/admin/reports -> canModerate()" },
    { href: "/admin/groups", label: "Groups", guard: "owner", basis: "/api/groups/[id] PATCH/DELETE -> requireOwner(); admin group management is owner-only" },
    { href: "/admin/hosts", label: "Hosts", guard: "moderator", basis: "/api/admin/host-assignments -> requireModerator()" },
    { href: "/admin/spaces", label: "Spaces", guard: "owner", basis: "/api/spaces POST and admin listing -> requireOwner()" },
  ] },
  { label: "Editorial", items: [
    { href: "/admin/announcements", label: "Announcements", guard: "moderator", basis: "/api/admin/announcements -> requireModerator()" },
    { href: "/admin/articles", label: "Articles", guard: "moderator", isNew: true, basis: "/api/admin/content/article -> moderator policy" },
    { href: "/admin/collections", label: "Collections", guard: "owner", basis: "/api/admin/collections -> requireOwner()" },
  ] },
  { label: "Live", items: [
    { href: "/admin/rooms", label: "Lounges", guard: "moderator", basis: "/api/rooms POST -> staff or scoped host/Moving In capability; admin member data -> requireModerator()" },
    { href: "/admin/events", label: "Events", guard: "moderator", basis: "/api/events POST -> canModerate() or scoped host rights" },
  ] },
  { label: "Learning", items: [
    { href: "/admin/courses", label: "Courses", guard: "moderator", basis: "/api/courses POST -> canModerate() or scoped host rights" },
    { href: "/admin/questions", label: "Questions", guard: "owner", basis: "/api/admin/questions -> requireOwner()" },
  ] },
  { label: "System", items: [
    { href: "/admin/automations", label: "Automations", guard: "owner", basis: "/api/admin/automations -> requireOwner()" },
    { href: "/admin/re-engagement", label: "Member reactivation", guard: "moderator", isNew: true, basis: "/api/admin/re-engagement/analytics -> canModerate()" },
    { href: "/admin/analytics", label: "Analytics", guard: "owner", basis: "/api/admin/analytics -> requireOwner()" },
    { href: "/admin/settings", label: "Settings", guard: "owner", basis: "/api/admin/settings -> requireOwner()" },
  ] },
];

const RANK = { member: 0, moderator: 1, owner: 2 };
const REQUIRED = { moderator: RANK.moderator, owner: RANK.owner };

function rankOf(role) {
  return Object.hasOwn(RANK, role) ? RANK[role] : RANK.member;
}

export function sectionsForRole(role) {
  const rank = rankOf(role);
  return ADMIN_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => rank >= REQUIRED[item.guard]),
  })).filter((section) => section.items.length > 0);
}

export function canSee(href, role) {
  const rank = rankOf(role);
  for (const section of ADMIN_SECTIONS) {
    const item = section.items.find((i) => i.href === href);
    if (item) return rank >= REQUIRED[item.guard];
  }
  return rank >= RANK.owner;
}

export function guardFor(href) {
  for (const section of ADMIN_SECTIONS) {
    const item = section.items.find((i) => i.href === href);
    if (item) return item.guard;
  }
  return "owner";
}
