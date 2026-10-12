"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./FollowButton.module.css";

export default function FollowButton({
  targetUserId,
  targetName = "Member",
  initialFollowing,
  initialFollowerCount,
  initialFollowingCount,
  isSelf,
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(Boolean(initialFollowing));
  const [followerCount, setFollowerCount] = useState(Number(initialFollowerCount) || 0);
  const [followingCount, setFollowingCount] = useState(Number(initialFollowingCount) || 0);
  const [busy, setBusy] = useState(false);
  const [listType, setListType] = useState("");
  const [listMembers, setListMembers] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [listTruncated, setListTruncated] = useState(false);

  useEffect(() => {
    if (isSelf) return;
    let active = true;
    fetch(`/api/members/${targetUserId}/follow`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setFollowing(Boolean(data.following));
        setFollowerCount(Number(data.followerCount) || 0);
        setFollowingCount(Number(data.followingCount) || 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [targetUserId, isSelf]);

  useEffect(() => {
    if (!listType) return undefined;
    let active = true;
    fetch(`/api/members/${targetUserId}/follow?list=${listType}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Member list request failed"))))
      .then((data) => {
        if (!active) return;
        setListMembers(Array.isArray(data.members) ? data.members : []);
        setListTruncated(Boolean(data.truncated));
        setListLoading(false);
      })
      .catch(() => {
        if (active) {
          setListError("Could not load this list. Please try again.");
          setListLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [listType, targetUserId]);

  useEffect(() => {
    if (!listType) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setListType("");
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [listType]);

  function openList(type) {
    setListMembers([]);
    setListTruncated(false);
    setListError("");
    setListLoading(true);
    setListType(type);
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/members/${targetUserId}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: following ? "unfollow" : "follow" }),
      });
      if (res.ok) {
        const data = await res.json();
        setFollowing(Boolean(data.following));
        setFollowerCount(Number(data.followerCount) || 0);
        setFollowingCount(Number(data.followingCount) || 0);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <div className={styles.followStats}>
      {!isSelf && (
        <button
          onClick={toggle}
          disabled={busy}
          style={{
            height: 36,
            padding: "0 20px",
            borderRadius: 999,
            border: following ? "1px solid var(--primary, #f42e79)" : "none",
            background: following ? "#ffffff" : "var(--primary, #f42e79)",
            color: following ? "var(--primary, #f42e79)" : "#ffffff",
            fontSize: 13,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
            transition: "all 0.15s ease",
          }}
        >
          {busy ? "..." : following ? "Following" : "Follow"}
        </button>
      )}
      <button
        type="button"
        className={styles.listCount}
        onClick={() => openList("followers")}
        aria-label={`View ${followerCount} followers of ${targetName}`}
      >
        {followerCount} {followerCount === 1 ? "follower" : "followers"}
      </button>
      <button
        type="button"
        className={styles.listCount}
        onClick={() => openList("following")}
        aria-label={`View ${followingCount} people followed by ${targetName}`}
      >
        {followingCount} following
      </button>
    </div>
    {listType && (
      <div className={styles.overlay} onClick={() => setListType("")} role="presentation">
        <section
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="follow-list-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className={styles.dialogHeader}>
            <h2 id="follow-list-title">
              {listType === "followers" ? "Followers" : "Following"}
            </h2>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setListType("")}
              aria-label="Close list"
            >
              ×
            </button>
          </header>
          <div className={styles.listBody} aria-live="polite">
            {listLoading ? (
              <p className={styles.listMessage}>Loading members…</p>
            ) : listError ? (
              <p className={styles.listMessage} role="alert">{listError}</p>
            ) : listMembers.length === 0 ? (
              <p className={styles.listMessage}>
                {listType === "followers" ? "No visible followers yet." : "Not following anyone yet."}
              </p>
            ) : (
              <ul className={styles.memberList}>
                {listMembers.map((member) => (
                  <li key={member.id}>
                    <Link
                      href={`/members/${member.id}`}
                      className={styles.memberLink}
                      onClick={() => setListType("")}
                    >
                      {member.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={member.photoURL} alt="" className={styles.memberAvatar} />
                      ) : (
                        <span className={styles.memberAvatarFallback} aria-hidden="true">
                          {(member.name || "?").trim().charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className={styles.memberIdentity}>
                        <strong>{member.name}</strong>
                        {member.username && <small>@{member.username}</small>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {listTruncated && !listLoading && (
              <p className={styles.listFootnote}>Showing the 100 most recent members.</p>
            )}
          </div>
        </section>
      </div>
    )}
    </>
  );
}
