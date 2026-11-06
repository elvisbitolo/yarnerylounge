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


export function DashboardProfileCompletion({ photoURL, username }) {
  const missingPhoto = !String(photoURL || "").trim();
  const missingUsername = !String(username || "").trim();
  const missingCount = Number(missingPhoto) + Number(missingUsername);

  if (!missingCount) return null;

  return (
    <section className={styles.profileCompletionCard} aria-labelledby="profile-completion-title">
      <div className={styles.profileCompletionHeader}>
        <div>
          <p className={styles.profileCompletionEyebrow}>MAKE YOUR PROFILE COUNT</p>
          <h2 id="profile-completion-title">Help the community recognise you</h2>
          <p className={styles.profileCompletionDescription}>
            A profile photo helps members recognise you, while a username makes you easier to find and mention.
          </p>
        </div>
        <span className={styles.profileCompletionCount}>
          {missingCount} {missingCount === 1 ? "step" : "steps"} left
        </span>
      </div>

      <div className={styles.profileCompletionItems}>
        {missingPhoto ? (
          <div className={styles.profileCompletionItem}>
            <span className={styles.profileCompletionIcon} aria-hidden="true">01</span>
            <div className={styles.profileCompletionCopy}>
              <strong>Add a profile photo</strong>
              <span>Put a face to your name so people know who they are connecting with.</span>
            </div>
            <Link className={styles.profileCompletionAction} href="/account/profile#profile">Add photo <span aria-hidden="true">→</span></Link>
          </div>
        ) : null}
        {missingUsername ? (
          <div className={styles.profileCompletionItem}>
            <span className={styles.profileCompletionIcon} aria-hidden="true">02</span>
            <div className={styles.profileCompletionCopy}>
              <strong>Choose your username</strong>
              <span>Give your profile a memorable handle members can search for and mention.</span>
            </div>
            <Link className={styles.profileCompletionAction} href="/account/settings">Choose username <span aria-hidden="true">→</span></Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function DashboardEngagementProgress() {
  const { value, loading } = useDashboardResource("/api/dashboard/engagement", "engagement");
  const steps = Array.isArray(value?.steps) ? value.steps : [];
  const completed = Number(value?.completed) || 0;
  const total = Number(value?.total) || steps.length;

  return (
    <section className={styles.engagementProgressCard} aria-labelledby="engagement-progress-title">
      <div className={styles.engagementProgressHeader}>
        <div>
          <p className={styles.engagementProgressEyebrow}>YOUR COMMUNITY JOURNEY</p>
          <h2 id="engagement-progress-title">Make your mark at the Speakeasy</h2>
          <p className={styles.engagementProgressDescription}>
            Small moments of participation build a stronger community. Here’s what you’ve done so far.
          </p>
        </div>
        {!loading && total > 0 ? (
          <span className={styles.engagementProgressCount}>{completed}/{total} completed</span>
        ) : null}
      </div>
      {loading ? (
        <p className={styles.itemBody}>Loading your community progress…</p>
      ) : steps.length ? (
        <>
          <div
            className={styles.engagementProgressTrack}
            role="progressbar"
            aria-label="Community engagement progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
          >
            <span style={{ width: `${Number(value?.percentage) || 0}%` }} />
          </div>
          <div className={styles.engagementProgressSteps}>
            {steps.map((step) => (
              <Link
                className={`${styles.engagementProgressStep} ${step.done ? styles.engagementProgressStepDone : ""}`}
                href={step.href}
                key={step.id}
              >
                <span className={styles.engagementProgressCheck} aria-hidden="true">{step.done ? "✓" : "＋"}</span>
                <span className={styles.engagementProgressStepCopy}>
                  <strong>{step.label}</strong>
                  <span>{step.detail}</span>
                </span>
                <span className={styles.engagementProgressStepState}>{step.done ? "Done" : "Explore"}</span>
              </Link>
            ))}
          </div>
          {completed === total ? (
            <p className={styles.engagementProgressComplete}>You’re making the most of the community. Keep connecting and creating.</p>
          ) : null}
        </>
      ) : (
        <p className={styles.itemBody}>Your community progress is temporarily unavailable. Please try again shortly.</p>
      )}
    </section>
  );
}

export function DashboardActiveMembers() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/presence?online=1", { cache: "no-store" });
        if (!response.ok) throw new Error("Presence unavailable");
        const data = await response.json();
        if (active) {
          setMembers(Array.isArray(data.members) ? data.members : []);
          setAvailable(true);
        }
      } catch {
        if (active) setAvailable(false);
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <DashboardCard title="Active members" href="/members" linkLabel="Meet the community">
      {loading ? (
        <p className={styles.itemBody}>Checking who is around…</p>
      ) : !available ? (
        <p className={styles.itemBody}>Live member presence is temporarily unavailable.</p>
      ) : members.length ? (
        <div className={styles.activeMemberGrid}>
          {members.slice(0, 12).map((member) => {
            const name = (member.name || "Member").trim();
            const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "M";
            return (
              <Link className={styles.activeMember} href={`/members/${encodeURIComponent(member.uid)}`} key={member.uid}>
                <span className={styles.activeMemberAvatarWrap}>
                  {member.photoURL ? (
                    <img className={styles.activeMemberAvatar} src={member.photoURL} alt="" loading="lazy" />
                  ) : (
                    <span className={styles.activeMemberAvatarFallback} aria-hidden="true">{initials}</span>
                  )}
                  <span className={styles.activeMemberOnlineDot} aria-label="Online" />
                </span>
                <span className={styles.activeMemberName}>{name}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className={styles.itemBody}>No other members are online right now. Check back soon.</p>
      )}
    </DashboardCard>
  );
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


export function DashboardCommunityBuilderCard() {
  const { value: profile, loading } = useDashboardResource("/api/me", "profile");
  const tier = String(profile?.tier || profile?.plan || "").toLowerCase();
  const isMovingIn = tier === "moving-in";

  if (loading || !isMovingIn) return null;

  return (
    <section className={styles.communityBuilderCard} aria-labelledby="community-builder-title">
      <div className={styles.communityBuilderArtwork} aria-hidden="true">
        <svg viewBox="0 0 220 180" width="190" height="156" fill="none">
          <circle cx="110" cy="90" r="66" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.18)" />
          <path d="M62 94 106 54 158 94 110 132 62 94Z" fill="rgba(246,7,122,.22)" stroke="#ffabd0" strokeWidth="2" />
          <circle cx="62" cy="94" r="17" fill="#f6077a" stroke="#ffd5e7" strokeWidth="2" />
          <circle cx="106" cy="54" r="17" fill="#ff75ad" stroke="#fff" strokeWidth="2" />
          <circle cx="158" cy="94" r="17" fill="#f6077a" stroke="#ffd5e7" strokeWidth="2" />
          <circle cx="110" cy="132" r="17" fill="#ff75ad" stroke="#fff" strokeWidth="2" />
          <path d="M62 94 106 54M106 54 158 94M158 94 110 132M110 132 62 94" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          <path d="M110 24v-9M179 90h10M110 156v9M31 90H21" stroke="#ffabd0" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
      <div className={styles.communityBuilderContent}>
        <div className={styles.communityBuilderTopline}>
          <span className={styles.communityBuilderPill}>MOVING IN · YOUR BUILDER PRIVILEGE</span>
          <span className={styles.communityBuilderSparkle} aria-hidden="true">✦</span>
        </div>
        <h2 id="community-builder-title">Create your own space.</h2>
        <p className={styles.communityBuilderDescription}>
          Bring your people together. Start a live Video Lounge or create a friend group around the conversations, interests and experiences you want to share.
        </p>
        <div className={styles.communityBuilderActions}>
          <Link className={styles.communityBuilderPrimary} href="/host/rooms?audience=community">
            <span className={styles.communityBuilderActionIcon} aria-hidden="true">◉</span>
            Launch a Video Lounge
            <span aria-hidden="true">→</span>
          </Link>
          <Link className={styles.communityBuilderSecondary} href="/groups/create">
            <span aria-hidden="true">＋</span>
            Create a Friend Group
            <span aria-hidden="true">↗</span>
          </Link>
          <Link className={styles.communityBuilderExplore} href="/neighbourhoods">
            Explore neighbourhoods <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className={styles.communityBuilderFooter}>
          <span aria-hidden="true">✦</span>
          Your membership gives you the tools. Your imagination brings the community to life.
        </div>
      </div>
    </section>
  );
}

export function DashboardYourCommunity() {
  const { value, loading } = useDashboardResource("/api/dashboard/my-community", null);
  const groups = Array.isArray(value?.groups) ? value.groups : [];
  const lounges = Array.isArray(value?.lounges) ? value.lounges : [];
  const totals = value?.totals || { groups: 0, lounges: 0, liveAttendees: 0 };

  if (!loading && !value) return null;

  return (
    <section className={styles.yourCommunityCard} aria-labelledby="your-community-title">
      <div className={styles.yourCommunityHeader}>
        <div>
          <p className={styles.yourCommunityEyebrow}>YOUR COMMUNITY</p>
          <h2 id="your-community-title">What you’re building</h2>
          <p className={styles.yourCommunityDescription}>
            Your spaces, your people, your momentum. Keep an eye on the groups and lounges you’ve brought to life.
          </p>
        </div>
        <Link className={styles.yourCommunityViewAll} href="/groups">
          Explore groups <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className={styles.yourCommunityStats} aria-label="Your community totals">
        <div className={styles.yourCommunityStat}>
          <strong>{loading ? "—" : totals.groups}</strong>
          <span>Groups created</span>
        </div>
        <div className={styles.yourCommunityStat}>
          <strong>{loading ? "—" : totals.lounges}</strong>
          <span>Lounges launched</span>
        </div>
        <div className={styles.yourCommunityStat}>
          <strong>{loading ? "—" : totals.liveAttendees}</strong>
          <span>People in your lounges</span>
        </div>
      </div>

      {loading ? (
        <p className={styles.itemBody}>Loading your spaces…</p>
      ) : (
        <div className={styles.yourCommunityColumns}>
          <div className={styles.yourCommunityColumn}>
            <div className={styles.yourCommunityColumnHeader}>
              <h3>Friend groups</h3>
              <Link href="/groups/create">＋ Create group</Link>
            </div>
            {groups.length ? (
              <ul className={styles.yourCommunityList}>
                {groups.slice(0, 4).map((group) => (
                  <li key={group.id}>
                    <Link className={styles.yourCommunityItem} href={"/groups/" + encodeURIComponent(group.slug)}>
                      <span className={styles.yourCommunityGroupIcon} aria-hidden="true">
                        {group.imageUrl ? <img src={group.imageUrl} alt="" loading="lazy" /> : "✦"}
                      </span>
                      <span className={styles.yourCommunityItemCopy}>
                        <strong>{group.name}</strong>
                        <span>{group.memberCount} {group.memberCount === 1 ? "member" : "members"} · {group.createdByMe ? "Created by you" : "Joined"}</span>
                      </span>
                      <span className={styles.yourCommunityArrow} aria-hidden="true">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.yourCommunityEmpty}>
                <strong>Your first group starts with an idea.</strong>
                <span>Create a space for people who share your interests.</span>
                <Link href="/groups/create">Create your friend group →</Link>
              </div>
            )}
          </div>

          <div className={styles.yourCommunityColumn}>
            <div className={styles.yourCommunityColumnHeader}>
              <h3>Video lounges</h3>
              <Link href="/host/rooms?audience=community">＋ Launch lounge</Link>
            </div>
            {lounges.length ? (
              <ul className={styles.yourCommunityList}>
                {lounges.slice(0, 4).map((room) => (
                  <li key={room.id}>
                    <Link className={styles.yourCommunityItem} href={"/rooms/" + encodeURIComponent(room.slug)}>
                      <span className={styles.yourCommunityLoungeIcon + " " + (room.isLive ? styles.yourCommunityLoungeIconLive : "")} aria-hidden="true">◉</span>
                      <span className={styles.yourCommunityItemCopy}>
                        <strong>{room.name}</strong>
                        <span>{room.isLive ? "Live now · " + room.liveAttendees + (room.liveAttendees === 1 ? " person here" : " people here") : room.opensAt ? "Scheduled · " + new Date(room.opensAt).toLocaleString() : "Your lounge · Ready to open"}</span>
                      </span>
                      <span className={styles.yourCommunityArrow} aria-hidden="true">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.yourCommunityEmpty}>
                <strong>Give your community a place to meet.</strong>
                <span>Launch a live Video Lounge and bring everyone together.</span>
                <Link href="/host/rooms?audience=community">Launch your first lounge →</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
