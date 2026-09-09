"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import { roleBadgeLabel } from "@/lib/profile/roles";
import styles from "../rooms/admin.module.css";

export default function AdminMembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");

  const loadMembers = useCallback(async () => {
    const res = await fetch("/api/admin/members");
    if (res.ok) setMembers((await res.json()).members);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      loadMembers();
    });
    return unsub;
  }, [router, loadMembers]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  async function updateMember(id, changes) {
    setError("");
    const res = await fetch(`/api/admin/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Update failed");
      return;
    }
    await loadMembers();
  }

  async function deleteMember(member) {
    setError("");
    const ok = window.confirm(
      `Delete ${member.name || "this member"} permanently?\n\nThis removes their account, posts, and all data. This can't be undone.`
    );
    if (!ok) return;
    const res = await fetch(`/api/admin/members/${member.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Delete failed");
      return;
    }
    await loadMembers();
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? members.filter(
        (m) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.email || "").toLowerCase().includes(q)
      )
    : members;

  return (
      <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Members</h1>
        <p className={styles.linkRow}>
          <a className={styles.link} href="/admin/hosts">Assign scoped hosts →</a>
        </p>
        {error && <p className={styles.error}>{error}</p>}

        <input
          className={styles.input}
          type="search"
          placeholder="Search members…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 360, marginBottom: 16 }}
        />

        {filtered.length === 0 ? (
          <p className={styles.empty}>No members found.</p>
        ) : (
          <div className={styles.list}>
            {filtered.map((member) => (
              <div key={member.id} className={styles.item}>
                <div>
                  <p className={styles.itemName}>
                    {member.name || "Unnamed"}
                    {["owner", "moderator"].includes(member.role) && (
                      <span style={{ fontSize: 12, color: "#9b9bab", fontWeight: 500 }}>
                        {" "}({roleBadgeLabel(member.role, member.roleLabel).toLowerCase()})
                      </span>
                    )}
                  </p>
                  <p className={styles.itemMeta}>
                    {member.email || ""}
                    {member.suspended ? " · suspended" : ""}
                    {member.tier ? ` · ${member.tier}` : ""}
                    {member.subStatus === "active" || member.subStatus === "trial"
                      ? ` · subscribed (${member.subStatus})`
                      : member.subStatus !== "none"
                        ? ` · sub ${member.subStatus}`
                        : ""}
                  </p>
                </div>
                {member.role !== "owner" && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <a
                      className={styles.toggle}
                      style={{ display: "inline-block", height: 36, padding: "8px 14px", fontSize: 13 }}
                      href={`/members/${member.id}`}
                    >
                      Profile
                    </a>
                    <select
                      className={styles.input}
                      style={{ width: 130, height: 36, padding: "0 8px" }}
                      value={member.role === "moderator" ? "moderator" : "member"}
                      onChange={(e) => updateMember(member.id, { role: e.target.value })}
                    >
                      <option value="member">Member</option>
                      <option value="moderator">Moderator</option>
                    </select>
                  <a
                    className={styles.toggle}
                    style={{ display: "inline-block", height: 36, padding: "8px 14px", fontSize: 13 }}
                    href={`/admin/hosts?userId=${member.id}`}
                  >
                    Host
                  </a>
                  <button
                    className={member.foundingMember ? styles.submit : styles.toggle}
                    style={{ height: 36, padding: "0 14px", fontSize: 13 }}
                    onClick={() => updateMember(member.id, { foundingMember: !member.foundingMember })}
                  >
                    {member.foundingMember ? "Unmark 🧶" : "Mark founding"}
                  </button>
                  <button
                    className={member.suspended ? styles.submit : styles.delete}
                    style={{ height: 36, padding: "0 14px", fontSize: 13 }}
                    onClick={() => updateMember(member.id, { suspended: !member.suspended })}
                  >
                    {member.suspended ? "Unsuspend" : "Suspend"}
                  </button>
                  <button
                    className={styles.delete}
                    style={{ height: 36, padding: "0 14px", fontSize: 13 }}
                    onClick={() => deleteMember(member)}
                  >
                    Delete
                  </button>
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
