import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Wine, Headphones, Sofa, Ban } from "lucide-react";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { loungeGate } from "@/lib/server/lounge-gate";
import { listRooms, seedAlwaysOnRoom, ALWAYS_ON_ROOMS } from "@/lib/server/rooms";
import Nav from "@/components/Nav";
import styles from "./rooms.module.css";

export const dynamic = "force-dynamic";

// Canonical order: Happy Hour Hub → Lo-Fi & Loops → Velvet Den → Silent Studio.
const ROOM_ORDER = ["happy-hour-hub", "lo-fi-and-loops", "velvet-den", "silent-studio"];

const ROOM_IMAGES = {
  "happy-hour-hub": "/images/rooms/happy-hour-hub.jpg",
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

export default async function RoomsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const gate = await loungeGate(user.uid, userDoc);
  if (gate) redirect(gate);

  await seedAlwaysOnRoom();
  const rooms = await listRooms();
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

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Rooms</h1>
          {userDoc?.role === "owner" && (
            <Link className={styles.adminLink} href="/admin/rooms">Manage rooms</Link>
          )}
        </div>
        <p className={styles.subtitle}>
          Four always-on video lounge rooms — pick your vibe and join the crafters already inside.
        </p>

        {featuredRooms.length === 0 ? (
          <p className={styles.empty}>The lounge rooms are being prepped — check back in a moment.</p>
        ) : (
          <div className={styles.grid}>
            {featuredRooms.map((room) => {
              const img = room.imageUrl;
              const meta = ROOM_META[room.slug] || { icon: null };
              const Icon = meta.icon;
              return (
                <Link
                  key={room.id}
                  href={`/rooms/${room.slug}`}
                  className={`${styles.card} ${styles.alwaysOnCard}`}
                  style={room.color ? { "--roomColor": room.color } : undefined}
                >
                  {img && (
                    <span className={styles.cardImageWrap}>
                      <Image
                        src={img}
                        alt=""
                        fill
                        sizes="(max-width: 480px) 100vw, 440px"
                        className={styles.cardImage}
                      />
                    </span>
                  )}
                  <span className={styles.cardBody}>
                    {Icon && <Icon className={styles.cardEmoji} size={22} strokeWidth={1.5} />}
                    <span className={styles.alwaysOnBadge}>
                      <span className={styles.alwaysOnBadgeDot} aria-hidden="true" />
                      Always Open
                    </span>
                    <h2 className={styles.cardTitle}>
                      {room.name}
                    </h2>
                    <p className={styles.cardDesc}>{room.description}</p>
                    <p className={styles.cardMeta}>
                      {room.vibe === "silent"
                        ? "Pop in anytime · no music, pure focus"
                        : room.vibe === "social"
                          ? "Pop in anytime · upbeat background grooves"
                          : "Pop in anytime · ambient background music"}
                    </p>
                    <p className={styles.cardEnter}>
                      Enter the lounge
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h13M12 5v13" />
                      </svg>
                    </p>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Nav>
  );
}

