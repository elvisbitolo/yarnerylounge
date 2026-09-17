import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getConversation, listMessagesBefore, listConversations } from "@/lib/server/chat";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import Nav from "@/components/Nav";
import BackButton from "@/components/BackButton";
import ConversationRail from "../ConversationRail";
import MobilePanels from "../MobilePanels";
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

  const [messagePage, conversations, caps] = await Promise.all([
    listMessagesBefore(id),
    listConversations(user.uid),
    getCapabilities(user.uid),
  ]);
  const presenceIds = (conversation.participantIds || []).filter((participantId) => participantId !== user.uid);
  const selfName = userDoc?.name || user.name || user.email?.split("@")[0] || "Member";

  return (
    <Nav role={userDoc?.role}>
      <MobilePanels
        activeId={id}
        backHref="/chat"
        rail={
          <ConversationRail
            conversations={conversations}
            activeId={id}
            selfUid={user.uid}
          />
        }
        thread={
          <div className={styles.thread}>
            <div className={styles.threadHeader}>
              <div className={styles.threadHeaderLeft}>
                <div className={styles.threadBack}>
                  <BackButton fallback="/chat" label="Chats" />
                </div>
                <h1 className={styles.threadTitle}>{conversation?.title || conversation?.name || "Member"}</h1>
              </div>
              {presenceIds.length > 0 && conversation.type === "dm" ? (
                <PresenceStatus userId={presenceIds[0]} />
              ) : presenceIds.length > 0 ? (
                <PresenceStatus userIds={presenceIds} />
              ) : null}
            </div>
            <Thread
              conversationId={id}
              uid={user.uid}
              selfName={selfName}
              initialMessages={messagePage.messages}
              initialHasMore={!!messagePage.hasMore}
              canWriteChat={canWriteChat(caps) || userDoc?.role === "owner" || userDoc?.role === "moderator"}
            />
          </div>
        }
      />
    </Nav>
  );
}