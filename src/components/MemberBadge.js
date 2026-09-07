"use client";

import { useMembership } from "@/lib/membership";

const TIER_BADGES = {
  "hooking-up": { icon: "👑", color: "#d4a017", label: "Hooking Up" },
  "moving-in": { icon: "💎", color: "#3b82f6", label: "Moving In" },
};

// Shared member tier badge + host pill. Renders a small icon/dot by tier
// (crown for hooking-up, diamond for moving-in) and an optional "HOST" pill
// for owners/moderators/scoped hosts.
//
// plan    — member's plan key ("flirting" | "hooking-up" | "moving-in");
//           falls back to the shared (cached) MembershipProvider when omitted
// role    — "owner" | "moderator" | "host" | "member"
// isHost  — explicit host flag (scoped hosts) when role is not enough
// size    — base font size in px
// tooltip — show a title attribute describing the tier
export default function MemberBadge({ plan, role, isHost = false, size = 14, tooltip = true }) {
  const { membership } = useMembership();
  const resolvedPlan = plan || membership?.planKey || "flirting";
  const resolvedRole = role || membership?.role || "member";
  const badge = TIER_BADGES[resolvedPlan];
  const showTier = badge && resolvedPlan !== "flirting";
  const showHost =
    isHost || resolvedRole === "owner" || resolvedRole === "moderator" || resolvedRole === "host";

  if (!showTier && !showHost) return null;

  const hostLabel = resolvedRole === "owner" ? "OWNER" : "HOST";
  const hostColor = resolvedRole === "owner" ? "#f5b301" : "#e91e63";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle" }}>
      {showTier && (
        <span
          title={tooltip ? `${badge.label} member` : undefined}
          style={{
            fontSize: size,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            color: badge.color,
          }}
        >
          <span>{badge.icon}</span>
          <span
            style={{
              display: "inline-block",
              width: size * 0.32,
              height: size * 0.32,
              borderRadius: "50%",
              background: badge.color,
              boxShadow: `0 0 6px ${badge.color}88`,
              opacity: 0.9,
            }}
          />
        </span>
      )}
      {showHost && (
        <span
          title={tooltip ? hostLabel : undefined}
          style={{
            fontSize: Math.max(10, size - 4),
            lineHeight: 1,
            fontWeight: 700,
            letterSpacing: 0.4,
            color: hostColor,
            border: `1px solid ${hostColor}66`,
            borderRadius: 999,
            padding: "2px 6px",
            background: `${hostColor}1a`,
            whiteSpace: "nowrap",
          }}
        >
          {hostLabel}
        </span>
      )}
    </span>
  );
}