"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cardThemeVars } from "@/lib/card-themes";
import styles from "./spaces.module.css";
import { MessageCircle, MessageSquareText, Users, Calendar, GraduationCap, Radio } from "lucide-react";

const SPACE_THEMES = ["indigo", "violet", "teal", "amber", "sky", "emerald", "rose", "fuchsia"];

const FEATURE_ICONS = {
  feed: MessageCircle,
  chat: MessageSquareText,
  members: Users,
  events: Calendar,
  courses: GraduationCap,
  live: Radio,
};

export default function SpacesBoard({ spaces, uid }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function handleJoin(spaceId) {
    if (!uid) return;
    setBusyId(spaceId);
    setError("");
    try {
      const res = await fetch(`/api/spaces/${spaceId}/join`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to join space");
      }
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  const enabledFeatures = (features) =>
    Object.entries(features || {})
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);

  return (
    <div>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.grid}>
        {spaces.map((space, i) => {
          const features = enabledFeatures(space.features);
          return (
            <div
              key={space.id}
              className={styles.card}
              style={cardThemeVars(SPACE_THEMES[i % SPACE_THEMES.length], { light: true })}
            >
              <div className={styles.cardBody}>
                <Link className={styles.cardLink} href={`/spaces/${space.slug}`}>
                  <h2 className={styles.cardTitle}>{space.name}</h2>
                </Link>
                {space.description && <p className={styles.cardDesc}>{space.description}</p>}
                <p className={styles.cardMeta}>
                  {space.memberCount} {space.memberCount === 1 ? "member" : "members"}
                  {space.purchasePriceCents > 0 && (
                    <span className={styles.priceBadge}>
                      ${(space.purchasePriceCents / 100).toFixed(2)}
                    </span>
                  )}
                  <span className={styles.accessBadge}>
                    {space.access === "public"
                      ? "Public"
                      : space.access === "private"
                      ? "Private"
                      : "Invite only"}
                    {space.requiredTier === "premium" ? " · Premium" : ""}
                  </span>
                </p>
                {features.length > 0 && (
                  <p className={styles.featureChips}>
                    {features.map((feature) => {
                      const Icon = FEATURE_ICONS[feature];
                      return (
                        <span key={feature} className={styles.featureChip}>
                          {Icon ? <Icon size={13} /> : null} {feature}
                        </span>
                      );
                    })}
                  </p>
                )}
              </div>
              {space.purchasePriceCents > 0 && !space.purchased ? (
                <span className={styles.join} title="Access included with your membership">Included</span>
              ) : (
                <button
                  className={space.joined ? `${styles.join} ${styles.joinActive}` : styles.join}
                  onClick={() => handleJoin(space.id)}
                  disabled={!!busyId}
                >
                  {busyId === space.id ? "Saving…" : space.joined ? "Joined ✓" : "Join space"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
