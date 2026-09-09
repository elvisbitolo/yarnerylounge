"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "../admin/rooms/admin.module.css";

function scopeHref(scope) {
  if (scope.scopeType === "room") return `/rooms/${scope.slug}`;
  if (scope.scopeType === "event") return `/events`;
  if (scope.scopeType === "course") return `/host/courses/${scope.scopeId}`;
  if (scope.scopeType === "group") return `/groups/${scope.slug}`;
  if (scope.scopeType === "space") return `/spaces/${scope.slug}`;
  return "#";
}

export default function HostPage() {
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [scopes, setScopes] = useState([]);
  const [announcing, setAnnouncing] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/host/scopes");
    if (res.ok) setScopes((await res.json()).scopes || []);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      load();
    });
    return unsub;
  }, [router, load]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  async function sendAnnouncement(scope) {
    setError("");
    setStatus("");
    if (!message.trim()) {
      setError("Write a message first.");
      return;
    }
    const res = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience: scope.scopeType, scopeId: scope.scopeId, message }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to send");
      return;
    }
    setStatus(`Announcement sent to ${data.sentCount} member${data.sentCount === 1 ? "" : "s"}.`);
    setMessage("");
    setAnnouncing("");
  }

  const announceable = scopes.filter((s) => s.scopeType !== "course");
  const creatable = scopes.filter((s) => s.scopeType === "space" || s.scopeType === "group");

  return (
    <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Host tools</h1>
        <p className={styles.itemMeta}>
          Everything you host in one place. Open your rooms, create rooms in the
          spaces and groups you host, and message the members you serve.
        </p>
        {error && <p className={styles.error}>{error}</p>}
        {status && <p className={styles.success}>{status}</p>}

        {scopes.length === 0 ? (
          <p className={styles.empty}>
            You don&apos;t host anything yet. Ask an admin to assign you a room,
            space, or group.
          </p>
        ) : (
          <div className={styles.list}>
            {scopes.map((scope) => (
              <div key={`${scope.scopeType}-${scope.scopeId}`} className={styles.item}>
                <div>
                  <p className={styles.itemName}>
                    {scope.name}
                    <span style={{ fontSize: 12, color: "#9b9bab", fontWeight: 500 }}>
                      {" "}
                      · {scope.scopeType} · {scope.role}
                    </span>
                  </p>
                </div>
                <div className={styles.itemActions}>
                  <Link className={styles.toggle} href={scopeHref(scope)}>
                    Open
                  </Link>
                  {scope.scopeType !== "course" && (
                    <button
                      className={styles.toggle}
                      onClick={() => {
                        setAnnouncing(announcing === scope.scopeId ? "" : scope.scopeId);
                        setMessage("");
                      }}
                    >
                      {announcing === scope.scopeId ? "Cancel" : "Announce"}
                    </button>
                  )}
                  {(scope.scopeType === "space" || scope.scopeType === "group") && (
                    <Link
                      className={styles.toggle}
                      href={`/host/rooms?scopeType=${scope.scopeType}&scopeId=${scope.scopeId}`}
                    >
                      Create room
                    </Link>
                  )}
                  {scope.scopeType === "space" && (
                    <>
                      <Link
                        className={styles.toggle}
                        href={`/host/courses?spaceId=${scope.scopeId}`}
                      >
                        Manage courses
                      </Link>
                      <Link
                        className={styles.toggle}
                        href={`/host/events?spaceId=${scope.scopeId}`}
                      >
                        Schedule events
                      </Link>
                    </>
                  )}
                  {scope.scopeType === "event" && (
                    <Link className={styles.toggle} href={`/host/events`}>
                      Manage event
                    </Link>
                  )}
                </div>
                {announcing === scope.scopeId && (
                  <div style={{ width: "100%", marginTop: 12 }}>
                    <textarea
                      className={styles.input}
                      style={{ minHeight: 90, padding: "10px 12px", fontFamily: "inherit" }}
                      maxLength={2000}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={`Message for ${scope.name} members…`}
                    />
                    <div className={styles.fieldRow}>
                      <button
                        className={styles.submit}
                        onClick={() => sendAnnouncement(scope)}
                      >
                        Send
                      </button>
                      <span className={styles.itemMeta}>{message.length}/2000</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {announceable.length === 0 && creatable.length === 0 && null}
      </div>
    </Nav>
  );
}
