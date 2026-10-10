"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./match.module.css";
import DailyMatchCard from "./DailyMatchCard";
import SimilarMembersCard from "./SimilarMembersCard";
import SkillLevelCard from "./SkillLevelCard";

export default function MatchDashboard() {
  const [dailyMatch, setDailyMatch] = useState(null);
  const [similarMembers, setSimilarMembers] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [similarLoading, setSimilarLoading] = useState(true);
  const [dailyError, setDailyError] = useState("");
  const [similarError, setSimilarError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadMatches() {
      const blindPromise = (async () => {
        try {
          const blindRes = await fetch("/api/members/blind-date");
          if (!blindRes.ok) {
            throw new Error("blind date failed");
          }
          const blindData = await blindRes.json();
          if (!cancelled) {
            setDailyMatch(blindData.member || null);
          }
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
  }, []);

  useEffect(() => {
    if (!dailyMatch?.expiresAt) return undefined;
    const expiresAt = new Date(dailyMatch.expiresAt).getTime();
    const delay = Math.max(0, expiresAt - Date.now()) + 1000;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/members/blind-date", { cache: "no-store" });
        if (!response.ok) throw new Error("blind date refresh failed");
        const data = await response.json();
        setDailyMatch(data.member || null);
      } catch {
        setDailyError("Could not load today's match. Try again later.");
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [dailyMatch]);

  const topMatches = useMemo(() => similarMembers.slice(0, 8), [similarMembers]);

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
