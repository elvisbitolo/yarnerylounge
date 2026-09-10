import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getConversation, listMessages } from "@/lib/server/chat";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import Nav from "@/components/Nav";
import BackButton from "@/components/BackButton";
import Thread from "./Thread";
import PresenceStatus from "../PresenceStatus";
import styles from "../chat.module.css";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const conversation = await getConversation(id, user.uid);
  if (!conversation) {
    redirect("/chat");
  }

  const messages = await listMessages(id);
  const caps = await getCapabilities(user.uid);
  const presenceIds = (conversation.participantIds || []).filter((participantId) => participantId !== user.uid);

  return (
      <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <BackButton fallback="/chat" label="All chats" />
        <div className={styles.thread}>
          <div className={styles.threadHeader}>
            <h1 className={styles.threadTitle}>{conversation?.title || conversation?.name || "Member"}</h1>
            {presenceIds.length > 0 && conversation.type === "dm" ? (
              <PresenceStatus userId={presenceIds[0]} />
            ) : presenceIds.length > 0 ? (
              <PresenceStatus userIds={presenceIds} />
            ) : null}
          </div>
          <Thread
            conversationId={id}
            uid={user.uid}
            initialMessages={messages}
            canWriteChat={canWriteChat(caps) || userDoc?.role === "owner" || userDoc?.role === "moderator"}
          />
        </div>
      </div>
</Nav>
  );
}
