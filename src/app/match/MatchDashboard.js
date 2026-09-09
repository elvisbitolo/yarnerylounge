"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./match.module.css";
import DailyMatchCard from "./DailyMatchCard";
import SimilarMembersCard from "./SimilarMembersCard";
import SkillLevelCard from "./SkillLevelCard";

export default function MatchDashboard({ matchmakerEnabled }) {
  const [dailyMatch, setDailyMatch] = useState(null);
  const [similarMembers, setSimilarMembers] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [similarLoading, setSimilarLoading] = useState(true);
  const [dailyError, setDailyError] = useState("");
  const [similarError, setSimilarError] = useState("");

  useEffect(() => {
    if (!matchmakerEnabled) {
      setDailyLoading(false);
      setSimilarLoading(false);
      return;
    }
    let cancelled = false;
    async function loadMatches() {
      const blindPromise = (async () => {
        try {
          const blindRes = await fetch("/api/members/blind-date");
          if (!blindRes.ok) {
            if (blindRes.status === 403) return;
            throw new Error("blind date failed");
          }
          const blindData = await blindRes.json();
          if (!cancelled && blindData.member) setDailyMatch(blindData.member);
        } catch {
          if (!cancelled) setDailyError("Could not load today's match. Try again later.");
        } finally {
          if (!cancelled) setDailyLoading(false);
        }
      })();
      const similarPromise = (async () => {
        try {
          const similarRes = await fetch("/api/members/similar");
          if (!similarRes.ok) throw new Error("similar failed");
          const similarData = await similarRes.json();
          if (!cancelled && Array.isArray(similarData.members)) setSimilarMembers(similarData.members);
        } catch {
          if (!cancelled) setSimilarError("Could not load similar members. Try again later.");
        } finally {
          if (!cancelled) setSimilarLoading(false);
        }
      })();
      await Promise.all([blindPromise, similarPromise]);
    }
    loadMatches();
    return () => {
      cancelled = true;
    };
  }, [matchmakerEnabled]);

  const topMatches = useMemo(() => similarMembers.slice(0, 8), [similarMembers]);


  if (!matchmakerEnabled) {
    return (
      <div className={styles.lockState}>
        <div className={styles.lockIcon}>🔒</div>
        <h2 className={styles.lockTitle}>Matchmaker is for premium members</h2>
        <p className={styles.lockDesc}>
          Upgrade to Hooking Up or Moving In to unlock fiber matchmaking,
          daily blind dates, and similar member discovery.
        </p>
        <Link href="/membership" className={styles.upgradeBtn}>
          Explore membership tiers
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <DailyMatchCard
        dailyMatch={dailyMatch}
        dailyLoading={dailyLoading}
        dailyError={dailyError}
      />
      <SimilarMembersCard
        similarMembers={similarMembers}
        topMatches={topMatches}
        similarLoading={similarLoading}
        similarError={similarError}
      />
      <SkillLevelCard />
    </div>
  );
}
