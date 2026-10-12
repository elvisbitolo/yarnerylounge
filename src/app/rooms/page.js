import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Wine, Headphones, Sofa, Ban, Users } from "lucide-react";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { loungeGate } from "@/lib/server/lounge-gate";
import { listRoomsEnsuringAlwaysOn, listVisibleCommunityRooms, ALWAYS_ON_ROOMS } from "@/lib/server/rooms";
import { getAnnouncerLiveRoom } from "@/lib/server/lounge-live";
import { LIVE_ANNOUNCER_NAME } from "@/lib/server/lounge-live-core";
import styles from "./rooms.module.css";

export const dynamic = "force-dynamic";

// Canonical order: Happy Hour Hub → Lo-Fi & Loops → Velvet Den → Silent Studio.
const ROOM_ORDER = ["happy-hour-hub", "lo-fi-and-loops", "velvet-den", "silent-studio"];

const ROOM_IMAGES = {
  "happy-hour-hub": "/images/rooms/happy-hour-hub-v2.jpg",
  "lo-fi-and-loops": "/images/rooms/lofi-and-loops.jpg",
  "velvet-den": "/images/rooms/velvet-den.jpg",
  "silent-studio": "/images/rooms/silent-studio.jpg",
};

const ROOM_META = {
  "happy-hour-hub": { icon: Wine },
  "lo-fi-and-loops": { icon: Headphones },
  "velvet-den": { icon: Sofa },
  "silent-studio": { icon: Ban },
};

// Fallback constructor for canonical rooms missing from database
function canonicalDefaultRoomFallback(spec) {
  return {
    id: spec.slug,
    slug: spec.slug,
    name: spec.name,
    description: spec.description,
    status: "active",
    kind: "standard",
    alwaysOn: true,
    color: spec.color || "",
    vibe: spec.vibe || "",
    vibeMode: spec.vibeMode || "",
    rule: spec.rule || "",
    maxParticipants: 200,
    createdBy: "system",
    createdAt: new Date(0),
  };
}

function canonicalMeta(room) {
  if (room.vibe === "silent") return "Pop in anytime · no music, pure focus";
  if (room.vibe === "social") return "Pop in anytime · upbeat background grooves";
  return "Pop in anytime · ambient background music";
}

function communityMeta(room) {
  const base =
    (room.kind || "standard") === "broadcast"
      ? "Live broadcast"
      : room.alwaysOn
        ? "Always open"
        : "Open now";
  if (room.vibe === "silent") return `${base} · quiet, audio-free`;
  if (room.vibe === "social") return `${base} · upbeat & chatty`;
  if (room.vibe === "focus") return `${base} · focused craft-along`;
  if (room.vibe === "calm") return `${base} · calm and cozy`;
  return base;
}

// Shared lounge card. Local (bundled) covers go through next/image; uploaded
// covers come from Blob (or a data URL) and are painted as a background so no
// remote image host has to be allow-listed in next.config.
function LoungeCard({ room, image, icon: Icon, meta }) {
  const alwaysOn = !!room.alwaysOn;
  const broadcast = (room.kind || "standard") === "broadcast";
  const remote = image && !image.startsWith("/");
  return (
    <Link
      href={`/rooms/${room.slug}`}
      className={`${styles.card} ${alwaysOn ? styles.alwaysOnCard : styles.communityCard}`}
      style={room.color ? { "--roomColor": room.color } : undefined}
    >
      {image && (
        <span className={styles.cardImageWrap}>
          {remote ? (
            <span className={styles.cardImageBg} style={{ backgroundImage: `url(${image})` }} />
          ) : (
            <Image
              src={image}
              alt=""
              fill
              sizes="(max-width: 480px) 100vw, 440px"
              className={styles.cardImage}
            />
          )}
        </span>
      )}
      <span className={styles.cardBody}>
        {Icon && <Icon className={styles.cardEmoji} size={22} strokeWidth={1.5} />}
        {alwaysOn ? (
          <span className={styles.alwaysOnBadge}>
            <span className={styles.alwaysOnBadgeDot} aria-hidden="true" />
            Always Open
          </span>
        ) : broadcast ? (
          <span className={styles.broadcastBadge}>Broadcast</span>
        ) : null}
        <h2 className={styles.cardTitle}>{room.name}</h2>
        <p className={styles.cardDesc}>{room.description}</p>
        <p className={styles.cardMeta}>{meta}</p>
        <p className={styles.cardEnter}>
          Enter the lounge
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h13M12 5v13" />
          </svg>
        </p>
      </span>
    </Link>
  );
}

