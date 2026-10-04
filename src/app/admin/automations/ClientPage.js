"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "../questions/questions.module.css";

const TRIGGERS = {
  new_member: "New member signs up",
  new_post: "A new post is published",
  event_rsvp: "A member RSVPs to an event",
  purchase: "A member buys access (event, course or space)",
  checklist_complete: "A member finishes the Welcome Checklist",
  course_completed: "A member completes all lessons in a course",
  space_joined: "A member joins a space",
  member_inactive: "A member hasn't visited in X days",
  milestone_reached: "A member reaches a points milestone",
};

const ACTIONS = {
  send_email: "Send an email",
  create_notification: "Create a notification",
  award_points: "Award points",
  add_member_to_space: "Add member to a space",
  send_dm: "Send a direct message",
  send_push: "Send a push notification",
};

const PLACEHOLDERS = {
  new_member: [
    { token: "memberName", label: "Member's name" },
    { token: "memberEmail", label: "Member's email" },
  ],
  new_post: [
    { token: "authorName", label: "Author's name" },
    { token: "postText", label: "Post text" },
  ],
  event_rsvp: [
    { token: "rsvpName", label: "Member's name" },
    { token: "eventTitle", label: "Event title" },
  ],
  purchase: [
    { token: "memberName", label: "Member's name" },
    { token: "memberEmail", label: "Member's email" },
    { token: "itemName", label: "What they bought" },
    { token: "targetType", label: "Item type" },
    { token: "spaceId", label: "Space ID" },
  ],
  checklist_complete: [
    { token: "memberName", label: "Member's name" },
    { token: "memberEmail", label: "Member's email" },
  ],
  course_completed: [
    { token: "memberName", label: "Member's name" },
    { token: "memberEmail", label: "Member's email" },
    { token: "courseName", label: "Course name" },
    { token: "courseId", label: "Course ID" },
    { token: "completionDate", label: "Completion date" },
  ],
  space_joined: [
    { token: "memberName", label: "Member's name" },
    { token: "memberEmail", label: "Member's email" },
    { token: "spaceName", label: "Space name" },
    { token: "spaceId", label: "Space ID" },
  ],
  member_inactive: [
    { token: "memberName", label: "Member's name" },
    { token: "memberEmail", label: "Member's email" },
    { token: "inactiveDays", label: "Days inactive" },
    { token: "spaceId", label: "Space ID" },
  ],
  milestone_reached: [
    { token: "memberName", label: "Member's name" },
    { token: "memberEmail", label: "Member's email" },
    { token: "milestonePoints", label: "Milestone points" },
    { token: "totalPoints", label: "Total points" },
  ],
};

