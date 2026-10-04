"use client";

import { useState, useCallback } from "react";
import { EDITABLE_FIELDS } from "@/lib/admin/content-fields";
import styles from "./ContentEditor.module.css";

function initialValues(record, spec) {
  const next = {};
  if (!record || !spec) return next;
  for (const [key, rule] of Object.entries(spec.fields)) {
    const raw = record?.[key];
    next[key] = rule.type === "boolean" ? !!raw : Array.isArray(raw) ? raw.join(", ") : raw ?? "";
  }
  return next;
}

/**
 * Generic editor for one record of an admin-editable content type.
 *
 * Renders inputs from the shared EDITABLE_FIELDS spec so every content type gets
 * a consistent form, and PATCHes to /api/admin/content/[kind]/[id] - the same
 * allow-listed endpoint the server validates against.
 *
 * Mount this with a `key` of the record id: state is seeded once on mount rather
 * than synced from props, so the parent must remount it when switching records.
 */
export default function ContentEditor({ kind, record, onSaved, onCancel }) {
  const spec = EDITABLE_FIELDS[kind];
  const [values, setValues] = useState(() => initialValues(record, spec));
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const set = useCallback((key, value) => setValues((v) => ({ ...v, [key]: value })), []);

  const save = async () => {
    setSaving(true);
    setStatus("");
    const patch = {};
    for (const [key, rule] of Object.entries(spec.fields)) {
      const value = values[key];
      if (rule.type === "boolean") patch[key] = !!value;
      else if (rule.type === "stringArray") patch[key] = value ? String(value).split(",").map((s) => s.trim()).filter(Boolean) : [];
      else patch[key] = value;
    }
    try {
      const res = await fetch(`/api/admin/content/${kind}/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error || "Could not save those changes");
        return;
      }
      const changed = data.changed || [];
      setStatus(changed.length ? `Saved: ${changed.join(", ")}` : "No changes to save");
      onSaved?.(record.id, patch);
    } catch {
      setStatus("Could not reach the server");
    } finally {
      setSaving(false);
    }
  };

  if (!spec || !record) return null;

  return (
    <div className={styles.editor}>
      <div className={styles.head}>
        <h3 className={styles.heading}>
          Edit {spec.label.toLowerCase()}
        </h3>
        <p className={styles.hint}>Changes appear on the site immediately.</p>
      </div>

      {Object.entries(spec.fields).map(([key, rule]) => {
        const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
        const id = `ce-${kind}-${record.id}-${key}`;

        if (rule.type === "boolean") {
          return (
            <label key={key} className={styles.check} htmlFor={id}>
              <input id={id} type="checkbox" checked={!!values[key]} onChange={(e) => set(key, e.target.checked)} />
              <span>{label}</span>
            </label>
          );
        }

        if (rule.type === "stringArray") {
          return (
            <div key={key} className={styles.field}>
              <label className={styles.label} htmlFor={id}>
                {label}
              </label>
              <input
                id={id}
                className={styles.input}
                value={values[key] ?? ""}
                placeholder="Separate each with a comma"
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          );
        }

        if (rule.type === "text") {
          const big = rule.max > 5000;
          return (
            <div key={key} className={styles.field}>
              <label className={styles.label} htmlFor={id}>
                {label}
              </label>
              <textarea
                id={id}
                className={big ? styles.textareaLarge : styles.textarea}
                rows={big ? 14 : 4}
                maxLength={rule.max}
                value={values[key] ?? ""}
                onChange={(e) => set(key, e.target.value)}
              />
              <span className={styles.counter}>
                {String(values[key] ?? "").length} / {rule.max}
              </span>
              {big ? <span className={styles.hint}>Basic markdown works: **bold**, *italic*, # heading, - list</span> : null}
            </div>
          );
        }

        return (
          <div key={key} className={styles.field}>
            <label className={styles.label} htmlFor={id}>
              {label} {rule.required ? <span className={styles.req}>required</span> : null}
            </label>
            <input
              id={id}
              className={styles.input}
              maxLength={rule.max}
              value={values[key] ?? ""}
              onChange={(e) => set(key, e.target.value)}
            />
          </div>
        );
      })}

      <div className={styles.actions}>
        <button type="button" className={styles.save} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {onCancel ? (
          <button type="button" className={styles.cancel} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        {status ? (
          <span className={status.startsWith("Saved") ? styles.ok : styles.bad} role="status">
            {status}
          </span>
        ) : null}
      </div>
    </div>
  );
}