export default async function RoomsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const gate = await loungeGate(user.uid, userDoc, { lounge: true });
  if (gate) redirect(gate);

  const [rooms, liveRoom, visibleRooms] = await Promise.all([
    listRoomsEnsuringAlwaysOn(),
    getAnnouncerLiveRoom(),
    listVisibleCommunityRooms(user.uid, userDoc),
  ]);

  const activeRooms = rooms.filter((room) => room.status === "active");

  // Only the four signature always-on rooms, in the canonical order above.
  const canonicalSlugs = new Set(ROOM_ORDER);
  const bySlug = new Map(activeRooms.map((room) => [room.slug, room]));
  const featuredRooms = ROOM_ORDER
    .map((slug) => {
      const room = bySlug.get(slug);
      if (room) {
        // Use imageUrl from database if available, otherwise fall back to hardcoded
        return { ...room, imageUrl: room.imageUrl || ROOM_IMAGES[slug] };
      }
      // Fallback: if a canonical room is missing from the database, construct
      // it from the always-on defaults so it always appears on the page.
      const spec = ALWAYS_ON_ROOMS.find((r) => r.slug === slug);
      if (spec) {
        return {
          ...canonicalDefaultRoomFallback(spec),
          imageUrl: spec.imageUrl || ROOM_IMAGES[slug],
        };
      }
      return null;
    })
    .filter((room) => room && canonicalSlugs.has(room.slug));

  // Member-created, group- and space-scoped lounges the viewer may open.
  const communityRooms = visibleRooms.filter((room) => room.status === "active" && !canonicalSlugs.has(room.slug));

  return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Lounges</h1>
          {userDoc?.role === "owner" && (
            <Link className={styles.adminLink} href="/admin/rooms">Manage lounges</Link>
          )}
        </div>
        <p className={styles.subtitle}>
          Four always-on video lounges — pick your vibe and join the crafters already inside.
        </p>

        {liveRoom && (
          <Link
            href={`/rooms/${liveRoom.slug}`}
            className={styles.liveCard}
            aria-label={`${LIVE_ANNOUNCER_NAME} is live in ${liveRoom.name}. Join the lounge.`}
          >
            <span className={styles.liveCardGlow} aria-hidden="true" />
            <span className={styles.liveCardMain}>
              <span className={styles.liveCardEyebrow}>
                <span className={styles.liveCardDot} aria-hidden="true" />
                Live now
              </span>
              <span className={styles.liveCardTitle}>
                {LIVE_ANNOUNCER_NAME} is live in {liveRoom.name}
              </span>
              <span className={styles.liveCardSub}>
                She just joined
                {liveRoom.viewerCount > 1
                  ? ` · ${liveRoom.viewerCount} people in there now`
                  : " · be the first to say hello"}
              </span>
            </span>
            <span className={styles.liveCardCta}>
              Join
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h13M12 5v13" />
              </svg>
            </span>
          </Link>
        )}

        {featuredRooms.length === 0 ? (
          <p className={styles.empty}>The lounges are being prepped — check back in a moment.</p>
        ) : (
          <div className={styles.grid}>
            {featuredRooms.map((room) => (
              <LoungeCard
                key={room.id}
                room={room}
                image={room.imageUrl}
                icon={ROOM_META[room.slug]?.icon || null}
                meta={canonicalMeta(room)}
              />
            ))}
          </div>
        )}

        {communityRooms.length > 0 && (
          <section className={styles.communitySection}>
            <h2 className={styles.communityTitle}>Community lounges</h2>
            <p className={styles.communitySub}>
              Rooms hosted by your fellow members and groups.
            </p>
            <div className={styles.grid}>
              {communityRooms.map((room) => (
                <LoungeCard
                  key={room.id}
                  room={room}
                  image={room.imageUrl}
                  icon={Users}
                  meta={communityMeta(room)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
  );
}
