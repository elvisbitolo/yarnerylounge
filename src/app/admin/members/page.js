"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import ConfirmModal from "@/components/ConfirmModal";
import { roleBadgeLabel } from "@/lib/profile/roles";
import styles from "../rooms/admin.module.css";

export default function AdminMembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [planDrafts, setPlanDrafts] = useState({});
  const [planBusy, setPlanBusy] = useState(null);

  const loadMembers = useCallback(async () => {
    const res = await fetch("/api/admin/members");
    if (res.ok) {
      const nextMembers = (await res.json()).members;
      setMembers(nextMembers);
      setPlanDrafts((current) => Object.fromEntries(nextMembers.map((member) => [member.id, current[member.id] || { tier: member.tier || "flirting", expiresAt: member.expiresAt ? new Date(member.expiresAt).toISOString().slice(0, 10) : "" }])));
    }
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

  function updatePlanDraft(id, changes) {
    setPlanDrafts((current) => ({ ...current, [id]: { ...current[id], ...changes } }));
  }

  async function savePlan(member) {
    const draft = planDrafts[member.id];
    if (!draft?.tier || !draft?.expiresAt) { setError("Choose a plan and expiry date."); return; }
    setPlanBusy(member.id); setError("");
    try {
      const res = await fetch(`/api/admin/members/${member.id}/plan`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Plan update failed");
      await loadMembers();
      setError(data.emailSent ? "Plan updated and member notified by email." : "Plan updated. Email was not sent; check the member email and email service.");
    } catch (err) { setError(err.message || "Plan update failed"); }
    finally { setPlanBusy(null); }
  }

  function requestDelete(member) {
    setError("");
    setDeleting(member);
  }

  async function confirmDelete() {
    const member = deleting;
    if (!member) return;
    setDelBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/members/${member.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Delete failed");
        return;
      }
      await loadMembers();
    } finally {
      setDeleting(null);
      setDelBusy(false);
    }
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
    <>
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
                  <div className={styles.itemActions}>
<a
                      className={styles.toggle}
                      style={{ display: "inline-block", height: 36, padding: "8px 14px", fontSize: 13 }}
                      href={`/members/${member.id}`}
                    >
                      Profile
                    </a>
                    {role === "owner" && (
                      <select
                        className={styles.input}
                        style={{ width: 130, height: 36, padding: "0 8px" }}
                        value={member.role === "moderator" ? "moderator" : "member"}
                        onChange={(e) => updateMember(member.id, { role: e.target.value })}
                      >
                        <option value="member">Member</option>
                        <option value="moderator">Moderator</option>
                      </select>
                    )}
                    <a
                      className={styles.toggle}
                      style={{ display: "inline-block", height: 36, padding: "8px 14px", fontSize: 13 }}
                      href={`/admin/hosts?userId=${member.id}`}
                    >
                      Host
                    </a>
                    {role === "owner" && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", width: "100%" }}>
                        <select className={styles.input} style={{ width: 145, height: 36 }} value={planDrafts[member.id]?.tier || "flirting"} onChange={(e) => updatePlanDraft(member.id, { tier: e.target.value })}>
                          <option value="flirting">Flirting</option><option value="hooking-up">Hooking Up</option><option value="moving-in">Moving In</option>
                        </select>
                        <input className={styles.input} style={{ width: 155, height: 36 }} type="date" min={new Date().toISOString().slice(0, 10)} value={planDrafts[member.id]?.expiresAt || ""} onChange={(e) => updatePlanDraft(member.id, { expiresAt: e.target.value })} aria-label="Membership expiry date" />
                        <button className={styles.submit} style={{ height: 36, padding: "0 14px", fontSize: 13 }} disabled={planBusy === member.id} onClick={() => savePlan(member)}>{planBusy === member.id ? "Saving…" : "Save plan"}</button>
                      </div>
                    )}
                    {role === "owner" && (
                      <button
                        className={member.foundingMember ? styles.submit : styles.toggle}
                        style={{ height: 36, padding: "0 14px", fontSize: 13 }}
                        onClick={() => updateMember(member.id, { foundingMember: !member.foundingMember })}
                      >
                        {member.foundingMember ? "Unmark 🧶" : "Mark founding"}
                      </button>
                    )}
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
                    onClick={() => requestDelete(member)}
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
      <ConfirmModal
        open={!!deleting}
        title="Delete member"
        message={`Delete ${deleting?.name || "this member"} permanently?

This removes their account, posts, and all data. This can't be undone.`}
        confirmLabel="Delete"
        busy={delBusy}
        busyLabel="Deleting…"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
