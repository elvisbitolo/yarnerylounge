import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getConversation, listMessagesBefore, listConversations } from "@/lib/server/chat";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import { mergeChatSettings } from "@/lib/chat-settings-core";
import ConversationRail from "../ConversationRail";
import MobilePanels from "../MobilePanels";
import ConversationPane from "./ConversationPane";

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

  const chatSettings = mergeChatSettings({}, userDoc?.extra?.chatSettings);
  const prefsById = userDoc?.extra?.chatPrefs || {};
  const starredByConversation = userDoc?.extra?.starredMessages || {};
  const presenceHidden = chatSettings.onlineVisibility !== "everyone";
  const otherMemberId = presenceIds[0] || "";

  return (
      <MobilePanels
        activeId={id}
        backHref="/chat"
        rail={
          <ConversationRail
            conversations={conversations}
            activeId={id}
            selfUid={user.uid}
            settingsInit={chatSettings}
            prefsByIdInit={prefsById}
          />
        }
        thread={
          <ConversationPane
            conversationId={id}
            uid={user.uid}
            selfName={selfName}
            initialMessages={messagePage.messages}
            initialHasMore={!!messagePage.hasMore}
            canWriteChat={canWriteChat(caps) || userDoc?.role === "owner" || userDoc?.role === "moderator"}
            title={conversation?.title || conversation?.name || "Member"}
            photoURL={conversation?.photoURL || ""}
            participantIds={presenceIds}
            conversationType={conversation?.type}
            hideReceipts={chatSettings.readReceipts === false}
            presenceHidden={presenceHidden}
            otherMemberId={otherMemberId}
            initialStars={starredByConversation}
          />
        }
      />
  );
}