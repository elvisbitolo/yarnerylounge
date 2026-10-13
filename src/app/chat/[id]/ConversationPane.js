"use client";

import { useState } from "react";
import ChatHeader from "./ChatHeader";
import ChatInfo from "./ChatInfo";
import Thread from "./Thread";
import styles from "../chat.module.css";

// Owns the message-search state that the header and the thread share: the
// header toggles/collects the query, the thread filters by it. Also owns the
// per-chat info drawer, which the header's avatar/title open.
export default function ConversationPane({
  conversationId,
  uid,
  selfName,
  initialMessages,
  initialHasMore = false,
  canWriteChat = false,
  title,
  photoURL,
  participantIds = [],
  conversationType,
  inLoungeName = "",
  hideReceipts = false,
  presenceHidden = false,
  otherMemberId = "",
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);

  function toggleSearch() {
    setSearchOpen((open) => {
      if (open) setSearchQuery("");
      return !open;
    });
  }

  return (
    <div className={styles.thread}>
      <ChatHeader
        title={title}
        photoURL={photoURL}
        conversationId={conversationId}
        participantIds={participantIds}
        conversationType={conversationType}
        inLoungeName={inLoungeName}
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        onToggleSearch={toggleSearch}
        onSearchChange={setSearchQuery}
        onOpenInfo={() => setInfoOpen(true)}
        presenceHidden={presenceHidden}
      />
      <Thread
        conversationId={conversationId}
        uid={uid}
        selfName={selfName}
        initialMessages={initialMessages}
        initialHasMore={initialHasMore}
        canWriteChat={canWriteChat}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        hideReceipts={hideReceipts}
      />
      <ChatInfo
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        conversationId={conversationId}
        title={title}
        photoURL={photoURL}
        isDm={conversationType === "dm"}
        otherMemberId={otherMemberId}
        onOpenSearch={() => {
          setSearchOpen(true);
          setSearchQuery("");
        }}
      />
    </div>
  );
}