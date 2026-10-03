"use client";

import { useMembership } from "@/lib/membership";
import { tierBadge, displayTier } from "@/lib/server/plans";
import TierIcon from "./TierIcon";

// Shared member tier badge + host pill. The tier badge comes from plans.js
// (the single source of truth) and renders a lucide glyph: sparkles for
// Flirting, a crown for Hooking Up, a gem for Moving In. An optional "OWNER" /
// "HOST" pill follows for owners/moderators/scoped hosts.
//
// plan      — member's plan key ("flirting" | "hooking-up" | "moving-in");
//             falls back to the shared (cached) MembershipProvider when omitted
// role      — "owner" | "moderator" | "host" | "member"
// isHost    — explicit host flag (scoped hosts) when role is not enough
// size      — base font size in px
// tooltip   — show a title attribute describing the tier
// showHost  — set false to render the tier badge only (e.g. when the caller
//             already renders its own role pill)
export default function MemberBadge({
  plan,
  role,
  isHost = false,
  size = 14,
  tooltip = true,
  showHost = true,
}) {
  const { membership } = useMembership();
  // displayTier applies the shared role-over-plan precedence; the membership
  // provider's resolved tier is the fallback when the plan prop is omitted.
  const resolvedPlan = displayTier(plan || membership?.planKey, role);
  const resolvedRole = role || membership?.role || "member";
  const badge = tierBadge(resolvedPlan);
  const showTier = Boolean(badge);
  const showHostPill =
    showHost &&
    (isHost || resolvedRole === "owner" || resolvedRole === "moderator" || resolvedRole === "host");

  if (!showTier && !showHostPill) return null;

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
          <TierIcon name={badge.icon} size={size} />
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
      {showHostPill && (
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
