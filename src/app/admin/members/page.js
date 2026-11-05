"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import ConfirmModal from "@/components/ConfirmModal";
import { roleBadgeLabel } from "@/lib/profile/roles";
import styles from "../rooms/admin.module.css";

const PAGE_SIZE = 10;
const PLAN_OPTIONS = [
  { value: "flirting", label: "Flirting (Free)", rank: 0 },
  { value: "hooking-up", label: "Hooking Up", rank: 1 },
  { value: "moving-in", label: "Moving In", rank: 2 },
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function csvCell(value) {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}

export default function AdminMembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [planChange, setPlanChange] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);

  const loadMembers = useCallback(async () => {
    const res = await fetch("/api/admin/members");
    if (res.ok) setMembers((await res.json()).members || []);
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
      return false;
    }
    await loadMembers();
    return true;
  }

  function requestPlanChange(member, nextPlan) {
    const current = PLAN_OPTIONS.find((option) => option.value === (member.plan || "flirting"));
    const next = PLAN_OPTIONS.find((option) => option.value === nextPlan);
    if (!next || nextPlan === (member.plan || "flirting")) return;
    if (current && next.rank < current.rank) {
      setError("");
      setPlanChange({ member, nextPlan });
      return;
    }
    updateMember(member.id, { plan: nextPlan });
  }

  async function confirmPlanChange() {
    if (!planChange) return;
    setPlanBusy(true);
    try {
      const updated = await updateMember(planChange.member.id, { plan: planChange.nextPlan });
      if (updated) setPlanChange(null);
    } finally {
      setPlanBusy(false);
    }
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
      const res = await fetch(`/api/admin/members/${member.id}`, { method: "DELETE" });
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((member) => {
      const matchesQuery = !q ||
        [member.name, member.email, member.id].some((value) => String(value || "").toLowerCase().includes(q));
      const matchesPlan = planFilter === "all" || (member.plan || "flirting") === planFilter;
      const matchesRole = roleFilter === "all" || (member.role || "member") === roleFilter;
      const status = member.suspended ? "suspended" :
        ["active", "trial"].includes(member.subStatus) ? "active" : "inactive";
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      return matchesQuery && matchesPlan && matchesRole && matchesStatus;
    });
  }, [members, query, planFilter, roleFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageMembers = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const start = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(currentPage * PAGE_SIZE, filtered.length);

  function exportMembers() {
    const headers = ["Name", "Email", "Plan", "Role", "Status", "Joined"];
    const rows = filtered.map((member) => [
      member.name || "Unnamed",
      member.email,
      PLAN_OPTIONS.find((option) => option.value === (member.plan || "flirting"))?.label || member.plan,
      member.role,
      member.suspended ? "Suspended" : ["active", "trial"].includes(member.subStatus) ? "Active" : "Inactive",
      formatDate(member.createdAt),
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "speakeasy-members.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function pageNumbers() {
    if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
    const values = new Set([1, pageCount, currentPage, currentPage - 1, currentPage + 1]);
    return [...values].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  }

  return (
    <>
      <div className={styles.container + " " + styles.membersContainer}>
        <div className={styles.membersHeader}>
          <div>
            <h1 className={styles.title}>Members</h1>
            <p className={styles.membersSubtitle}>Manage your community, subscriptions and member access.</p>
          </div>
          <a className={styles.link} href="/admin/hosts">Assign scoped hosts →</a>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.memberToolbar}>
          <input
            className={styles.input + " " + styles.memberSearch}
            type="search"
            placeholder="Search by name, email or member ID…"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            aria-label="Search members"
          />
          <select className={styles.input + " " + styles.memberFilter} value={planFilter} onChange={(event) => { setPlanFilter(event.target.value); setPage(1); }} aria-label="Filter by plan">
            <option value="all">All Plans</option>
            {PLAN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select className={styles.input + " " + styles.memberFilter} value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }} aria-label="Filter by role">
            <option value="all">All Roles</option>
            <option value="owner">Owner</option>
            <option value="moderator">Moderator</option>
            <option value="host">Host</option>
            <option value="member">Member</option>
          </select>
          <select className={styles.input + " " + styles.memberFilter} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} aria-label="Filter by status">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
          <button type="button" className={styles.exportButton} onClick={exportMembers}>Export CSV ↓</button>
        </div>

        <div className={styles.membersDesktopTable}>
        <div className={styles.membersTableWrap}>
          <table className={styles.membersTable}>
            <thead>
              <tr>
                <th>#</th>
                <th>Member</th>
                <th>Email</th>
                <th>Plan</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageMembers.map((member, index) => {
                const memberPlan = member.plan || "flirting";
                const isActive = ["active", "trial"].includes(member.subStatus);
                const statusLabel = member.suspended ? "Suspended" : isActive ? (member.subStatus === "trial" ? "Trial" : "Active") : "Inactive";
                return (
                  <tr key={member.id}>
                    <td className={styles.memberIndex}>{start + index}</td>
                    <td>
                      <a className={styles.memberIdentity} href={`/members/${member.id}`}>
                        <span className={styles.memberAvatar} style={member.photoURL ? { backgroundImage: `url("${member.photoURL}")` } : undefined}>
                          {!member.photoURL && (member.name || "U").trim().charAt(0).toUpperCase()}
                        </span>
                        <span className={styles.memberName}>{member.name || "Unnamed"}</span>
                      </a>
                    </td>
                    <td className={styles.memberEmail}>{member.email || "—"}</td>
                    <td>
                      {role === "owner" && !["owner", "moderator"].includes(member.role) ? (
                        <select className={styles.tableSelect} value={memberPlan} onChange={(event) => requestPlanChange(member, event.target.value)} aria-label={`Plan for ${member.name || member.email}`}>
                          {[...PLAN_OPTIONS].sort((a, b) => Number(b.value === memberPlan) - Number(a.value === memberPlan)).map((option) => (
                            <option key={option.value} value={option.value} >{option.label}</option>
                          ))}
                        </select>
                      ) : <span className={styles.planPill}>{PLAN_OPTIONS.find((option) => option.value === memberPlan)?.label || memberPlan}</span>}
                    </td>
                    <td>
                      {role === "owner" && member.role !== "owner" ? (
                        <select className={styles.tableSelect} value={member.role === "moderator" ? "moderator" : "member"} onChange={(event) => updateMember(member.id, { role: event.target.value })} aria-label={`Role for ${member.name || member.email}`}>
                          <option value="member">Member</option><option value="moderator">Moderator</option>
                        </select>
                      ) : <span className={styles.rolePill}>{roleBadgeLabel(member.role, member.roleLabel)}</span>}
                    </td>
                    <td><span className={member.suspended ? styles.statusSuspended : isActive ? styles.statusActive : styles.statusInactive}>{statusLabel}</span></td>
                    <td className={styles.memberJoined}>{formatDate(member.createdAt)}</td>
                    <td>
                      <div className={styles.memberActions}>
                        <a className={styles.actionLink} href={`/members/${member.id}`}>Profile</a>
                        {member.role !== "owner" && <>
                          <a className={styles.actionLink} href={`/admin/hosts?userId=${member.id}`}>Host</a>
                          {role === "owner" && <>
                            <button type="button" className={styles.actionLink} onClick={() => updateMember(member.id, { foundingMember: !member.foundingMember })}>{member.foundingMember ? "Unmark 🧶" : "Mark founding"}</button>
                            <button type="button" className={styles.actionLink} onClick={() => updateMember(member.id, { suspended: !member.suspended })}>{member.suspended ? "Unsuspend" : "Suspend"}</button>
                            <button type="button" className={styles.actionDelete} onClick={() => requestDelete(member)}>Delete</button>
                          </>}
                        </>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pageMembers.length === 0 && <tr><td colSpan={8} className={styles.membersEmpty}>No members match these filters.</td></tr>}
            </tbody>
          </table>
        </div>

        </div>

        <div className={styles.membersMobileList}>
          {pageMembers.map((member, index) => {
            const memberPlan = member.plan || "flirting";
            const isActive = ["active", "trial"].includes(member.subStatus);
            const statusLabel = member.suspended ? "Suspended" : isActive ? (member.subStatus === "trial" ? "Trial" : "Active") : "Inactive";
            return (
              <article className={styles.mobileMemberCard} key={member.id}>
                <div className={styles.mobileMemberTop}>
                  <a className={styles.memberIdentity} href={`/members/${member.id}`}>
                    <span className={styles.memberAvatar + " " + styles.mobileMemberAvatar} style={member.photoURL ? { backgroundImage: `url("${member.photoURL}")` } : undefined}>
                      {!member.photoURL && (member.name || "U").trim().charAt(0).toUpperCase()}
                    </span>
                    <span className={styles.mobileMemberIdentityText}>
                      <strong className={styles.mobileMemberName}>{member.name || "Unnamed"}</strong>
                      <span className={styles.mobileMemberEmail}>{member.email || "No email"}</span>
                    </span>
                  </a>
                  <span className={member.suspended ? styles.statusSuspended : isActive ? styles.statusActive : styles.statusInactive}>{statusLabel}</span>
                </div>

                <dl className={styles.mobileMemberDetails}>
                  <div><dt>Plan</dt><dd>
                    {role === "owner" && member.role !== "owner" ? (
                      <select className={styles.mobileMemberSelect} value={memberPlan} onChange={(event) => updateMember(member.id, { plan: event.target.value })} aria-label={`Plan for ${member.name || member.email}`}>
                        {PLAN_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : <span className={styles.planPill}>{PLAN_OPTIONS.find((option) => option.value === memberPlan)?.label || memberPlan}</span>}
                  </dd></div>
                  <div><dt>Role</dt><dd>
                    {role === "owner" && member.role !== "owner" ? (
                      <select className={styles.mobileMemberSelect} value={member.role === "moderator" ? "moderator" : "member"} onChange={(event) => updateMember(member.id, { role: event.target.value })} aria-label={`Role for ${member.name || member.email}`}>
                        <option value="member">Member</option><option value="moderator">Moderator</option>
                      </select>
                    ) : <span className={styles.rolePill}>{roleBadgeLabel(member.role, member.roleLabel)}</span>}
                  </dd></div>
                  <div><dt>Joined</dt><dd>{formatDate(member.createdAt)}</dd></div>
                  <div><dt>Member #</dt><dd>{start + index}</dd></div>
                </dl>

                <div className={styles.mobileMemberActions}>
                  <a className={styles.actionLink} href={`/members/${member.id}`}>View profile</a>
                  {member.role !== "owner" && <>
                    <a className={styles.actionLink} href={`/admin/hosts?userId=${member.id}`}>Host</a>
                    {role === "owner" && <>
                      <button type="button" className={styles.actionLink} onClick={() => updateMember(member.id, { foundingMember: !member.foundingMember })}>{member.foundingMember ? "Unmark founding" : "Mark founding"}</button>
                      <button type="button" className={styles.actionLink} onClick={() => updateMember(member.id, { suspended: !member.suspended })}>{member.suspended ? "Unsuspend" : "Suspend"}</button>
                      <button type="button" className={styles.actionDelete} onClick={() => requestDelete(member)}>Delete</button>
                    </>}
                  </>}
                </div>
              </article>
            );
          })}
          {pageMembers.length === 0 && <p className={styles.mobileMembersEmpty}>No members match these filters.</p>}
        </div>

        <div className={styles.paginationFooter}>
          <span className={styles.paginationSummary}>Showing <strong>{start}–{end}</strong> of <strong>{filtered.length}</strong> members</span>
          <nav className={styles.pagination} aria-label="Members pagination">
            <button type="button" className={styles.pageButton} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹ <span>Previous</span></button>
            {pageNumbers().map((number, index, numbers) => (
              <span className={styles.pageNumberGroup} key={number}>
                {index > 0 && number - numbers[index - 1] > 1 && <span className={styles.pageEllipsis}>…</span>}
                <button type="button" aria-current={currentPage === number ? "page" : undefined} className={currentPage === number ? styles.pageButtonActive : styles.pageButton} onClick={() => setPage(number)}>{number}</button>
              </span>
            ))}
            <button type="button" className={styles.pageButton} disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><span>Next</span> ›</button>
          </nav>
        </div>
      </div>
      <ConfirmModal
        open={!!planChange}
        title="Confirm membership downgrade"
        message={planChange ? `Change ${planChange.member.name || planChange.member.email || "this member"} from ${PLAN_OPTIONS.find((option) => option.value === (planChange.member.plan || "flirting"))?.label} to ${PLAN_OPTIONS.find((option) => option.value === planChange.nextPlan)?.label}? This takes effect immediately and removes access to features exclusive to the previous tier.` : ""}
        confirmLabel="Apply downgrade"
        busy={planBusy}
        busyLabel="Updating…"
        danger
        onConfirm={confirmPlanChange}
        onCancel={() => !planBusy && setPlanChange(null)}
      />
      <ConfirmModal
        open={!!deleting}
        title="Delete member"
        message={`Delete ${deleting?.name || "this member"} permanently?\n\nThis removes their account, posts, and all data. This can't be undone.`}
        confirmLabel="Delete"
        busy={delBusy}
        busyLabel="Deleting…"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
