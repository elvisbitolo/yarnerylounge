import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import {
  getSpaceBySlug,
  getSpaceMembers,
  isSpaceMember,
  listRoomsForSpace,
  listEventsForSpace,
  listCoursesForSpace,
} from "@/lib/server/spaces";
import { canManageScope } from "@/lib/server/hosts";
import { expandEvents } from "@/lib/server/events";
import Nav from "@/components/Nav";
import BackButton from "@/components/BackButton";
import Feed from "@/app/feed/Feed";
import EventsBoard from "@/app/events/EventsBoard";
import SpaceInvite from "../SpaceInvite";
import SpaceAnalytics from "./SpaceAnalytics";
import styles from "../spaces.module.css";

export const dynamic = "force-dynamic";

export default async function SpacePage({ params }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const space = await getSpaceBySlug(slug);
  if (!space || space.status !== "active") {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Space not found</h1>
          <p className={styles.subtitle}>This space is closed or doesn&apos;t exist.</p>
          <Link className={styles.link} href="/spaces">Back to spaces</Link>
        </div>
      </main>
    );
  }

  const isOwner = userDoc?.role === "owner";
  const canManage = isOwner || (await canManageScope(user.uid, "space", space.id));
  const membership = await isSpaceMember(space.id, user.uid);
  const members = await getSpaceMembers(space.id);
  const memberIds = members.map((m) => m.userId);
  const memberNames = members.slice(0, 8).map((m) => m.name);
  const features = space.features || {};

  const canEnter = membership || isOwner;
  const isInviteOnly = space.access === "invite";

  let eventsSerialized = [];
  if (features.events) {
    const events = await listEventsForSpace(space.id);
    eventsSerialized = expandEvents(events).map((event) => ({
      id: event.id,
      occurrenceId: event.occurrenceId,
      title: event.title,
      description: event.description || "",
      startTime: event.startTime instanceof Date
        ? event.startTime.toISOString()
        : new Date(event.startTime.toMillis ? event.startTime.toMillis() : event.startTime).toISOString(),
      endTime: event.endTime ? new Date(event.endTime.toMillis ? event.endTime.toMillis() : event.endTime).toISOString() : null,
      roomSlug: event.roomSlug || "",
      capacity: Number(event.capacity) || 0,
      purchasePriceCents: Number(event.purchasePriceCents) || 0,
    }));
  }

  let spaceCourses = [];
  if (features.courses) {
    spaceCourses = (await listCoursesForSpace(space.id)).filter(
      (course) => course.status === "published"
    );
  }

  let spaceRooms = [];
  if (features.live) {
    spaceRooms = (await listRoomsForSpace(space.id)).filter(
      (room) => room.status === "active"
    );
  }

  let allMembers = [];
  if (isOwner) {
    const prisma = getPrisma();
    if (prisma) {
      const userRows = await prisma.user.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      allMembers = userRows
        .map((doc) => ({ id: doc.id, name: doc.name || "" }))
        .filter((m) => m.name);
    }
  }

  return (
      <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <BackButton fallback="/spaces" label="All spaces" />
        <p className={styles.breadcrumb}>
          <Link className={styles.link} href="/spaces">Spaces</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span>{space.name}</span>
        </p>

        <div className={styles.spaceHeader}>
          <h1 className={styles.title}>
            {space.name}
            <span className={styles.accessBadgeLg}>
              {isInviteOnly ? "Invite only" : space.access === "private" ? "Private" : "Public"}
              {space.requiredTier === "premium" ? " · Premium" : ""}
            </span>
          </h1>
          {space.description && <p className={styles.subtitle}>{space.description}</p>}
          <p className={styles.cardMeta}>
            {members.length} {members.length === 1 ? "member" : "members"}
            {memberNames.length > 0 && (
              <span className={styles.memberNames}> — {memberNames.join(", ")}</span>
            )}
          </p>

          {!canEnter ? (
            <p className={styles.notMember}>
              {isInviteOnly
                ? "This space is invite only — ask the host to add you."
                : "You're not a member yet — join from the spaces page."}
            </p>
          ) : (
            <div className={styles.spaceActions}>
              {features.chat && (
                <Link className={styles.spaceChatLink} href={`/chat?space=${space.id}`}>
                  Space chat
                </Link>
              )}
              {isInviteOnly && !membership && (
                <span className={styles.notMember}>Ask the host to add you to this space.</span>
              )}
            </div>
          )}
        </div>

        {features.feed && canEnter && (
          <>
            <h2 className={styles.sectionTitle}>Space feed</h2>
            <Feed
              uid={user.uid}
              userName={userDoc?.name || user.name || "Member"}
              role={userDoc?.role || "member"}
              spaceId={space.id}
            />
          </>
        )}
        {features.feed && !canEnter && (
          <p className={styles.empty}>Join this space to see and post in its feed.</p>
        )}

        {features.members && (
          <>
            <h2 className={styles.sectionTitle}>Members</h2>
            {isOwner && isInviteOnly && (
              <SpaceInvite
                spaceId={space.id}
                allMembers={allMembers}
                memberIds={memberIds}
                isOwner={isOwner}
              />
            )}
            <div className={styles.memberList}>
              {members.length === 0 ? (
                <p className={styles.empty}>No members yet.</p>
              ) : (
                members.map((member) => (
                  <Link key={member.id} href={`/members/${member.userId}`} className={styles.memberPill}>
                    {member.name}
                  </Link>
                ))
              )}
            </div>
          </>
        )}

        {features.events && canEnter && eventsSerialized.length > 0 && (
          <>
            <h2 className={styles.sectionTitle}>Events</h2>
            <EventsBoard events={eventsSerialized} uid={user.uid} userName={userDoc?.name || "Member"} />
          </>
        )}
        {features.events && eventsSerialized.length === 0 && (
          <>
            <h2 className={styles.sectionTitle}>Events</h2>
            <p className={styles.empty}>No events in this space yet.</p>
          </>
        )}

        {features.courses && (
          <>
            <h2 className={styles.sectionTitle}>Courses</h2>
            {spaceCourses.length === 0 ? (
              <p className={styles.empty}>No courses in this space yet.</p>
            ) : (
              <div className={styles.courseList}>
                {spaceCourses.map((course) => (
                  <Link key={course.id} href={`/courses/${course.id}`} className={styles.courseCard}>
                    <p className={styles.courseName}>{course.title}</p>
                    {course.description && <p className={styles.courseDesc}>{course.description}</p>}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {features.live && (
          <>
            <h2 className={styles.sectionTitle}>Live rooms</h2>
            {spaceRooms.length === 0 ? (
              <p className={styles.empty}>No live rooms in this space yet.</p>
            ) : (
              <div className={styles.roomGrid}>
                {spaceRooms.map((room) => (
                  <Link key={room.id} href={`/rooms/${room.slug}`} className={styles.roomCard}>
                    <h3 className={styles.roomName}>{room.name}</h3>
                    {room.description && <p className={styles.roomDesc}>{room.description}</p>}
                    <p className={styles.roomMeta}>
                      {room.kind === "broadcast" ? "Broadcast" : "Video chat"} · live
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {features.pages && (
          <>
            <h2 className={styles.sectionTitle}>Pages</h2>
            <Link className={styles.spaceChatLink} href={`/spaces/${space.slug}/pages`}>
              Browse pages
            </Link>
          </>
        )}

        {canManage && <SpaceAnalytics spaceId={space.id} />}
      </div>
</Nav>
  );
}
