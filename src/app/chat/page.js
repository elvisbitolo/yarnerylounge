import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listConversations, getOrCreateDm, getOrCreateGroupChat, getOrCreateSpaceChat } from "@/lib/server/chat";
import { isGroupMember } from "@/lib/server/groups";
import { isSpaceMember } from "@/lib/server/spaces";
import Nav from "@/components/Nav";
import ConversationRail from "./ConversationRail";
import styles from "./chat.module.css";

export const dynamic = "force-dynamic";

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

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.twoPane}>
        <ConversationRail
          conversations={conversations}
          activeId=""
          selfUid={user.uid}
        />
        <section className={`${styles.threadPane} ${styles.threadPaneHiddenOnMobile}`}>
          <div className={styles.emptyThread}>
            <div className={styles.emptyThreadIcon}>💬</div>
            <h2 className={styles.emptyThreadTitle}>Select a conversation</h2>
            <p className={styles.emptyThreadText}>
              Pick a chat from the side, or start a new one with any member —
              messages arrive instantly, wherever in the world they craft.
            </p>
          </div>
        </section>
      </div>
    </Nav>
  );
}