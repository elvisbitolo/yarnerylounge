"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./dashboard.module.css";

function useDashboardResource(url, key) {
  const [value, setValue] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch(url, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Request failed");
        return response.json();
      })
      .then((data) => { if (active) setValue(data?.[key] ?? data); })
      .catch(() => { if (active) setValue(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url, key]);
  return { value, loading };
}

function DashboardCard({ title, href, linkLabel, children }) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{title}</h2>
        {href ? <Link className={styles.cardLink} href={href}>{linkLabel || "View all"} →</Link> : null}
      </div>
      {children}
    </section>
  );
}

function relativeTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}


function formatVideoDuration(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function DashboardFeaturedVideos() {
  const { value, loading } = useDashboardResource("/api/recordings?limit=5&thumbnails=1", "data");
  const videos = Array.isArray(value)
    ? value.filter((recording) => recording.status === "ready").slice(0, 4)
    : [];
  const featured = videos[0];
  const recent = videos.slice(1);

  return (
    <section className={styles.videoSection} aria-labelledby="dashboard-videos-title">
      <div className={styles.videoSectionHeader}>
        <div>
          <p className={styles.videoEyebrow}>WATCH · DISCOVER · RECONNECT</p>
          <h2 className={styles.videoSectionTitle} id="dashboard-videos-title">Videos from the lounge</h2>
          <p className={styles.videoSectionDescription}>Catch up on moments and conversations shared by the community.</p>
        </div>
        <Link className={styles.videoViewAll} href="/recordings">View all videos <span aria-hidden="true">→</span></Link>
      </div>

      {loading ? (
        <div className={styles.videoLoading} aria-live="polite">Loading community videos…</div>
      ) : featured ? (
        <>
          <div className={styles.videoFeatured}>
            <Link className={styles.videoFeaturedMedia} href={`/recordings?rec=${encodeURIComponent(featured.id)}`} aria-label={`Watch ${featured.title || "featured recording"}`}>
              {featured.thumbnailUrl ? (
                <img src={featured.thumbnailUrl} alt="" loading="lazy" />
              ) : (
                <span className={styles.videoPosterFallback} aria-hidden="true">
                  <svg viewBox="0 0 48 48" fill="none"><rect x="5" y="9" width="38" height="30" rx="7" stroke="currentColor" strokeWidth="1.8"/><path d="m21 17 11 7-11 7V17Z" fill="currentColor"/></svg>
                </span>
              )}
              <span className={styles.videoPlayButton} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.8c0-.8.9-1.3 1.6-.9l10 6.2a1 1 0 0 1 0 1.7l-10 6.2c-.7.4-1.6-.1-1.6-.9V5.8Z"/></svg>
              </span>
              {featured.durationSec ? <span className={styles.videoDuration}>{formatVideoDuration(featured.durationSec)}</span> : null}
            </Link>
            <div className={styles.videoFeaturedCopy}>
              <span className={styles.videoFeaturedLabel}>LATEST RECORDING</span>
              <h3>{featured.title || "A moment from the lounge"}</h3>
              <p>{featured.roomName || "Christa’s Speakeasy"}{featured.startedAt ? ` · ${relativeTime(featured.startedAt)}` : ""}</p>
              <Link className={styles.videoWatchButton} href={`/recordings?rec=${encodeURIComponent(featured.id)}`}>
                <span aria-hidden="true">▶</span> Watch video
              </Link>
            </div>
          </div>

          {recent.length > 0 ? (
            <div className={styles.videoRecentBlock}>
              <h3 className={styles.videoRecentTitle}>Recently added</h3>
              <div className={styles.videoRail}>
                {recent.map((recording) => (
                  <Link className={styles.videoTile} href={`/recordings?rec=${encodeURIComponent(recording.id)}`} key={recording.id}>
                    <span className={styles.videoTileMedia}>
                      {recording.thumbnailUrl ? <img src={recording.thumbnailUrl} alt="" loading="lazy" /> : <span className={styles.videoTileFallback} aria-hidden="true">▶</span>}
                      {recording.durationSec ? <span className={styles.videoDuration}>{formatVideoDuration(recording.durationSec)}</span> : null}
                    </span>
                    <strong>{recording.title || "Lounge recording"}</strong>
                    <span>{recording.roomName || "Community recording"}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className={styles.videoEmpty}>
          <span className={styles.videoEmptyIcon} aria-hidden="true">▶</span>
          <div>
            <strong>The next community moment will appear here.</strong>
            <p>Explore the recordings library to see what has already been shared.</p>
          </div>
          <Link href="/recordings">Explore recordings →</Link>
        </div>
      )}
    </section>
  );
}

export function DashboardCommunityFeed() {
  const { value, loading } = useDashboardResource("/api/posts?limit=5", "posts");
  const posts = Array.isArray(value) ? value.slice(0, 5) : [];
  return (
    <DashboardCard title="Latest from your community" href="/feed" linkLabel="Open feed">
      {loading ? <p className={styles.itemBody}>Loading recent posts…</p> : posts.length ? (
        <ul className={styles.list}>
          {posts.map((post) => {
            const authorName = post.authorName || "Community member";
            const initials = authorName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "M";
            const profileHref = post.authorId ? `/members/${encodeURIComponent(post.authorId)}` : "/members";
            return (
              <li key={post.id}>
                <div className={styles.item}>
                  <div className={styles.communityPostHeader}>
                    <Link className={styles.communityPostAuthor} href={profileHref} aria-label={`View ${authorName}'s profile`}>
                      {post.authorPhotoUrl ? (
                        <img className={styles.communityPostAvatar} src={post.authorPhotoUrl} alt="" loading="lazy" />
                      ) : (
                        <span className={styles.communityPostAvatarFallback} aria-hidden="true">{initials}</span>
                      )}
                      <span className={styles.itemTitle}>{authorName}</span>
                    </Link>
                    <span className={styles.itemMeta}>{relativeTime(post.createdAt)}</span>
                  </div>
                  <Link className={styles.communityPostContent} href="/feed">
                    {post.title ? <strong className={styles.itemTitle}>{post.title}</strong> : null}
                    <span className={styles.itemBody}>{(post.text || post.excerpt || "Shared a community update").slice(0, 180)}</span>
                    <span className={styles.itemMeta}>{Object.keys(post.likes || {}).length} likes · {post.commentCount || 0} comments</span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className={styles.itemBody}>No recent posts to show yet. Be the first to start a conversation.</p>}
    </DashboardCard>
  );
}

export function DashboardActivityPreview() {
  const { value, loading } = useDashboardResource("/api/notifications?preview=1", "notifications");
  const notifications = Array.isArray(value) ? value.slice(0, 5) : [];
  return (
    <DashboardCard title="Your recent activity" href="/notifications" linkLabel="All activity">
      {loading ? <p className={styles.itemBody}>Checking your activity…</p> : notifications.length ? (
        <ul className={styles.list}>
          {notifications.map((item) => {
            const href = typeof item.href === "string" && item.href.startsWith("/") ? item.href : "/notifications";
            const actorName = item.actorName || "Yarnery Lounge";
            const initials = actorName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "Y";
            const profileHref = item.actorId ? `/members/${encodeURIComponent(item.actorId)}` : null;
            const avatar = item.actorPhotoUrl ? (
              <img className={styles.activityAvatar} src={item.actorPhotoUrl} alt="" loading="lazy" />
            ) : profileHref ? (
              <span className={styles.activityAvatarFallback} aria-hidden="true">{initials}</span>
            ) : (
              <span className={styles.activitySystemAvatar} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 3.5 14 8l4.5 2-4.5 2-2 4.5L10 12l-4.5-2L10 8l2-4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" fill="currentColor" />
                </svg>
              </span>
            );
            return (
              <li key={item.id}>
                <div className={styles.activityItem}>
                  {profileHref ? (
                    <Link className={styles.activityActor} href={profileHref} aria-label={`View ${actorName}'s profile`}>
                      {avatar}
                      <span className={styles.itemTitle}>{actorName}</span>
                    </Link>
                  ) : (
                    <span className={styles.activityActor}>
                      {avatar}
                      <span className={styles.itemTitle}>{actorName}</span>
                    </span>
                  )}
                  <span className={styles.itemMeta}>{relativeTime(item.createdAt)}</span>
                  <Link className={styles.activityContent} href={href}>
                    <span className={styles.itemBody}>{item.text || "You have a new community notification."}</span>
                    {!item.read ? <span className={styles.activityUnread}>New</span> : null}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className={styles.itemBody}>You&apos;re all caught up. New likes, replies and mentions will appear here.</p>}
    </DashboardCard>
  );
}

export function DashboardMemberDiscovery() {
  const { value, loading } = useDashboardResource("/api/members/similar", "members");
  const members = Array.isArray(value) ? value.slice(0, 4) : [];
  return (
    <DashboardCard title="People you may want to meet" href="/members" linkLabel="Discover members">
      {loading ? <p className={styles.itemBody}>Finding people with shared interests…</p> : members.length ? (
        <div className={styles.memberSuggestions}>
          {members.map((member) => (
            <Link className={styles.memberSuggestion} href={`/members/${encodeURIComponent(member.id)}`} key={member.id}>
              {member.photoURL ? <img src={member.photoURL} alt="" /> : <span className={styles.memberAvatar}>{(member.name || "M").slice(0, 1).toUpperCase()}</span>}
              <span className={styles.memberSuggestionText}>
                <strong>{member.name}</strong>
                <span>{member.headline || member.country || "Yarnery member"}</span>
                {member.score ? <small>{member.score}% profile match</small> : null}
              </span>
            </Link>
          ))}
        </div>
      ) : <p className={styles.itemBody}>Complete your profile and interests to help us find good connections.</p>}
    </DashboardCard>
  );
}

export function DashboardMembershipCard() {
  const { value, loading } = useDashboardResource("/api/membership/me", "membership");
  const membership = value && typeof value === "object" ? value : null;
  return (
    <DashboardCard title="Your membership" href="/membership" linkLabel="View benefits">
      {loading ? <p className={styles.itemBody}>Loading membership…</p> : membership ? (
        <>
          <div className={styles.membershipSummary}>
            <span className={styles.membershipBadge}>{membership.label || membership.planKey || "Flirting"}</span>
            <span className={styles.itemMeta}>Current plan</span>
          </div>
          {membership.expiresAt ? (
            <p className={styles.itemBody}>
              {membership.daysRemaining === 0
                ? "Your membership has reached its expiry date."
                : "Expires on " + new Date(membership.expiresAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) + " · " + membership.daysRemaining + " day(s) remaining."}
            </p>
          ) : (
            <p className={styles.itemBody}>Your current membership benefits and plan options are available here.</p>
          )}
          <Link className={styles.spotCta} href="/membership">Manage membership</Link>
        </>
      ) : <p className={styles.itemBody}>Membership details are temporarily unavailable.</p>}
    </DashboardCard>
  );
}
