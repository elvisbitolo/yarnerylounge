import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getRoomBySlug } from "@/lib/server/rooms";
import { getUpcomingRoomStart } from "@/lib/server/events";
import { getScopedHostRights } from "@/lib/server/hosts";
import { getCapabilities } from "@/lib/server/capabilities";
import Nav from "@/components/Nav";
import RoomClient from "./RoomClient";
import styles from "./room.module.css";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);
  const room = await getRoomBySlug(slug);
  if (!room || room.status !== "active") {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Room not found</h1>
          <p className={styles.subtitle}>This room is closed or doesn&apos;t exist.</p>
          <Link className={styles.link} href="/rooms">Back to rooms</Link>
        </div>
      </main>
    );
  }

  const opensAt = await getUpcomingRoomStart(slug);
  const rights = await getScopedHostRights(user.uid, "room", room.id);
  const caps = await getCapabilities(user.uid);

  return (
    <>
<Nav role={userDoc?.role}>
      <RoomClient
        roomName={room.name}
        slug={room.slug}
        roomId={room.id}
        kind={room.kind}
        role={userDoc?.role}
        opensAt={opensAt}
        isHost={rights.isHost}
        isCoHost={rights.isCoHost}
        canPublishPlan={caps.video.canPublish}
        canWriteChatPlan={caps.chat.write}
        planKey={caps.key}
        alwaysOn={!!room.alwaysOn}
        vibe={room.vibe || ""}
        vibeMode={room.vibeMode || ""}
        vibeRule={room.rule || ""}
        autoAudioVideo={!!room.autoAudioVideo}
        forceMuteOnJoin={!!room.forceMuteOnJoin}
        raiseHandToTalk={!!room.raiseHandToTalk}
        disableAudio={!!room.disableAudio}
        musicUrl={room.musicUrl || ""}
        musicPlaying={!!room.musicPlaying}
        musicFileId={room.musicFileId || ""}
        hostId={room.createdBy || ""}
        userId={user.uid}
        userName={userDoc?.name || user.displayName || "Member"}
        userAvatar={userDoc?.avatar || user.photoURL || ""}
      />
</Nav>
    </>
  );
}
