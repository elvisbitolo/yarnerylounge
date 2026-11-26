export function roleBadgeLabel(role, custom) {
  if (custom && String(custom).trim()) {
    return String(custom).trim().slice(0, 20);
  }
  if (role === "owner") return "Owner";
  if (role === "moderator") return "Moderator";
  if (role === "host") return "Host";
  return "Member";
}