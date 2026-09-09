"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "../rooms/admin.module.css";

const SCOPE_TYPES = [
  { value: "room", label: "Room" },
  { value: "event", label: "Event" },
  { value: "course", label: "Course" },
  { value: "group", label: "Group" },
  { value: "space", label: "Space" },
];

export default function AdminHostsPage() {
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [members, setMembers] = useState([]);
  const [scopeOptions, setScopeOptions] = useState({});
  const [scopeType, setScopeType] = useState(
    () => (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("scopeType") || "room"
      : "room")
  );
  const [scopeId, setScopeId] = useState(
    () => (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("scopeId") || ""
      : "")
  );
  const [assignments, setAssignments] = useState([]);
  const [memberId, setMemberId] = useState(
    () => (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("userId") || ""
      : "")
  );
  const [hostRole, setHostRole] = useState("host");
  const [busy, setBusy] = useState(false);

  const loadScopes = useCallback(async () => {
    const res = await fetch("/api/admin/host-assignments/scopes");
    if (res.ok) {
      const data = await res.json();
      setScopeOptions(data.scopes || {});
    }
  }, []);

  const loadAssignments = useCallback(async () => {
    if (!scopeId) return;
    const res = await fetch(
      `/api/admin/host-assignments?scopeType=${scopeType}&scopeId=${scopeId}`
    );
    if (res.ok) setAssignments((await res.json()).assignments || []);
  }, [scopeType, scopeId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      loadScopes();
      fetch("/api/admin/members")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setMembers(data.members));
    });
    return unsub;
  }, [router, loadScopes]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  useEffect(() => {
    if (!scopeId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/admin/host-assignments?scopeType=${scopeType}&scopeId=${scopeId}`
      );
      if (!res.ok || cancelled) return;
      const data = await res.json();
      setAssignments(data.assignments || []);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scopeType, scopeId]);

  const memberName = (id) => {
    const m = members.find((x) => x.id === id);
    return m ? m.name || m.email || "Member" : id;
  };

  async function assignHost(e) {
    e.preventDefault();
    setError("");
    if (!scopeId || !memberId) {
      setError("Choose a scope and a member.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/host-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeType, scopeId, userId: memberId, role: hostRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign");
      setMemberId("");
      await loadAssignments();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(a) {
    setError("");
    const res = await fetch(
      `/api/admin/host-assignments/revoke?scopeType=${a.scopeType}&scopeId=${a.scopeId}&userId=${a.userId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to revoke");
      return;
    }
    await loadAssignments();
  }

  const options = scopeOptions[scopeType] || [];

  return (
      <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Scoped hosts</h1>
        <p className={styles.itemMeta}>
          Grant host or co-host powers for a specific room, event, course, group, or space.
          Scoped hosts never gain global admin access.
        </p>
        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.fieldRow}>
          <select
            className={styles.input}
            style={{ width: 160, height: 40, padding: "0 8px" }}
            value={scopeType}
            onChange={(e) => {
              setScopeType(e.target.value);
              setScopeId("");
            }}
          >
            {SCOPE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            className={styles.input}
            style={{ flex: 1, height: 40, padding: "0 8px" }}
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
          >
            <option value="">Choose a {scopeType}…</option>
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>

        <form className={styles.form} onSubmit={assignHost}>
          <div className={styles.fieldRow}>
            <select
              className={styles.input}
              style={{ flex: 1, height: 40, padding: "0 8px" }}
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">Choose a member…</option>
              {members
                .filter((m) => m.role !== "owner")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.email || "Member"}
                  </option>
                ))}
            </select>
            <select
              className={styles.input}
              style={{ width: 130, height: 40, padding: "0 8px" }}
              value={hostRole}
              onChange={(e) => setHostRole(e.target.value)}
            >
              <option value="host">Host</option>
              <option value="co-host">Co-host</option>
            </select>
            <button className={styles.submit} disabled={busy}>
              {busy ? "Assigning…" : "Assign"}
            </button>
          </div>
        </form>

        <h2 className={styles.listTitle}>Assignments for this scope</h2>
        {assignments.length === 0 ? (
          <p className={styles.empty}>No hosts assigned yet.</p>
        ) : (
          <div className={styles.list}>
            {assignments.map((a) => (
              <div key={a.id} className={styles.item}>
                <div>
                  <p className={styles.itemName}>
                    {memberName(a.userId)}
                    <span style={{ fontSize: 12, color: "#9b9bab", fontWeight: 500 }}>
                      {" "}
                      · {a.role}
                    </span>
                  </p>
                </div>
                <button
                  className={styles.delete}
                  style={{ height: 36, padding: "0 14px", fontSize: 13 }}
                  onClick={() => revoke(a)}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
</Nav>
  );
}
