"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const RoomDataContext = createContext(null);

export function useRoomData() {
  const ctx = useContext(RoomDataContext);
  if (!ctx) throw new Error("useRoomData must be used within RoomDataProvider");
  return ctx;
}

export default function RoomDataProvider({
  roomId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  canModerate = false,
  isHost = false,
  onMuteParticipant = null,
  children,
}) {
  const [messages, setMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [raisedHands, setRaisedHands] = useState({});
  const [myHandRaised, setMyHandRaised] = useState(false);
  const [speakerInvite, setSpeakerInvite] = useState(null);
  const [hiddenUserIds, setHiddenUserIds] = useState(() => new Set());

  const cursorRef = useRef(null);
  const lastLoadedAtRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const userIdRef = useRef(currentUserId);
  const signalsCursorRef = useRef(null);

  useEffect(() => {
    userIdRef.current = currentUserId;
  }, [currentUserId]);

  const mergeMessages = useCallback((incoming, { prepend = false } = {}) => {
    setMessages((prev) => {
      const map = new Map();
      const visible = (list) => list.filter((m) => !hiddenUserIds.has(m.userId));
      for (const m of visible(prepend ? incoming : prev)) map.set(m.id, m);
      for (const m of visible(prepend ? prev : incoming)) map.set(m.id, m);
      const merged = [...map.values()].sort((a, b) => a.createdAt - b.createdAt);
      const max = merged.reduce((acc, m) => Math.max(acc, m.createdAt || 0), lastLoadedAtRef.current || 0);
      lastLoadedAtRef.current = max;
      return merged;
    });
  }, [hiddenUserIds]);

  const hideUser = useCallback((userId) => {
    if (!userId) return;
    setHiddenUserIds((prev) => {
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
    setMessages((prev) => prev.filter((message) => message.userId !== userId));
  }, []);

  const loadHistory = useCallback(
    async ({ reset = false } = {}) => {
      if (loadingMoreRef.current) return;
      const base = `/api/rooms/${roomId}/messages?limit=50`;
      const url = reset ? base : `${base}&before=${cursorRef.current || Date.now()}`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load chat");
        const data = await res.json();
        const list = data.messages || [];
        mergeMessages(list, { prepend: !reset });
        cursorRef.current = list.length ? list[0].createdAt : cursorRef.current;
        setHasMore(!!data.hasMore);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoadingHistory(false);
        loadingMoreRef.current = false;
      }
    },
    [roomId, mergeMessages]
  );

  useEffect(() => {
    if (!roomId) return;
    loadHistory({ reset: true });
  }, [roomId, loadHistory]);

  const loadEarlier = useCallback(() => {
    if (!hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    loadHistory({ reset: false });
  }, [hasMore, loadHistory]);

  useEffect(() => {
    if (!roomId) return;
    const timer = setInterval(async () => {
      const after = (lastLoadedAtRef.current || Date.now()) - 1;
      try {
        const res = await fetch(`/api/rooms/${roomId}/messages?limit=60&after=${after}`);
        if (!res.ok) return;
        const data = await res.json();
        const list = data.messages || [];
        if (list.length) {
          mergeMessages(list);
        }
      } catch {
        /* keep polling */
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [roomId, mergeMessages]);

  const applySignals = useCallback((list) => {
    const sorted = [...list].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    for (const s of sorted) {
      if (s.type === "hand") {
        const who = s.target || s.fromIdentity || "";
        if (!who) continue;
        setRaisedHands((prev) => ({ ...prev, [who]: !!s.value }));
        if (who === userIdRef.current) setMyHandRaised(!!s.value);
      } else if (s.type === "reaction") {
        const from = s.fromIdentity || "";
        if (from === userIdRef.current) continue;
        const id = `${Date.now()}-${from}-${Math.random().toString(36).slice(2, 6)}`;
        setFloatingReactions((prev) => [...prev, { id, from, emoji: s.emoji || "❤️", sent: false }]);
        setTimeout(() => {
          setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
        }, 4000);
      } else if (s.type === "speakerInvite") {
        if (s.target && s.target !== userIdRef.current) continue;
        const from = s.fromIdentity || "";
        setSpeakerInvite({ host: from, hostName: s.hostName || from });
      }
    }
  }, []);

  useEffect(() => {
    if (!roomId) return;
    const timer = setInterval(async () => {
      const after = signalsCursorRef.current || Date.now() - 60 * 1000;
      try {
        const res = await fetch(`/api/rooms/${roomId}/signals?after=${after}`);
        if (!res.ok) return;
        const data = await res.json();
        const list = data.signals || [];
        if (list.length) {
          signalsCursorRef.current = list[list.length - 1].createdAt;
          applySignals(list);
        }
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [roomId, applySignals]);

  const clearSpeakerInvite = useCallback(() => setSpeakerInvite(null), []);

  const sendSpeakerInvite = useCallback(
    async (target, hostName) => {
      if (!roomId || !target) return;
      try {
        await fetch(`/api/rooms/${roomId}/signals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "speakerInvite", target, hostName: hostName || "" }),
        });
      } catch {
        /* server enforces and persists via signals collection */
      }
    },
    [roomId]
  );

  const sendChatMessage = useCallback(
    async (text, replyTo = null, mentions = [], imageData = "") => {
      if (!roomId) return false;
      const cleanText = String(text || "").trim();
      const cleanImage = String(imageData || "").trim();
      if (!cleanText && !cleanImage) return false;
      const optimistic = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId: currentUserId,
        userName: currentUserName || "You",
        userAvatar: currentUserAvatar || "",
        role: canModerate ? (isHost ? "host" : "moderator") : "speaker",
        imageData: cleanImage,
        text: cleanText,
        mentions: mentions || [],
        replyTo: replyTo
          ? { id: replyTo.id || "", text: replyTo.text || "", from: replyTo.from || "" }
          : null,
        reactions: {},
        createdAt: Date.now(),
        isLocal: true,
      };
      setMessages((prev) => [...prev, optimistic].sort((a, b) => a.createdAt - b.createdAt));
      try {
        const res = await fetch(`/api/rooms/${roomId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: cleanText,
            imageData: cleanImage,
            mentions: mentions || [],
            replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, from: replyTo.from } : null,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to send");
        }
        const data = await res.json().catch(() => ({}));
        const realId = data?.id;
        setMessages((prev) => {
          const withoutLocal = prev.filter((m) => m.id !== optimistic.id);
          if (realId && withoutLocal.some((m) => m.id === realId)) {
            return withoutLocal;
          }
          return realId
            ? withoutLocal
                .concat({ ...optimistic, id: realId, isLocal: false })
                .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
            : withoutLocal;
        });
        return true;
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? { ...m, failed: true } : m))
        );
        return false;
      }
    },
    [roomId, currentUserId, currentUserName, currentUserAvatar, canModerate, isHost]
  );

  const retryChatMessage = useCallback(
    async (message) => {
      if (!message?.failed) return false;
      setMessages((prev) => prev.filter((item) => item.id !== message.id));
      return sendChatMessage(
        message.text,
        message.replyTo,
        message.mentions || [],
        message.imageData || ""
      );
    },
    [sendChatMessage]
  );

  const toggleReaction = useCallback(
    async (messageId, emoji) => {
      if (!roomId || !messageId) return;
      try {
        await fetch(`/api/rooms/${roomId}/messages/${messageId}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        });
      } catch {
        /* best effort — snapshot reconciles */
      }
    },
    [roomId]
  );

  const togglePin = useCallback(
    async (messageId) => {
      if (!roomId || !messageId) return;
      try {
        await fetch(`/api/rooms/${roomId}/messages/pinned`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId }),
        });
      } catch {
        /* best effort */
      }
    },
    [roomId]
  );

  const deleteMessage = useCallback(
    async (messageId) => {
      if (!roomId || !messageId) return;
      try {
        await fetch(`/api/rooms/${roomId}/messages/${messageId}`, { method: "POST" });
      } catch {
        /* best effort */
      }
    },
    [roomId]
  );

  const sendReaction = useCallback(
    (emoji) => {
      if (!roomId) return;
      const id = `self-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setFloatingReactions((prev) => [...prev, { id, from: currentUserId, emoji, sent: true }]);
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
      }, 4000);
      fetch(`/api/rooms/${roomId}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "reaction", emoji }),
      }).catch(() => {});
    },
    [roomId, currentUserId]
  );

  const toggleHand = useCallback(() => {
    if (!roomId || !currentUserId) return;
    const next = !myHandRaised;
    setMyHandRaised(next);
    setRaisedHands((prev) => ({ ...prev, [currentUserId]: next }));
    fetch(`/api/rooms/${roomId}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "hand", value: next }),
    }).catch(() => {});
  }, [roomId, currentUserId, myHandRaised]);

  const dismissHand = useCallback(
    (identity) => {
      if (!roomId || !identity) return;
      setRaisedHands((prev) => ({ ...prev, [identity]: false }));
      fetch(`/api/rooms/${roomId}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "hand", value: false, target: identity }),
      }).catch(() => {});
    },
    [roomId]
  );

  const value = useMemo(
    () => ({
      messages,
      roomId,
      loadingHistory,
      hasMore,
      loadEarlier,
      chatError: error,
      floatingReactions,
      raisedHands,
      myHandRaised,
      speakerInvite,
      canModerate,
      isHost,
      sendChatMessage,
      retryChatMessage,
      toggleReaction,
      togglePin,
      deleteMessage,
      sendReaction,
      toggleHand,
      dismissHand,
      clearSpeakerInvite,
      sendSpeakerInvite,
      hideUser,
      onMuteParticipant,
    }),
    [
      messages,
      roomId,
      loadingHistory,
      hasMore,
      loadEarlier,
      error,
      floatingReactions,
      raisedHands,
      myHandRaised,
      speakerInvite,
      canModerate,
      isHost,
      sendChatMessage,
      retryChatMessage,
      toggleReaction,
      togglePin,
      deleteMessage,
      sendReaction,
      toggleHand,
      dismissHand,
      clearSpeakerInvite,
      sendSpeakerInvite,
      hideUser,
      onMuteParticipant,
    ]
  );

  return <RoomDataContext.Provider value={value}>{children}</RoomDataContext.Provider>;
}
