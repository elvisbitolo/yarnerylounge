"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import { ROOM_VIBE_MODES, roomAudioFlagsForVibeMode } from "@/lib/room-config";
import ContentEditor from "@/components/admin/ContentEditor";
import styles from "./admin.module.css";

const EMPTY_FORM = {
  name: "",
  description: "",
  maxParticipants: 20,
  groupId: "",
  spaceId: "",
  kind: "standard",
  publicPreview: false,
  opensAt: "",
  alwaysOn: false,
  vibe: "",
  vibeMode: "",
  color: "",
  rule: "",
  imageUrl: "",
  musicUrl: "",
  musicFileId: "",
  musicName: "",
  musicPlaying: false,
  recordingAllowed: true,
  replayVisibility: "members",
};

export default function AdminRoomsPage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [hostId, setHostId] = useState("");
  const [coHostIds, setCoHostIds] = useState([]);
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingMusic, setUploadingMusic] = useState(false);

  const set = useCallback((key, value) => setForm((prev) => ({ ...prev, [key]: value })), []);

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/rooms");
    if (res.ok) setRooms((await res.json()).rooms);
  }, []);

  const loadGroups = useCallback(async () => {
    const res = await fetch("/api/groups");
    if (res.ok) setGroups((await res.json()).groups);
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
      loadRooms();
      loadGroups();
      loadSpaces();
      fetch("/api/admin/members")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setMembers(data.members));
    });
    return unsub;
  }, [router, loadRooms, loadGroups, loadSpaces]);

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploadingCover(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const res = await fetch("/api/upload?kind=cover", { method: "POST", body: data });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Cover upload failed");
      } else {
        set("imageUrl", json.url || json.dataUrl || "");
      }
    } catch {
      setError("Cover upload failed");
    }
    setUploadingCover(false);
  }

  async function handleMusicUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploadingMusic(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const res = await fetch("/api/rooms/music/upload", { method: "POST", body: data });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Music upload failed");
      } else {
        setForm((prev) => ({
          ...prev,
          musicFileId: json.id || "",
          musicUrl: "",
          musicName: prev.musicName || file.name.replace(/\.[^.]+$/, ""),
        }));
      }
    } catch {
      setError("Music upload failed");
    }
    setUploadingMusic(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        opensAt: form.opensAt ? new Date(form.opensAt).toISOString() : null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to create room");
      return;
    }

    const room = data.room;
    const assignments = [];
    if (hostId) {
      assignments.push({
        scopeType: "room",
        scopeId: room.id,
        userId: hostId,
        role: "host",
      });
    }
    for (const userId of coHostIds) {
      assignments.push({
        scopeType: "room",
        scopeId: room.id,
        userId,
        role: "co-host",
      });
    }
    for (const payload of assignments) {
      await fetch("/api/admin/host-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setForm(EMPTY_FORM);
    setHostId("");
    setCoHostIds([]);
    await loadRooms();
  }

  async function handleDelete(id) {
    await fetch(`/api/rooms/${id}`, { method: "DELETE" });
    await loadRooms();
  }

  async function handleTogglePreview(id, value) {
    await fetch(`/api/rooms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicPreview: value }),
    });
    await loadRooms();
  }

  const audioPreview = roomAudioFlagsForVibeMode(form.vibeMode);
  const audioSummary = [
    audioPreview.autoAudioVideo ? "camera + mic on" : null,
    audioPreview.forceMuteOnJoin ? "mics start muted" : null,
    audioPreview.raiseHandToTalk ? "raise hand to talk" : null,
    audioPreview.disableAudio ? "audio off" : null,
  ].filter(Boolean);
  const selectedVibe = ROOM_VIBE_MODES.find((m) => m.value === form.vibeMode);

  return (
      <div className={styles.container}>
        <h1 className={styles.title}>Manage lounges</h1>

        <form className={styles.form} onSubmit={handleCreate}>
          <h2 className={styles.formTitle}>Create a lounge</h2>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">Lounge name</label>
            <input
              id="name"
              className={styles.input}
              type="text"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="description">Description</label>
            <textarea
              id="description"
              className={styles.textarea}
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Cover image</label>
            <div className={styles.coverRow}>
              <div
                className={styles.coverPreview}
                style={form.imageUrl ? { backgroundImage: `url(${form.imageUrl})` } : undefined}
                aria-hidden="true"
              >
                {!form.imageUrl && <span className={styles.coverPlaceholder}>No image</span>}
              </div>
              <div className={styles.coverActions}>
                <label className={styles.uploadButton}>
                  {uploadingCover ? "Uploading…" : "Upload image"}
                  <input type="file" accept="image/*" onChange={handleCoverUpload} hidden />
                </label>
                {form.imageUrl && (
                  <button type="button" className={styles.toggle} onClick={() => set("imageUrl", "")}>
                    Remove
                  </button>
                )}
                <small className={styles.help}>
                  Shown on the Lounges page. JPG, PNG, WebP or GIF, up to 8&nbsp;MB.
                </small>
              </div>
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="color">Accent colour</label>
              <div className={styles.colorRow}>
                <input
                  id="color"
                  className={styles.colorInput}
                  type="color"
                  value={form.color || "#a78bfa"}
                  onChange={(e) => set("color", e.target.value)}
                />
                <input
                  className={styles.input}
                  type="text"
                  placeholder="#a78bfa"
                  value={form.color}
                  onChange={(e) => set("color", e.target.value)}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="max">Max participants</label>
              <input
                id="max"
                className={styles.input}
                type="number"
                min={2}
                max={500}
                value={form.maxParticipants}
                onChange={(e) => set("maxParticipants", e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="vibeMode">Vibe</label>
            <select
              id="vibeMode"
              className={styles.input}
              value={form.vibeMode}
              onChange={(e) => set("vibeMode", e.target.value)}
            >
              {ROOM_VIBE_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>{mode.label}</option>
              ))}
            </select>
            <small className={styles.help}>
              {selectedVibe?.description || ""}
              {audioSummary.length ? ` Enforced: ${audioSummary.join(", ")}.` : ""}
            </small>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="vibe">Vibe label (optional)</label>
            <input
              id="vibe"
              className={styles.input}
              type="text"
              placeholder="e.g. social, focus, calm"
              value={form.vibe}
              onChange={(e) => set("vibe", e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="rule">House rule (optional)</label>
            <input
              id="rule"
              className={styles.input}
              type="text"
              placeholder="e.g. Cameras and mics on — be kind."
              value={form.rule}
              onChange={(e) => set("rule", e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="musicName">Background music</label>
            <input
              id="musicName"
              className={styles.input}
              type="text"
              placeholder="Track name (optional)"
              value={form.musicName}
              onChange={(e) => set("musicName", e.target.value)}
            />
            <div className={styles.coverRow}>
              <label className={styles.uploadButton}>
                {uploadingMusic ? "Uploading…" : "Upload audio"}
                <input type="file" accept="audio/*" onChange={handleMusicUpload} hidden />
              </label>
              <input
                className={styles.input}
                type="url"
                placeholder="…or paste an audio URL"
                value={form.musicUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, musicUrl: e.target.value, musicFileId: "" }))}
              />
            </div>
            <small className={styles.help}>
              {form.musicFileId ? "Audio file uploaded." : "Uploaded files are limited to 750 KB; use a URL for larger tracks."}
            </small>
            <label className={styles.checkCard}>
              <input
                type="checkbox"
                checked={form.musicPlaying}
                onChange={(e) => set("musicPlaying", e.target.checked)}
              />
              <span className={styles.checkText}>
                <strong>Play as soon as the lounge opens</strong>
              </span>
            </label>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="kind">Lounge type</label>
            <select
              id="kind"
              className={styles.input}
              value={form.kind}
              onChange={(e) => set("kind", e.target.value)}
            >
              <option value="standard">Video chat (everyone speaks)</option>
              <option value="broadcast">Broadcast (host speaks, members watch)</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="opensAt">Schedule (optional)</label>
            <input
              id="opensAt"
              className={styles.input}
              type="datetime-local"
              value={form.opensAt}
              onChange={(e) => set("opensAt", e.target.value)}
            />
            <small className={styles.help}>
              Members can only join from this time onward. Leave blank to open now.
            </small>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="group">Group (optional)</label>
              <select
                id="group"
                className={styles.input}
                value={form.groupId}
                onChange={(e) => setForm((prev) => ({ ...prev, groupId: e.target.value, spaceId: "" }))}
              >
                <option value="">Main community</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="space">Space (optional)</label>
              <select
                id="space"
                className={styles.input}
                value={form.spaceId}
                onChange={(e) => setForm((prev) => ({ ...prev, spaceId: e.target.value, groupId: "" }))}
              >
                <option value="">No space</option>
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>{space.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="host">Host</label>
            <select
              id="host"
              className={styles.input}
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
            >
              <option value="">No host (you manage it)</option>
              {members
                .filter((m) => m.role !== "owner")
                .map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.email || "Member"}</option>
                ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Co-hosts</label>
            <div className={styles.checkList}>
              {members
                .filter((m) => m.role !== "owner")
                .map((m) => (
                  <label key={m.id} className={styles.checkCard}>
                    <input
                      type="checkbox"
                      checked={coHostIds.includes(m.id)}
                      onChange={(e) =>
                        setCoHostIds((prev) =>
                          e.target.checked
                            ? [...prev, m.id]
                            : prev.filter((id) => id !== m.id)
                        )
                      }
                    />
                    <span className={styles.checkText}>
                      {m.name || m.email || "Member"}
                    </span>
                  </label>
                ))}
            </div>
          </div>

          <div className={styles.checkGrid}>
            <label className={styles.checkCard}>
              <input
                type="checkbox"
                checked={form.alwaysOn}
                onChange={(e) => set("alwaysOn", e.target.checked)}
              />
              <span className={styles.checkText}>
                <strong>Always open</strong>
                <small>Opens 24/7 and leads the live banner.</small>
              </span>
            </label>
            <label className={styles.checkCard}>
              <input
                type="checkbox"
                checked={form.recordingAllowed}
                onChange={(e) => set("recordingAllowed", e.target.checked)}
              />
              <span className={styles.checkText}>
                <strong>Allow recording</strong>
              </span>
            </label>
            <label className={styles.checkCard}>
              <input
                type="checkbox"
                checked={form.publicPreview}
                onChange={(e) => set("publicPreview", e.target.checked)}
              />
              <span className={styles.checkText}>
                <strong>Show on the public explore page</strong>
                <small>Reveals the name and description to visitors.</small>
              </span>
            </label>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="replayVisibility">Replay visibility</label>
            <select
              id="replayVisibility"
              className={styles.input}
              value={form.replayVisibility}
              onChange={(e) => set("replayVisibility", e.target.value)}
            >
              <option value="members">Members</option>
              <option value="owner">Owner only</option>
            </select>
          </div>

          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create room"}
          </button>
        </form>

<h2 className={styles.listTitle}>Existing lounges</h2>
        {rooms.length === 0 ? (
          <p className={styles.empty}>No lounges yet.</p>
        ) : (
          <div className={styles.list}>
            {rooms.map((room) => (
              <div key={room.id} className={styles.item}>
                <div>
                  <p className={styles.itemName}>{room.name}</p>
                  <p className={styles.itemMeta}>
                    {room.status} · {room.maxParticipants} max · {room.slug}
                    {room.alwaysOn ? " · always open" : ""}
                    {room.opensAt
                      ? ` · opens ${new Date(room.opensAt.toMillis ? room.opensAt.toMillis() : room.opensAt).toLocaleString()}`
                      : " · open now"}
                  </p>
                </div>
                <div className={styles.itemActions}>
                  <a
                    className={styles.toggle}
                    href={`/admin/hosts?scopeType=room&scopeId=${room.id}`}
                  >
                    Hosts
                  </a>
                  <button
                    className={room.publicPreview ? styles.toggleOn : styles.toggle}
                    onClick={() => handleTogglePreview(room.id, !room.publicPreview)}
                  >
                    {room.publicPreview ? "On explore" : "Off explore"}
                  </button>
                  <button
                    className={styles.toggle}
                    onClick={() => setEditing(editing === room.id ? null : room.id)}
                  >
                    {editing === room.id ? "Close" : "Edit"}
                  </button>
                  <button className={styles.delete} onClick={() => handleDelete(room.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {rooms.map((r) =>
          editing === r.id ? (
            <ContentEditor
              key={r.id}
              kind="room"
              record={r}
              onCancel={() => setEditing(null)}
              onSaved={(id, patch) => {
                setRooms((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
              }}
            />
          ) : null
        )}
      </div>
  );
}
