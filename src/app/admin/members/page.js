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
const ASSIGNABLE_ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "host", label: "Host" },
  { value: "moderator", label: "Moderator" },
];

function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

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

function memberStatus(member) {
  const code = member.subStatus || "none";
  const category = member.status || (
    member.suspended || code === "suspended"
      ? "suspended"
      : ["role", "trial", "active", "past_due"].includes(code)
        ? "active"
        : "inactive"
  );
  const label = member.statusLabel || (
    category === "suspended"
      ? "Suspended"
      : code === "role"
        ? "Role access"
        : code === "past_due"
          ? "Payment past due"
          : code === "trial"
            ? "Trial"
            : code === "active"
              ? "Active"
              : "Inactive"
  );
  return { category, label };
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
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState({
    id: "",
    name: "",
    plan: "flirting",
    role: "member",
    expiresAt: "",
    foundingMember: false,
    suspended: false,
  });
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    password: "",
    plan: "flirting",
    role: "member",
    expiresAt: "",
  });

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

  useEffect(() => {
    if (!addOpen && !editOpen) return undefined;
    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      if (addOpen && !addBusy) setAddOpen(false);
      if (editOpen && !editBusy) setEditOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [addOpen, addBusy, editOpen, editBusy]);

  async function updateMember(id, changes, setFailure = setError) {
    setFailure("");
    const res = await fetch(`/api/admin/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!res.ok) {
      const data = await res.json();
      setFailure(data.error || "Update failed");
      return false;
    }
    await loadMembers();
    return true;
  }

  function openEditMember(member) {
    setError("");
    setEditError("");
    const currentRole = String(member.role || "member").toLowerCase();
    setEditForm({
      id: member.id,
      name: member.name || member.email || "this member",
      plan: member.plan || "flirting",
      role: ASSIGNABLE_ROLE_OPTIONS.some((option) => option.value === currentRole) ? currentRole : "member",
      expiresAt: toDateInputValue(member.expiresAt),
      foundingMember: Boolean(member.foundingMember),
      suspended: Boolean(member.suspended),
    });
    setEditOpen(true);
  }

  function closeEditMember() {
    if (editBusy) return;
    setEditOpen(false);
  }

  function updateEditField(field, value) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  async function submitEditMember(event) {
    event.preventDefault();
    if (editBusy) return;
    setEditError("");
    setEditBusy(true);
    try {
      const updated = await updateMember(editForm.id, {
        plan: editForm.plan,
        role: editForm.role,
        expiresAt: editForm.plan === "flirting" ? null : (editForm.expiresAt || null),
        foundingMember: editForm.foundingMember,
        suspended: editForm.suspended,
      }, setEditError);
      if (updated) setEditOpen(false);
    } finally {
      setEditBusy(false);
    }
  }

  function openAddMember() {
    setAddError("");
    setAddForm({ name: "", email: "", password: "", plan: "flirting", role: "member", expiresAt: "" });
    setAddOpen(true);
  }

  function closeAddMember() {
    if (addBusy) return;
    setAddOpen(false);
  }

  function updateAddField(field, value) {
    setAddForm((current) => ({ ...current, [field]: value }));
  }

  async function submitAddMember(event) {
    event.preventDefault();
    if (addBusy) return;
    setAddError("");
    setAddBusy(true);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not create member");
      setAddOpen(false);
      setAddForm({ name: "", email: "", password: "", plan: "flirting", role: "member", expiresAt: "" });
      await loadMembers();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddBusy(false);
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
      const matchesStatus = statusFilter === "all" || memberStatus(member).category === statusFilter;
      return matchesQuery && matchesPlan && matchesRole && matchesStatus;
    });
  }, [members, query, planFilter, roleFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageMembers = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const start = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(currentPage * PAGE_SIZE, filtered.length);

  function exportMembers() {
    const headers = ["Name", "Email", "Plan", "Role", "Status", "Expires", "Last Seen", "Joined"];
    const rows = filtered.map((member) => [
      member.name || "Unnamed",
      member.email,
      PLAN_OPTIONS.find((option) => option.value === (member.plan || "flirting"))?.label || member.plan,
      member.role,
      memberStatus(member).label,
      formatDate(member.expiresAt),
      formatDate(member.lastSeenAt),
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
          <div className={styles.membersHeaderActions}>
            <a className={styles.link} href="/admin/hosts">Assign scoped hosts →</a>
            {role === "owner" && (
              <button type="button" className={styles.addMemberButton} onClick={openAddMember}>
                + Add member
              </button>
            )}
          </div>
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
                <th>Expires</th>
                <th>Last Seen</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageMembers.map((member, index) => {
                const memberPlan = member.plan || "flirting";
                const { category, label } = memberStatus(member);
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
                    <td><span className={styles.planPill}>{PLAN_OPTIONS.find((option) => option.value === memberPlan)?.label || memberPlan}</span></td>
                    <td><span className={styles.rolePill}>{roleBadgeLabel(member.role, member.roleLabel)}</span></td>
                    <td><span className={category === "suspended" ? styles.statusSuspended : category === "active" ? styles.statusActive : styles.statusInactive}>{label}</span></td>
                    <td>{formatDate(member.expiresAt)}</td>
                    <td>{member.lastSeenAt ? new Date(member.lastSeenAt).toLocaleString() : "—"}</td>
                    <td className={styles.memberJoined}>{formatDate(member.createdAt)}</td>
                    <td>
                      <div className={styles.memberActions}>
                        <a className={styles.actionLink} href={`/members/${member.id}`}>Profile</a>
                        {!["owner", "moderator"].includes(member.role) && <>
                          <a className={styles.actionLink} href={`/admin/hosts?userId=${member.id}`}>Host</a>
                          {role === "owner" && <>
                            <button type="button" className={styles.actionLink} onClick={() => openEditMember(member)}>Edit</button>
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
              {pageMembers.length === 0 && <tr><td colSpan={10} className={styles.membersEmpty}>No members match these filters.</td></tr>}
            </tbody>
          </table>
        </div>

        </div>

        <div className={styles.membersMobileList}>
          {pageMembers.map((member, index) => {
            const memberPlan = member.plan || "flirting";
            const { category, label } = memberStatus(member);
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
                  <span className={category === "suspended" ? styles.statusSuspended : category === "active" ? styles.statusActive : styles.statusInactive}>{label}</span>
                </div>

                <dl className={styles.mobileMemberDetails}>
                  <div><dt>Plan</dt><dd><span className={styles.planPill}>{PLAN_OPTIONS.find((option) => option.value === memberPlan)?.label || memberPlan}</span></dd></div>
                  <div><dt>Role</dt><dd><span className={styles.rolePill}>{roleBadgeLabel(member.role, member.roleLabel)}</span></dd></div>
                  <div><dt>Joined</dt><dd>{formatDate(member.createdAt)}</dd></div>
                  <div><dt>Member #</dt><dd>{start + index}</dd></div>
                </dl>

                <div className={styles.mobileMemberActions}>
                  <a className={styles.actionLink} href={`/members/${member.id}`}>View profile</a>
                  {!["owner", "moderator"].includes(member.role) && <>
                    <a className={styles.actionLink} href={`/admin/hosts?userId=${member.id}`}>Host</a>
                    {role === "owner" && <>
                      <button type="button" className={styles.actionLink} onClick={() => openEditMember(member)}>Edit</button>
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
        open={!!deleting}
        title="Delete member"
        message={`Delete ${deleting?.name || "this member"} permanently?\n\nThis removes their account, posts, and all data. This can't be undone.`}
        confirmLabel="Delete"
        busy={delBusy}
        busyLabel="Deleting…"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
      {addOpen && (
        <div
          className={styles.memberModalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !addBusy) setAddOpen(false);
          }}
        >
          <form
            className={styles.memberModalCard}
            onSubmit={submitAddMember}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-member-title"
          >
            <h2 id="add-member-title" className={styles.memberModalTitle}>Add member</h2>
            <p className={styles.memberModalHelp}>
              Creates a sign-in account they can use right away. No email confirmation needed.
            </p>

            {addError && <p className={styles.error}>{addError}</p>}

            <div className={styles.field}>
              <label className={styles.label} htmlFor="add-member-name">Name <span className={styles.memberModalOptional}>(optional)</span></label>
              <input
                id="add-member-name"
                className={styles.input}
                type="text"
                value={addForm.name}
                onChange={(event) => updateAddField("name", event.target.value)}
                placeholder="Defaults to the email prefix"
                autoComplete="off"
              />
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="add-member-email">Email</label>
                <input
                  id="add-member-email"
                  className={styles.input}
                  type="email"
                  required
                  value={addForm.email}
                  onChange={(event) => updateAddField("email", event.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="add-member-password">Password</label>
                <input
                  id="add-member-password"
                  className={styles.input}
                  type="password"
                  required
                  minLength={6}
                  value={addForm.password}
                  onChange={(event) => updateAddField("password", event.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="add-member-plan">Plan</label>
                <select
                  id="add-member-plan"
                  className={styles.input}
                  value={addForm.plan}
                  onChange={(event) => updateAddField("plan", event.target.value)}
                >
                  {PLAN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="add-member-role">Role</label>
                <select
                  id="add-member-role"
                  className={styles.input}
                  value={addForm.role}
                  onChange={(event) => updateAddField("role", event.target.value)}
                >
                  {ASSIGNABLE_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="add-member-expiry">Expires on</label>
              <input
                id="add-member-expiry"
                className={styles.input}
                type="date"
                disabled={addForm.plan === "flirting"}
                value={addForm.plan === "flirting" ? "" : addForm.expiresAt}
                onChange={(event) => updateAddField("expiresAt", event.target.value)}
              />
            </div>

            <p className={styles.memberModalHelp}>
              {addForm.plan === "flirting"
                ? "Flirting never expires."
                : "Leave the date blank for no end date. Access lasts through the selected day."}
              {" Role is stored exactly as selected."}
            </p>

            <div className={styles.memberModalActions}>
              <button type="button" className={styles.memberModalCancel} onClick={closeAddMember} disabled={addBusy}>
                Cancel
              </button>
              <button type="submit" className={styles.memberModalSubmit} disabled={addBusy}>
                {addBusy ? "Creating…" : "Create member"}
              </button>
            </div>
          </form>
        </div>
      )}
      {editOpen && (
        <div
          className={styles.memberModalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditMember();
          }}
        >
          <form
            className={styles.memberModalCard}
            onSubmit={submitEditMember}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-member-title"
          >
            <h2 id="edit-member-title" className={styles.memberModalTitle}>Edit {editForm.name}</h2>
            <p className={styles.memberModalHelp}>
              Set the plan, expiry, role and flags explicitly. Host is a global role; scoped host access is managed separately.
            </p>

            {editError && <p className={styles.error}>{editError}</p>}

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="edit-member-plan">Plan</label>
                <select
                  id="edit-member-plan"
                  className={styles.input}
                  value={editForm.plan}
                  onChange={(event) => updateEditField("plan", event.target.value)}
                >
                  {PLAN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="edit-member-role">Role</label>
                <select
                  id="edit-member-role"
                  className={styles.input}
                  value={editForm.role}
                  onChange={(event) => updateEditField("role", event.target.value)}
                >
                  {ASSIGNABLE_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="edit-member-expiry">Expires on</label>
              <input
                id="edit-member-expiry"
                className={styles.input}
                type="date"
                disabled={editForm.plan === "flirting"}
                value={editForm.plan === "flirting" ? "" : editForm.expiresAt}
                onChange={(event) => updateEditField("expiresAt", event.target.value)}
              />
            </div>

            <div className={styles.memberModalActions}>
              <label className={styles.label}>
                <input
                  type="checkbox"
                  checked={editForm.foundingMember}
                  onChange={(event) => updateEditField("foundingMember", event.target.checked)}
                />
                {" Founding member"}
              </label>
              <label className={styles.label}>
                <input
                  type="checkbox"
                  checked={editForm.suspended}
                  onChange={(event) => updateEditField("suspended", event.target.checked)}
                />
                {" Suspended"}
              </label>
            </div>

            <div className={styles.memberModalActions}>
              <button type="button" className={styles.memberModalCancel} onClick={closeEditMember} disabled={editBusy}>
                Cancel
              </button>
              <button type="submit" className={styles.memberModalSubmit} disabled={editBusy}>
                {editBusy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
