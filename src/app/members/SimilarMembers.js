"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, UsersRound } from "lucide-react";
import { composeLayout } from "./avatarLayout";
import styles from "./members.module.css";

const MINI_CANVAS = { width: 560, height: 200 };
const MINI_MAX = 14;

export default function SimilarMembers() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const frameRef = useRef(null);
  const [frameWidth, setFrameWidth] = useState(0);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setFrameWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, members.length]);

  useEffect(() => {
    let active = true;
    fetch("/api/members/similar")
      .then((r) => {
        if (!r.ok) throw new Error("Could not load similar members");
        return r.json();
      })
      .then((data) => {
        if (active && data) setMembers(Array.isArray(data.members) ? data.members : []);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const placed = useMemo(
    () =>
      composeLayout(
        members.slice(0, MINI_MAX).map((m) => ({ id: m.id, points: 0 })),
        {
          width: MINI_CANVAS.width,
          height: MINI_CANVAS.height,
          minSize: 46,
          maxSize: 46,
          margin: 40,
          jitter: 16,
        }
      ),
    [members]
  );

  const scale = frameWidth > 0 ? frameWidth / MINI_CANVAS.width : 0;
  const frameHeight = Math.round(MINI_CANVAS.height * Math.max(scale, 1));

  return (
    <section className={styles.similarSection} aria-labelledby="similar-members-title">
      <h2 className={styles.similarTitle} id="similar-members-title">
        <span className={styles.similarTitleIcon} aria-hidden="true">
          <UsersRound size={19} />
        </span>
        <span>Members like you</span>
        <Sparkles className={styles.similarSparkle} size={17} aria-hidden="true" />
      </h2>

      {loading ? (
        <div className={styles.similarLoading}>Finding members who share your interests…</div>
      ) : loadFailed ? (
        <div className={styles.similarEmpty} role="status">
          <p>We couldn’t load recommendations right now. Please try again in a moment.</p>
        </div>
      ) : members.length === 0 ? (
        <div className={styles.similarEmpty}>
          <span className={styles.similarEmptyIcon} aria-hidden="true">
            <UsersRound size={23} />
          </span>
          <p>We don’t have a close match to show just yet.</p>
          <p className={styles.similarHint}>
            Add your crafts, hobbies, project types, or community goals to your profile to help us find people who share your interests.
          </p>
        </div>
      ) : (
        <div className={styles.similarCanvas}>
          <div
            className={styles.canvasFrame}
            ref={frameRef}
            style={{ height: frameHeight }}
          >
            <span className={styles.canvasGlow} aria-hidden="true" />
            {scale > 0 && (
              <div
                className={styles.canvasLayer}
                style={{
                  width: MINI_CANVAS.width,
                  height: MINI_CANVAS.height,
                  transform: `scale(${scale})`,
                }}
              >
                {placed.map((slot, idx) => {
                  const member = members.find((m) => m.id === slot.id);
                  if (!member) return null;
                  return (
                    <Link
                      key={member.id}
                      href={`/members/${member.id}`}
                      className={styles.avatarPos}
                      style={{
                        left: slot.left,
                        top: slot.top,
                        width: slot.size,
                        height: slot.size,
                        zIndex: 10 + idx,
                      }}
                      title={`${member.name} · ${member.score}% match`}
                      aria-label={`View ${member.name}`}
                    >
                      <span className={styles.ring}>
                        <span className={styles.circle}>
                          {member.photoURL ? (
                            <img
                              className={styles.circleImage}
                              src={member.photoURL}
                              alt={member.name}
                            />
                          ) : (
                            (member.name || "?").slice(0, 1).toUpperCase()
                          )}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
