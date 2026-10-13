"use client";

import { useCallback, useEffect, useState } from "react";
import ChatHeader from "./ChatHeader";
import ChatInfo from "./ChatInfo";
import Thread from "./Thread";
import ForwardPicker from "./ForwardPicker";
import { initStars } from "@/lib/chat-star-store";
import styles from "../chat.module.css";

// Owns the message-search state that the header and the thread share: the
// header toggles/collects the query, the thread filters by it. Also owns the
// per-chat info drawer (which the header's avatar/title open), the forward
// picker, and the scroll-to-message target for opening a starred message.
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
  initialStars = {},
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [forwardSeq, setForwardSeq] = useState(0);
  const [jumpTarget, setJumpTarget] = useState(null);

  useEffect(() => {
    initStars(initialStars);
  }, [initialStars]);

  function startForward(msg) {
    setForwardMsg(msg);
    setForwardSeq((n) => n + 1);
  }

  function toggleSearch() {
    setSearchOpen((open) => {
      if (open) setSearchQuery("");
      return !open;
    });
  }

  function openMessage(id) {
    setInfoOpen(false);
    setJumpTarget({ id, n: (jumpTarget?.n || 0) + 1 });
  }

  const handleJumpHandled = useCallback(() => {
    setTimeout(() => setJumpTarget(null), 0);
  }, []);

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
        jumpTarget={jumpTarget}
        onJumpHandled={handleJumpHandled}
        onForward={startForward}
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
        onOpenMessage={openMessage}
      />
      <ForwardPicker
        key={forwardSeq || 1}
        open={!!forwardMsg}
        onClose={() => setForwardMsg(null)}
        conversationId={conversationId}
        messageId={forwardMsg?.id || ""}
        msg={forwardMsg}
      />
    </div>
  );
}