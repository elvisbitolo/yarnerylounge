"use client";

import { useEffect, useState } from "react";

export default function WhatsAppLink() {
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/social/whatsapp", { cache: "no-store" });
      const json = await res.json();
      setLink(json?.link || null);
      if (json?.link?.phoneE164) setPhone(json.link.phoneE164);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/social/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");
      setMsg({ type: "ok", text: "WhatsApp linked. We'll DM you for mentions and direct messages when possible." });
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e?.message });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(enabled) {
    try {
      const res = await fetch("/api/settings/social/whatsapp/toggle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (res.ok) setLink((l) => (l ? { ...l, enabled: json.enabled } : l));
    } catch {}
  }

  async function unlink() {
    if (!confirm("Unlink WhatsApp?")) return;
    try {
      await fetch("/api/settings/social/whatsapp", { method: "DELETE" });
      setLink(null);
      setPhone("");
    } catch {}
  }

  if (loading) return <div style={{ padding: 16, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>Loading...</div>;

  return (
    <div style={{ padding: 16, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>WhatsApp</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>DMs for mentions and direct messages</div>
        </div>
        {link && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={!!link.enabled} onChange={(e) => toggle(e.target.checked)} />
            Enabled
          </label>
        )}
      </div>

      {link ? (
        <div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Linked: {link.phoneE164}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={unlink} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "inherit" }}>Unlink</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+254717162026"
              style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "inherit" }}
            />
            <button onClick={save} disabled={saving} style={{ padding: "10px 14px", borderRadius: 8, background: "#22c55e", color: "#000", border: "none", fontWeight: 600 }}>
              {saving ? "Linking..." : "Link WhatsApp"}
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>Use E.164 format. We'll only DM you within the 24-hour window or if you message us first.</div>
        </div>
      )}
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.type === "ok" ? "#22c55e" : "#f87171" }}>{msg.text}</div>}
    </div>
  );
}
