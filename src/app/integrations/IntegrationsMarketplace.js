"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, Camera, Check, ExternalLink, Heart, Link2, LoaderCircle, Pin, Puzzle, Scissors, Store, Trash2, Video, Play } from "lucide-react";
import styles from "./integrations.module.css";

const ICONS = {
  yarn: Scissors,
  pin: Pin,
  camera: Camera,
  play: Play,
  store: Store,
  video: Video,
};
const CATEGORIES = ["All", "Patterns & projects", "Inspiration", "Share your makes", "Learning", "Handmade & patterns"];

function getSavedUsername(item, savedUrl) {
  if (!savedUrl) return "";
  try {
    const savedPath = new URL(savedUrl).pathname;
    const prefixPath = new URL(item.profilePrefix).pathname;
    if (savedPath.startsWith(prefixPath)) {
      return decodeURIComponent(savedPath.slice(prefixPath.length).replace(/\\/$/, "")).replace(/^@/, "");
    }
  } catch {
    return "";
  }
  return "";
}

export default function IntegrationsMarketplace() {
  const [items, setItems] = useState([]);
  const [connections, setConnections] = useState({});
  const [filter, setFilter] = useState("All");
  const [editing, setEditing] = useState(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/integrations", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load integrations");
        if (active) {
          setItems(data.communityIntegrations || []);
          setConnections(data.personalConnections || {});
        }
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => items.filter((item) => filter === "All" || item.category === filter), [items, filter]);
  const linkedCount = Object.keys(connections).length;
  const profilePreview = editing && username.trim()
    ? editing.profilePrefix + username.trim().replace(/^@/, "")
    : "";

  function startLink(item) {
    setEditing(item);
    setUsername(getSavedUsername(item, connections[item.id]?.url || ""));
    setNotice("");
    setError("");
  }

  async function saveLink(event) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: editing.id, username: username.trim().replace(/^@/, "") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not link account");
      setConnections(data.personalConnections || {});
      setEditing(null);
      setNotice(editing.name + " profile linked.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(item) {
    if (!window.confirm("Remove your " + item.name + " profile link from your Speakeasy profile?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: item.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not disconnect");
      setConnections(data.personalConnections || {});
      setNotice(item.name + " profile link removed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.eyebrow}><Puzzle size={15} /> YOUR CREATIVE TOOLKIT</div>
        <h1>Bring your crochet world together.</h1>
        <p>Connect the places where you find patterns, collect inspiration, learn new stitches and share the things you make.</p>
        <div className={styles.heroStats}>
          <span><strong>{linkedCount}</strong> profile links</span>
          <span><strong>{items.length}</strong> community tools</span>
          <span>Always optional</span>
        </div>
      </header>

      <section className={styles.workflow}>
        <div className={styles.workflowIntro}>
          <span className={styles.sectionEyebrow}>MADE FOR YOUR MAKING JOURNEY</span>
          <h2>One community. All your creative corners.</h2>
          <p>Choose the services you already use. Your Speakeasy profile can point fellow crocheters to your work and favourite resources.</p>
        </div>
        <div className={styles.workflowSteps}>
          <div><span className={styles.stepIcon}><BookOpen size={18}/></span><strong>Discover</strong><small>Patterns and ideas</small></div>
          <div><span className={styles.stepIcon}><Heart size={18}/></span><strong>Get inspired</strong><small>Boards and creators</small></div>
          <div><span className={styles.stepIcon}><Camera size={18}/></span><strong>Share</strong><small>Your finished makes</small></div>
        </div>
      </section>

      <div className={styles.sectionHead}>
        <div><span className={styles.sectionEyebrow}>THE MARKETPLACE</span><h2>Explore integrations</h2></div>
        <span className={styles.count}>{visible.length} services</span>
      </div>
      <div className={styles.filters} aria-label="Filter integrations">
        {CATEGORIES.map((category) => <button type="button" key={category} className={filter === category ? styles.filterActive : styles.filter} onClick={() => setFilter(category)}>{category}</button>)}
      </div>

      {notice && <p className={styles.success} role="status"><Check size={16}/>{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading ? <div className={styles.loading}><LoaderCircle className={styles.spin}/> Loading your creative toolkit…</div> : (
        <div className={styles.grid}>
          {visible.map((item) => {
            const Icon = ICONS[item.icon] || Link2;
            const linked = Boolean(connections[item.id]?.url);
            return (
              <article className={styles.card} key={item.id}>
                <div className={styles.cardTop}>
                  <span className={styles.providerIcon}><Icon size={23}/></span>
                  {linked ? <span className={styles.connected}><Check size={12}/> LINKED</span> : item.featured ? <span className={styles.featured}>COMMUNITY PICK</span> : null}
                </div>
                <span className={styles.category}>{item.category}</span>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <div className={styles.benefit}><span>WHY LINK IT</span>{item.memberBenefit}</div>
                <div className={styles.cardActions}>
                  {linked ? (
                    <>
                      <a className={styles.openLink} href={connections[item.id].url} target="_blank" rel="noopener noreferrer">View profile <ExternalLink size={14}/></a>
                      <button className={styles.manageLink} type="button" onClick={() => startLink(item)}>Edit</button>
                      <button className={styles.removeLink} type="button" aria-label={"Disconnect " + item.name} onClick={() => disconnect(item)} disabled={busy}><Trash2 size={15}/></button>
                    </>
                  ) : (
                    <>
                      <button className={styles.connect} type="button" onClick={() => startLink(item)}>Link your account <ArrowUpRight size={15}/></button>
                      <a className={styles.providerLink} href={item.communityUrl || item.url} target="_blank" rel="noopener noreferrer">{item.communityUrl ? "Community resource" : "Visit service"}</a>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <aside className={styles.privacy}>
        <div className={styles.privacyIcon}><Link2 size={20}/></div>
        <div><h3>Your accounts stay yours.</h3><p>These are profile links, not full account authorisations. We only save the public profile URL you provide. We do not receive your password or access private messages, purchases or account data. You can remove a link at any time.</p></div>
      </aside>

      {editing && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditing(null); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="link-title">
            <button className={styles.modalClose} type="button" onClick={() => setEditing(null)} aria-label="Close">×</button>
            <span className={styles.sectionEyebrow}>PERSONAL PROFILE LINK</span>
            <h2 id="link-title">Link {editing.name}</h2>
            <p>Enter your {editing.name} username below. We have already filled in the website address for you.</p>
            <form onSubmit={saveLink}>
              <label htmlFor="integration-username">Your username</label>
              <div className={styles.profileInputRow}>
                <span className={styles.profilePrefix}>{editing.profilePrefix}</span>
                <input
                  id="integration-username"
                  className={styles.profileInput}
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value.replace(/^@/, ""))}
                  placeholder="yourusername"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck="false"
                  minLength={1}
                  maxLength={100}
                  pattern="[A-Za-z0-9._-]+"
                  title="Use letters, numbers, dots, underscores or hyphens only."
                  required
                  autoFocus
                />
              </div>
              <p className={styles.profileHint}>Your profile link: <strong>{profilePreview || editing.profilePrefix + "yourusername"}</strong></p>
              {error && <p className={styles.error}>{error}</p>}
              <div className={styles.modalActions}>
                <button className={styles.cancel} type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
                <button className={styles.connect} type="submit" disabled={busy || !username.trim()}>{busy ? "Saving…" : "Save profile link"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