export default function AdminAutomationsPage() {
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [automations, setAutomations] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("new_member");
  const [action, setAction] = useState("send_email");
  const [toMode, setToMode] = useState("owner");
  const [customEmail, setCustomEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [dmMessage, setDmMessage] = useState("");
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [inactiveDays, setInactiveDays] = useState(30);
  const [milestone, setMilestone] = useState(1000);
  const [points, setPoints] = useState(5);
  const [spaceId, setSpaceId] = useState("");
  const [expanded, setExpanded] = useState("");
  const [history, setHistory] = useState({});

  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const messageRef = useRef(null);
  const dmMessageRef = useRef(null);
  const pushBodyRef = useRef(null);

  const loadAutomations = useCallback(async () => {
    const res = await fetch("/api/admin/automations");
    if (res.ok) setAutomations((await res.json()).automations);
  }, []);

  const loadSpaces = useCallback(async () => {
    const res = await fetch("/api/spaces?admin=1");
    if (res.ok) setSpaces((await res.json()).spaces);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      loadAutomations();
      loadSpaces();
    });
    return unsub;
  }, [router, loadAutomations, loadSpaces]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  function insertPlaceholder(field, token) {
    const el =
      field === "subject"
        ? subjectRef.current
        : field === "body"
        ? bodyRef.current
        : field === "dmMessage"
        ? dmMessageRef.current
        : field === "pushBody"
        ? pushBodyRef.current
        : messageRef.current;
    if (!el) return;
    const placeholder = `{{${token}}}`;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const setter =
      field === "subject"
        ? setSubject
        : field === "body"
        ? setBody
        : field === "dmMessage"
        ? setDmMessage
        : field === "pushBody"
        ? setPushBody
        : setMessage;
    setter(el.value.slice(0, start) + placeholder + el.value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + placeholder.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function renderChips(field) {
    const items = PLACEHOLDERS[trigger] || [];
    if (items.length === 0) return null;
    return (
      <div className={styles.checkRow}>
        <span className={styles.subtitle} style={{ margin: 0 }}>Insert: </span>
        {items.map((item) => (
          <button
            key={item.token}
            type="button"
            className={styles.toggle}
            onClick={() => insertPlaceholder(field, item.token)}
          >
            {item.label}
          </button>
        ))}
      </div>
    );
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const to = toMode === "owner" ? "owner" : customEmail.trim();
      const baseConfig =
        action === "send_email"
          ? { to, subject, body }
          : action === "create_notification"
          ? { to: "owner", message, href: "/dashboard" }
          : action === "send_dm"
          ? { message: dmMessage, href: "/chat" }
          : action === "send_push"
          ? { title: pushTitle, body: pushBody, href: "/dashboard" }
          : action === "award_points"
          ? { points }
          : { spaceId };
      const config = {
        ...baseConfig,
        ...(trigger === "member_inactive" ? { inactiveDays: Number(inactiveDays) || 30 } : {}),
        ...(trigger === "milestone_reached" ? { milestonePoints: Number(milestone) || 1000 } : {}),
      };
      const res = await fetch("/api/admin/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, trigger, action, config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create automation");
      setName("");
      setSubject("");
      setBody("");
      setMessage("");
      setDmMessage("");
      setPushTitle("");
      setPushBody("");
      setSpaceId("");
      setCustomEmail("");
      await loadAutomations();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(automation) {
    setError("");
    try {
      const res = await fetch(`/api/admin/automations/${automation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !automation.active }),
      });
      if (!res.ok) throw new Error("Could not update automation");
      await loadAutomations();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    setError("");
    try {
      const res = await fetch(`/api/admin/automations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete automation");
      await loadAutomations();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleHistory(automationId) {
    setExpanded((cur) => {
      const next = cur === automationId ? "" : automationId;
      if (next && !history[next]) {
        fetch(`/api/admin/automations/${next}/history`)
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            if (json) setHistory((h) => ({ ...h, [next]: json }));
          })
          .catch(() => {});
      }
      return next;
    });
  }

  function formatRunTime(ms) {
    if (!ms) return "—";
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
      <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Automations</h1>
        <p className={styles.subtitle}>
          Trigger an action when something happens — welcome emails, new-member
          notifications, or bonus points.
        </p>
        {error && <p className={styles.error}>{error}</p>}

        <form className={styles.form} onSubmit={handleCreate}>
          <h2 className={styles.formTitle}>New automation</h2>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="a-name">Name</label>
            <input
              id="a-name"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Welcome new members"
              required
            />
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-trigger">When</label>
              <select
                id="a-trigger"
                className={styles.select}
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
              >
                {Object.entries(TRIGGERS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-action">Then</label>
              <select
                id="a-action"
                className={styles.select}
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                {Object.entries(ACTIONS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {action === "send_email" && (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="a-to">Send to</label>
                <select
                  id="a-to"
                  className={styles.select}
                  value={toMode}
                  onChange={(e) => setToMode(e.target.value)}
                >
                  <option value="owner">The community owner</option>
                  <option value="custom">A specific email address</option>
                </select>
              </div>
              {toMode === "custom" && (
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="a-custom-email">Email address</label>
                  <input
                    id="a-custom-email"
                    className={styles.input}
                    type="email"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="someone@example.com"
                    required
                  />
                </div>
              )}
              <div className={styles.field}>
                <label className={styles.label} htmlFor="a-subject">Subject</label>
                <input
                  id="a-subject"
                  ref={subjectRef}
                  className={styles.input}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Welcome aboard!"
                />
                {renderChips("subject")}
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="a-body">Email body</label>
                <textarea
                  id="a-body"
                  ref={bodyRef}
                  className={styles.textarea}
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hi, thanks for joining the community."
                />
                {renderChips("body")}
              </div>
            </>
          )}

          {action === "create_notification" && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-message">Notification message</label>
              <input
                id="a-message"
                ref={messageRef}
                className={styles.input}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Welcome aboard!"
              />
              {renderChips("message")}
            </div>
          )}

          {action === "send_dm" && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-dm-message">Direct message text</label>
              <textarea
                id="a-dm-message"
                ref={dmMessageRef}
                className={styles.textarea}
                rows={4}
                value={dmMessage}
                onChange={(e) => setDmMessage(e.target.value)}
                placeholder="Sent as a DM from the community owner to the member."
              />
              {renderChips("dmMessage")}
              <p className={styles.subtitle}>
                Creates a 1-on-1 chat between you and the member and sends this as the first message.
              </p>
            </div>
          )}

          {action === "send_push" && (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="a-push-title">Push notification title</label>
                <input
                  id="a-push-title"
                  className={styles.input}
                  value={pushTitle}
                  onChange={(e) => setPushTitle(e.target.value)}
                  placeholder="e.g. You earned a milestone!"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="a-push-body">Push notification body</label>
                <textarea
                  id="a-push-body"
                  ref={pushBodyRef}
                  className={styles.textarea}
                  rows={3}
                  value={pushBody}
                  onChange={(e) => setPushBody(e.target.value)}
                  placeholder="e.g. You've reached 1000 points. Keep going!"
                />
                {renderChips("pushBody")}
              </div>
            </>
          )}

          {trigger === "member_inactive" && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-inactive">Days inactive to trigger</label>
              <input
                id="a-inactive"
                className={styles.input}
                type="number"
                min={1}
                value={inactiveDays}
                onChange={(e) => setInactiveDays(Number(e.target.value))}
              />
              <p className={styles.subtitle}>
                Fires when a member hasn&apos;t visited for this many days.
              </p>
            </div>
          )}

          {trigger === "milestone_reached" && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-milestone">Points milestone</label>
              <select
                id="a-milestone"
                className={styles.select}
                value={milestone}
                onChange={(e) => setMilestone(Number(e.target.value))}
              >
                <option value={100}>100 points</option>
                <option value={500}>500 points</option>
                <option value={1000}>1000 points</option>
                <option value={5000}>5000 points</option>
              </select>
              <p className={styles.subtitle}>
                Fires when a member crosses this points threshold.
              </p>
            </div>
          )}

          {action === "award_points" && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-points">Points to award</label>
              <input
                id="a-points"
                className={styles.input}
                type="number"
                min={0}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
              />
            </div>
          )}

          {action === "add_member_to_space" && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="a-space">Space to add the member to</label>
              <select
                id="a-space"
                className={styles.select}
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
              >
                <option value="">
                  {trigger === "purchase"
                    ? "The space they just bought (recommended)"
                    : "Choose a space…"}
                </option>
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>{space.name}</option>
                ))}
              </select>
              <p className={styles.subtitle}>
                {trigger === "purchase"
                  ? "With the “A member buys access” trigger, leaving this empty adds buyers to the space they paid for."
                  : "The member is added to this space as a member."}
              </p>
            </div>
          )}

          <button className={styles.submit} disabled={busy}>
            {busy ? "Saving…" : "Create automation"}
          </button>
        </form>

        <h2 className={styles.listTitle}>Automations</h2>
        {automations.length === 0 ? (
          <p className={styles.empty}>No automations yet.</p>
        ) : (
          <div className={styles.list}>
            {automations.map((automation) => (
              <div key={automation.id} className={styles.item}>
                <div>
                  <p className={styles.itemName}>{automation.name}</p>
                  <p className={styles.itemMeta}>
                    {TRIGGERS[automation.trigger] || automation.trigger} →{" "}
                    {ACTIONS[automation.action] || automation.action}
                  </p>
                </div>
                <div className={styles.itemActions}>
                  <button
                    className={styles.toggle}
                    onClick={() => toggleHistory(automation.id)}
                  >
                    {expanded === automation.id ? "Hide history" : "History"}
                  </button>
                  <button
                    className={automation.active ? styles.toggleOn : styles.toggle}
                    onClick={() => handleToggle(automation)}
                  >
                    {automation.active ? "Pause" : "Resume"}
                  </button>
                  <button className={styles.delete} onClick={() => handleDelete(automation.id)}>
                    Delete
                  </button>
                </div>

                {expanded === automation.id && (
                  <div className={styles.history}>
                    {history[automation.id]?.stats && (
                      <p className={styles.itemMeta}>
                        Runs: <strong>{history[automation.id].stats.total || 0}</strong> · Success:{" "}
                        <strong>{history[automation.id].stats.success || 0}</strong> · Failed:{" "}
                        <strong>{history[automation.id].stats.failed || 0}</strong> · Last run:{" "}
                        {formatRunTime(history[automation.id].stats.lastRun)}
                      </p>
                    )}
                    {(history[automation.id]?.runs || []).length === 0 ? (
                      <p className={styles.subtitle}>No runs recorded yet.</p>
                    ) : (
                      <ul className={styles.historyList}>
                        {(history[automation.id]?.runs || []).map((run) => (
                          <li key={run.id} className={styles.historyItem}>
                            <span className={styles.itemMeta}>{formatRunTime(run.ranAt)}</span>
                            <span
                              className={
                                run.success ? styles.historyOk : styles.historyFail
                              }
                            >
                              {run.success ? "✓" : "✗"}
                            </span>
                            <span className={styles.itemMeta}>
                              {run.success ? "Success" : run.error || "Failed"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
</Nav>
  );
}
