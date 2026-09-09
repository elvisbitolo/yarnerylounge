import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listConversations, getOrCreateDm, getOrCreateGroupChat, getOrCreateSpaceChat } from "@/lib/server/chat";
import { isGroupMember } from "@/lib/server/groups";
import { isSpaceMember } from "@/lib/server/spaces";
import { getPrisma } from "@/lib/db/prisma";
import Nav from "@/components/Nav";
import styles from "./chat.module.css";

export const dynamic = "force-dynamic";

function timeLabel(millis) {
  if (!millis) return "";
  const date = new Date(millis);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default async function ChatPage({ searchParams }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  if (params.with && params.with !== user.uid) {
    const conversation = await getOrCreateDm(user.uid, params.with);
    if (conversation) redirect(`/chat/${conversation.id}`);
  }

  if (params.group) {
    const membership = await isGroupMember(params.group, user.uid);
    if (membership || userDoc?.role === "owner") {
      const conversation = await getOrCreateGroupChat(user.uid, params.group);
      if (conversation) redirect(`/chat/${conversation.id}`);
    }
  }

  if (params.space) {
    const membership = await isSpaceMember(params.space, user.uid);
    if (membership || userDoc?.role === "owner") {
      const conversation = await getOrCreateSpaceChat(user.uid, params.space);
      if (conversation) redirect(`/chat/${conversation.id}`);
    }
  }

  const conversations = await listConversations(user.uid);

  const userCountry = userDoc?.country || "";

  const prisma = getPrisma();

  let nearby = [];
  if (userCountry && prisma) {
    const nearbyRows = await prisma.user.findMany({
      where: { country: userCountry },
      take: 30,
    });
    nearby = nearbyRows
      .map((d) => ({ id: d.id, name: d.name || "", country: d.country || "" }))
      .filter((m) => m.name && m.id !== user.uid);
  }
  nearby = nearby.slice(0, 12);

  return (
      <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Chat</h1>
        <p className={styles.subtitle}>Direct messages and group conversations.</p>

        <section className={styles.nearby}>
          <h2 className={styles.nearbyTitle}>Members near you</h2>
          {!userCountry ? (
            <p className={styles.nearbyEmpty}>
              Set your country in <Link href="/account#profile">Account</Link> to find
              members nearby.
            </p>
          ) : nearby.length === 0 ? (
            <p className={styles.nearbyEmpty}>No members in your area yet — invite someone!</p>
          ) : (
            <ul className={styles.nearbyList}>
              {nearby.map((member) => (
                <li key={member.id} className={styles.nearbyItem}>
                  <span className={styles.nearbyAvatar}>
                    {(member.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div className={styles.nearbyBody}>
                    <p className={styles.nearbyName}>{member.name}</p>
                    <p className={styles.nearbyLoc}>{member.country || ""}</p>
                  </div>
                  <Link className={styles.nearbyMsg} href={`/chat?with=${member.id}`}>
                    Message
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <h2 className={styles.listTitle}>All chats</h2>
        {conversations.length === 0 ? (
          <p className={styles.empty}>
            No conversations yet. Open a member&apos;s profile and hit Message to start chatting.
          </p>
        ) : (
          <div className={styles.list}>
            {conversations.map((conv) => (
              <Link key={conv.id} href={`/chat/${conv.id}`} className={styles.item}>
                <div className={styles.avatar}>
                  {(conv.title || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className={styles.itemBody}>
                  <div className={styles.itemTop}>
                    <p className={styles.itemTitle}>
                      {conv.title}
                    </p>
                    <p className={styles.itemTime}>{timeLabel(conv.lastMessageAt)}</p>
                  </div>
                  <p className={conv.lastMessage ? styles.itemPreview : styles.itemPreviewEmpty}>
                    {conv.lastMessage || "Say hi!"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
</Nav>
  );
}
