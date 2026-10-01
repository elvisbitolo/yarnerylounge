"use client";

import { useState } from "react";
import ChatHeader from "./ChatHeader";
import Thread from "./Thread";
import styles from "../chat.module.css";

// Owns the message-search state that the header and the thread share: the
// header toggles/collects the query, the thread filters by it.
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
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
      />
    </div>
  );
}
