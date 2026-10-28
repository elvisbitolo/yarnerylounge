"use client";

import { useEffect, useState } from "react";

export default function WhatsAppLink() {
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    try {
      const res = await fetch("/api/settings/social/whatsapp", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Unable to load WhatsApp settings");
      setLink(json?.link || null);
      if (json?.link?.phoneE164) setPhone(json.link.phoneE164);
    } catch (error) {
      setMsg({ type: "err", text: error?.message || "Unable to load WhatsApp settings" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/social/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, consent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save WhatsApp settings");
      setMsg({ type: "ok", text: "WhatsApp number saved. To activate message delivery, send the Yarnery business number a WhatsApp message first." });
      setConsent(false);
      await load();
    } catch (error) {
      setMsg({ type: "err", text: error?.message || "Unable to save WhatsApp settings" });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(enabled) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/social/whatsapp/toggle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Unable to update setting");
      setLink((current) => current ? { ...current, enabled: json.enabled } : current);
    } catch (error) {
      setMsg({ type: "err", text: error?.message || "Unable to update setting" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!confirm("Unlink WhatsApp? You will stop receiving WhatsApp notifications.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/social/whatsapp", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Unable to unlink WhatsApp");
      setLink(null);
      setPhone("");
      setConsent(false);
      setMsg({ type: "ok", text: "WhatsApp unlinked." });
    } catch (error) {
      setMsg({ type: "err", text: error?.message || "Unable to unlink WhatsApp" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div role="status" style={{ padding: 16, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>Loading WhatsApp settings…</div>;

  return (
    <section style={{ padding: 16, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>WhatsApp notifications</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Optional messages for mentions and direct messages</div>
        </div>
        {link && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={!!link.enabled} disabled={busy} onChange={(event) => toggle(event.target.checked)} />
            Enabled
          </label>
        )}
      </div>

      {link ? (
        <div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Saved number: {link.phoneE164}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>
            {link.verifiedAt ? "WhatsApp number verified." : "Number not independently verified. Message the Yarnery business number first to open the 24-hour reply window."}
          </div>
          <button type="button" onClick={unlink} disabled={busy} style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "inherit" }}>
            Unlink WhatsApp
          </button>
        </div>
      ) : (
        <div>
          <label htmlFor="whatsapp-phone" style={{ display: "block", fontSize: 13, marginBottom: 6 }}>WhatsApp number (international format)</label>
          <input
            id="whatsapp-phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+2547XXXXXXXX"
            aria-describedby="whatsapp-help"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "inherit" }}
          />
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, fontSize: 13, lineHeight: 1.5 }}>
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} style={{ marginTop: 3 }} />
            <span>I agree to receive optional WhatsApp notifications from The Yarnery for mentions and direct messages. I can disable or unlink this at any time.</span>
          </label>
          <div id="whatsapp-help" style={{ fontSize: 12, opacity: 0.65, marginTop: 8 }}>
            Saving your number does not verify ownership or start messaging. You must message the Yarnery business number first; free-form notifications are sent only during the 24-hour customer-service window.
          </div>
          <button type="button" onClick={save} disabled={saving || !consent || !phone.trim()} style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "#22c55e", color: "#000", border: "none", fontWeight: 600, opacity: saving || !consent || !phone.trim() ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save WhatsApp number"}
          </button>
        </div>
      )}
      {msg && <div role="status" aria-live="polite" style={{ marginTop: 10, fontSize: 13, color: msg.type === "ok" ? "#22c55e" : "#f87171" }}>{msg.text}</div>}
    </section>
  );
}
