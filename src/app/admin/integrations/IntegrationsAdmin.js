"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, LoaderCircle, Save, Settings2 } from "lucide-react";
import styles from "./integrations-admin.module.css";

export default function IntegrationsAdmin() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/integrations", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load settings");
        if (active) setItems(data.integrations || []);
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  function update(id, patch) {
    setSaved(false);
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/admin/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrations: items.map(({ id, enabled, featured, communityUrl }) => ({ id, enabled, featured, communityUrl })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save settings");
      setItems(data.integrations || []);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}><Settings2 size={15}/> OWNER'S OFFICE / COMMUNITY</span>
        <h1>Integrations</h1>
        <p>Choose which creative services appear in the member marketplace. These settings control the community directory; members still manage their own profile links independently.</p>
      </header>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {saved && <p className={styles.success} role="status"><Check size={16}/> Community marketplace settings saved.</p>}
      {loading ? <p className={styles.loading}><LoaderCircle/> Loading integrations…</p> : (
        <form onSubmit={save} className={styles.list}>
          {items.map((item) => (
            <section className={styles.card} key={item.id}>
              <div className={styles.cardHead}>
                <div><span className={styles.category}>{item.category}</span><h2>{item.name}</h2><p>{item.description}</p></div>
                <label className={styles.switch}><input type="checkbox" checked={item.enabled} onChange={(event) => update(item.id, { enabled: event.target.checked, featured: event.target.checked ? item.featured : false })}/><span>{item.enabled ? "Visible" : "Hidden"}</span></label>
              </div>
              <div className={styles.controls}>
                <label className={styles.checkbox}><input type="checkbox" checked={item.featured} disabled={!item.enabled} onChange={(event) => update(item.id, { featured: event.target.checked })}/> Feature as a community pick</label>
                <div className={styles.field}><label htmlFor={"community-" + item.id}>Community resource URL (optional)</label><input id={"community-" + item.id} type="url" value={item.communityUrl || ""} onChange={(event) => update(item.id, { communityUrl: event.target.value })} placeholder={item.url}/></div>
                <a href={item.url} target="_blank" rel="noopener noreferrer" className={styles.visit}>Provider website <ExternalLink size={13}/></a>
              </div>
            </section>
          ))}
          <button className={styles.save} type="submit" disabled={busy}>{busy ? <LoaderCircle className={styles.spin}/> : <Save size={16}/>} {busy ? "Saving…" : "Save marketplace settings"}</button>
        </form>
      )}
    </main>
  );
}
