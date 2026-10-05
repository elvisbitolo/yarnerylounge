"use client";

import { useEffect, useState } from "react";
import styles from "./groups.module.css";

const EMOJI = { "🌱": "Future WIMPs", "🧶": "Current WIMPs", "📐": "Pattern help", "✨": "Inspiration" };

export default function GroupTopics({ groupId, canPost, canBuildTopics = false, uid, userName }) {
  const [topics, setTopics] = useState([]);
  const [openKey, setOpenKey] = useState("");
  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [openThread, setOpenThread] = useState("");
  const [replies, setReplies] = useState([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newReply, setNewReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftEmoji, setDraftEmoji] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/groups/${groupId}/topics`)
      .then((res) => res.json())
      .then((data) => {
        if (alive && data.topics) setTopics(data.topics);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [groupId]);

  async function toggleTopic(key) {
    if (openKey === key) {
      setOpenKey("");
      return;
    }
    setOpenKey(key);
    setOpenThread("");
    setThreadsLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/groups/${groupId}/topics/${key}/threads`);
      const data = await res.json();
      if (res.ok) setThreads(data.threads || []);
      else setError(data.error || "Couldn't load conversations");
    } catch {
      setError("Couldn't load conversations");
    } finally {
      setThreadsLoading(false);
    }
  }

  async function openThreadView(threadId) {
    if (openThread === threadId) {
      setOpenThread("");
      return;
    }
    setOpenThread(threadId);
    setRepliesLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/groups/${groupId}/topics/${openKey}/threads/${threadId}/replies`);
      const data = await res.json();
      if (res.ok) setReplies(data.replies || []);
      else setError(data.error || "Couldn't load replies");
    } catch {
      setError("Couldn't load replies");
    } finally {
      setRepliesLoading(false);
    }
  }

  async function handleNewThread(e, topicKey) {
    e.preventDefault();
    if (!canPost) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/groups/${groupId}/topics/${topicKey}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, body: newBody }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't post");
        return;
      }
      setNewTitle("");
      setNewBody("");
      const res2 = await fetch(`/api/groups/${groupId}/topics/${topicKey}/threads`);
      const data2 = await res2.json();
      if (res2.ok) setThreads(data2.threads || []);
    } catch {
      setError("Couldn't post");
    } finally {
      setBusy(false);
    }
  }

  async function refreshTopics() {
    const res = await fetch(`/api/groups/${groupId}/topics`);
    const data = await res.json();
    if (res.ok) setTopics(data.topics || []);
  }

  async function handleCreateTopic(e) {
    e.preventDefault();
    if (!canBuildTopics || !draftName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/groups/${groupId}/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName, description: draftDesc, emoji: draftEmoji }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't create the sub-group");
        return;
      }
      setDraftName("");
      setDraftDesc("");
      setDraftEmoji("");
      setShowCreate(false);
      await refreshTopics();
    } catch {
      setError("Couldn't create the sub-group");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTopic(key, name) {
    if (!canBuildTopics) return;
    if (!window.confirm(`Remove the sub-group "${name}"? Conversations inside it stay put.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/groups/${groupId}/topics?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't remove the sub-group");
        return;
      }
      if (openKey === key) setOpenKey("");
      await refreshTopics();
    } catch {
      setError("Couldn't remove the sub-group");
    } finally {
      setBusy(false);
    }
  }

  async function handleReply(e, threadId) {
    e.preventDefault();
    if (!canPost) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/groups/${groupId}/topics/${openKey}/threads/${threadId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newReply }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't reply");
        return;
      }
      setNewReply("");
      const res2 = await fetch(`/api/groups/${groupId}/topics/${openKey}/threads/${threadId}/replies`);
      const data2 = await res2.json();
      if (res2.ok) setReplies(data2.replies || []);
    } catch {
      setError("Couldn't reply");
    } finally {
      setBusy(false);
    }
  }

  if (!canPost) {
    return (
      <aside className={styles.topicsSidebar}>
        <h2 className={styles.topicsTitle}>Topics & conversations</h2>
        <ul className={styles.topicsList}>
          {["🌱", "🧶", "📐", "✨"].map((emoji) => (
            <li key={emoji} className={styles.topicRow}>
              <span className={styles.topicIcon}>{emoji}</span>
              <span className={styles.topicName}>{EMOJI[emoji]}</span>
            </li>
          ))}
        </ul>
        <p className={styles.topicHint}>Join this group to talk, ask for pattern help, and swap inspiration.</p>
      </aside>
    );
  }

  return (
    <aside className={styles.topicsSidebar}>
      <h2 className={styles.topicsTitle}>Topics & conversations</h2>
      {error && <p className={styles.topicError}>{error}</p>}
      <ul className={styles.topicsList}>
        {topics.map((topic) => (
          <li key={topic.key} className={styles.topicItem}>
            <button
              className={styles.topicRow}
              onClick={() => toggleTopic(topic.key)}
              aria-expanded={openKey === topic.key}
            >
              <span className={styles.topicIcon}>{topic.emoji}</span>
              <span className={styles.topicName}>{topic.name}</span>
              <span className={styles.topicCount}>{topic.threadCount}</span>
            </button>
            {openKey === topic.key && (
              <div className={styles.topicBody}>
                <p className={styles.topicDesc}>{topic.description}</p>
                {canBuildTopics && (
                  <p>
                    <button
                      type="button"
                      className={styles.topicLinkBtn}
                      onClick={() => handleDeleteTopic(topic.key, topic.name)}
                      disabled={busy}
                    >
                      Remove this sub-group
                    </button>
                  </p>
                )}
                {threadsLoading ? (
                  <p className={styles.topicHint}>Loading conversations…</p>
                ) : threads.length === 0 ? (
                  <p className={styles.topicHint}>No conversations yet — start one below.</p>
                ) : (
                  <ul className={styles.threadList}>
                    {threads.map((thread) => (
                      <li key={thread.id} className={styles.threadItem}>
                        <button
                          className={styles.threadRow}
                          onClick={() => openThreadView(thread.id)}
                          aria-expanded={openThread === thread.id}
                        >
                          <span className={styles.threadTitle}>{thread.title}</span>
                          <span className={styles.threadMeta}>
                            {thread.replyCount || 0} replies · {thread.authorName}
                          </span>
                        </button>
                        {openThread === thread.id && (
                          <div className={styles.threadBody}>
                            <p className={styles.threadText}>{thread.body}</p>
                            {repliesLoading ? (
                              <p className={styles.topicHint}>Loading replies…</p>
                            ) : (
                              <ul className={styles.replyList}>
                                {replies.map((reply) => (
                                  <li key={reply.id} className={styles.replyItem}>
                                    <span className={styles.replyAuthor}>{reply.authorName}</span>
                                    <span className={styles.replyText}>{reply.text}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <form className={styles.replyForm} onSubmit={(e) => handleReply(e, thread.id)}>
                              <input
                                className={styles.topicInput}
                                value={newReply}
                                onChange={(e) => setNewReply(e.target.value)}
                                placeholder="Write a reply…"
                                maxLength={2000}
                              />
                              <button className={styles.topicBtn} disabled={busy || !newReply.trim()}>
                                {busy ? "Sending…" : "Reply"}
                              </button>
                            </form>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <form className={styles.newThreadForm} onSubmit={(e) => handleNewThread(e, topic.key)}>
                  <input
                    className={styles.topicInput}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="New conversation title…"
                    maxLength={120}
                  />
                  <textarea
                    className={styles.topicTextarea}
                    value={newBody}
                    onChange={(e) => setNewBody(e.target.value)}
                    placeholder="What's on your mind?"
                    rows={3}
                    maxLength={2000}
                  />
                  <button className={styles.topicBtn} disabled={busy || !newTitle.trim()}>
                    {busy ? "Posting…" : "Start conversation"}
                  </button>
                </form>
              </div>
            )}
          </li>
        ))}
      </ul>
      {canBuildTopics && (
        <div className={styles.newThreadForm}>
          {!showCreate ? (
            <button type="button" className={styles.topicBtn} onClick={() => setShowCreate(true)}>
              New sub-group
            </button>
          ) : (
            <form onSubmit={handleCreateTopic}>
              <input
                className={styles.topicInput}
                value={draftEmoji}
                onChange={(e) => setDraftEmoji(e.target.value)}
                placeholder="Emoji (optional)"
                maxLength={8}
              />
              <input
                className={styles.topicInput}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Sub-group name, e.g. Amigurumi Help"
                maxLength={60}
              />
              <input
                className={styles.topicInput}
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                placeholder="What is this sub-group for? (optional)"
                maxLength={200}
              />
              <button className={styles.topicBtn} disabled={busy || !draftName.trim()}>
                {busy ? "Creating…" : "Create sub-group"}
              </button>{" "}
              <button
                type="button"
                className={styles.topicLinkBtn}
                onClick={() => {
                  setShowCreate(false);
                  setError("");
                }}
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
    </aside>
  );
}