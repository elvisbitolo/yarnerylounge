"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  PAGE_BLOCK_TYPES,
  movePageBlock,
  newPageBlock,
  nextBlockId,
  removePageBlock,
} from "@/lib/page-blocks";
import styles from "@/components/admin/ContentEditor.module.css";
import pageStyles from "@/app/admin/content/content.module.css";

const TYPE_LABELS = {
  heading: "Heading",
  paragraph: "Paragraph",
  list: "List",
  image: "Image",
  link: "Link",
};

function blockTitle(block, index) {
  if (block.type === "heading") return block.text || `Heading ${index + 1}`;
  if (block.type === "paragraph") return block.text ? `${block.text.slice(0, 48)}…` : "Paragraph";
  if (block.type === "list") return `${block.items?.length || 0} list items`;
  if (block.type === "image") return block.src || "Image";
  return block.label || "Link";
}

export default function PageBlocksEditor({ pages }) {
  const [slug, setSlug] = useState(pages[0]?.slug || "");
  const [page, setPage] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadedSlug, setLoadedSlug] = useState("");

  useEffect(() => {
    if (!slug) return undefined;
    let active = true;
    fetch(`/api/admin/pages/${slug}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not load the page");
        return data;
      })
      .then((data) => {
        if (!active) return;
        setPage(data);
        setBlocks(data.blocks || []);
        setDirty(false);
        setError("");
        setNotice("");
        setLoadedSlug(slug);
      })
      .catch((err) => {
        if (!active) return;
        setPage(null);
        setBlocks([]);
        setError(err.message || "Could not load the page");
        setLoadedSlug(slug);
      });
    return () => { active = false; };
  }, [slug]);

  const patchBlock = useCallback((id, patch) => {
    setBlocks((current) => current.map((block) => (block.id === id ? { ...block, ...patch } : block)));
    setDirty(true);
    setNotice("");
  }, []);

  const addBlock = (type) => {
    const id = nextBlockId(blocks);
    setBlocks((current) => [...current, newPageBlock(type, id)]);
    setDirty(true);
    setNotice("");
  };

  const move = (index, target) => {
    setBlocks((current) => movePageBlock(current, index, target));
    setDirty(true);
  };

  const remove = (id) => {
    setBlocks((current) => removePageBlock(current, id));
    setDirty(true);
    setNotice("");
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/pages/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the draft");
      setPage(data);
      setBlocks(data.blocks || []);
      setDirty(false);
      setNotice("Draft saved. The public page is unchanged until you publish.");
    } catch (err) {
      setError(err.message || "Could not save the draft");
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (dirty) return setError("Save the draft before publishing");
    if (!page?.hasDraft) return setError("Save a draft before publishing");
    if (!window.confirm(`Publish these blocks to ${page.path}? The public page will change immediately.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/pages/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not publish");
      setPage(data);
      setBlocks(data.blocks || []);
      setNotice(`Published to ${data.path}.`);
    } catch (err) {
      setError(err.message || "Could not publish");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.container}>
        <h1 className={pageStyles.title}>Public page blocks</h1>
        <p className={pageStyles.sub}>
          Edit public copy as ordered blocks. Saving creates a draft; only publishing changes the live page.
        </p>

        <div className={pageStyles.chips}>
          {pages.map((item) => (
            <button
              type="button"
              key={item.slug}
              className={`${pageStyles.chip} ${slug === item.slug ? pageStyles.chipOn : ""}`}
              onClick={() => setSlug(item.slug)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error ? <div className={pageStyles.error}>{error}</div> : null}
        {notice ? <span className={styles.ok} role="status">{notice}</span> : null}

        {loadedSlug !== slug ? <p className={styles.hint}>Loading…</p> : null}
        {page && loadedSlug === slug ? (
          <div className={styles.editor}>
            <div className={styles.head}>
              <h2 className={styles.heading}>{page.label}</h2>
              <span className={styles.hint}>
                {page.unpublished
                  ? "Unpublished draft — the live page still shows the published version."
                  : page.hasPublished
                    ? "Published — no unpublished changes."
                    : "Using the built-in copy until you publish a draft."}
              </span>
            </div>

            <div className={styles.blockActions}>
              {PAGE_BLOCK_TYPES.map((type) => (
                <button key={type} type="button" className={styles.cancel} onClick={() => addBlock(type)} disabled={busy}>
                  <Plus size={13} /> {TYPE_LABELS[type]}
                </button>
              ))}
            </div>

            {blocks.length === 0 ? <p className={styles.hint}>No blocks yet. Add one above.</p> : null}

            {blocks.map((block, index) => (
              <div key={block.id} className={styles.blockCard}>
                <div className={styles.blockHead}>
                  <span className={styles.blockLabel}>{index + 1}. {TYPE_LABELS[block.type] || block.type} · {blockTitle(block, index)}</span>
                  <span className={styles.blockActions}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0 || busy}
                      aria-label={`Move block ${index + 1} up`}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => move(index, index + 1)}
                      disabled={index === blocks.length - 1 || busy}
                      aria-label={`Move block ${index + 1} down`}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => remove(block.id)}
                      disabled={busy}
                      aria-label={`Remove block ${index + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>

                {block.type === "heading" ? (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`${block.id}-text`}>Text</label>
                    <input
                      id={`${block.id}-text`}
                      className={styles.input}
                      value={block.text || ""}
                      maxLength={200}
                      onChange={(event) => patchBlock(block.id, { text: event.target.value })}
                    />
                    <label className={styles.label} htmlFor={`${block.id}-level`}>Level</label>
                    <select
                      id={`${block.id}-level`}
                      className={styles.input}
                      value={block.level || 2}
                      onChange={(event) => patchBlock(block.id, { level: Number(event.target.value) })}
                    >
                      <option value={1}>Page title</option>
                      <option value={2}>Section heading</option>
                    </select>
                  </div>
                ) : null}

                {block.type === "paragraph" ? (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`${block.id}-text`}>Text</label>
                    <textarea
                      id={`${block.id}-text`}
                      className={styles.textarea}
                      value={block.text || ""}
                      maxLength={8000}
                      onChange={(event) => patchBlock(block.id, { text: event.target.value })}
                    />
                    <label className={styles.check} htmlFor={`${block.id}-lead`}>
                      <input
                        id={`${block.id}-lead`}
                        type="checkbox"
                        checked={Boolean(block.lead)}
                        onChange={(event) => patchBlock(block.id, { lead: event.target.checked })}
                      />
                      <span>Lead paragraph style</span>
                    </label>
                  </div>
                ) : null}

                {block.type === "list" ? (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`${block.id}-items`}>One item per line</label>
                    <textarea
                      id={`${block.id}-items`}
                      className={styles.textarea}
                      value={(block.items || []).join("\n")}
                      onChange={(event) => patchBlock(block.id, { items: event.target.value.split(/\r?\n/) })}
                    />
                  </div>
                ) : null}

                {block.type === "image" ? (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`${block.id}-src`}>Image URL or path</label>
                    <input
                      id={`${block.id}-src`}
                      className={styles.input}
                      value={block.src || ""}
                      maxLength={600}
                      onChange={(event) => patchBlock(block.id, { src: event.target.value })}
                    />
                    <label className={styles.label} htmlFor={`${block.id}-alt`}>Alt text</label>
                    <input
                      id={`${block.id}-alt`}
                      className={styles.input}
                      value={block.alt || ""}
                      maxLength={200}
                      onChange={(event) => patchBlock(block.id, { alt: event.target.value })}
                    />
                    <label className={styles.label} htmlFor={`${block.id}-caption`}>Caption</label>
                    <input
                      id={`${block.id}-caption`}
                      className={styles.input}
                      value={block.caption || ""}
                      maxLength={400}
                      onChange={(event) => patchBlock(block.id, { caption: event.target.value })}
                    />
                  </div>
                ) : null}

                {block.type === "link" ? (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`${block.id}-text`}>Intro text</label>
                    <input
                      id={`${block.id}-text`}
                      className={styles.input}
                      value={block.text || ""}
                      maxLength={200}
                      onChange={(event) => patchBlock(block.id, { text: event.target.value })}
                    />
                    <label className={styles.label} htmlFor={`${block.id}-label`}>Button label</label>
                    <input
                      id={`${block.id}-label`}
                      className={styles.input}
                      value={block.label || ""}
                      maxLength={200}
                      onChange={(event) => patchBlock(block.id, { label: event.target.value })}
                    />
                    <label className={styles.label} htmlFor={`${block.id}-href`}>URL or path</label>
                    <input
                      id={`${block.id}-href`}
                      className={styles.input}
                      value={block.href || ""}
                      maxLength={600}
                      onChange={(event) => patchBlock(block.id, { href: event.target.value })}
                    />
                  </div>
                ) : null}
              </div>
            ))}

            <div className={styles.actions}>
              <button type="button" className={styles.save} onClick={save} disabled={busy || !dirty}>
                {busy ? "Working…" : "Save draft"}
              </button>
              <button type="button" className={styles.cancel} onClick={publish} disabled={busy || dirty || !page.hasDraft}>
                Publish
              </button>
              <a
                className={styles.previewLink}
                href={`/admin/content/pages/preview?slug=${encodeURIComponent(slug)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={dirty}
                title={dirty ? "Save the draft before previewing" : "Preview the saved draft"}
                onClick={(event) => { if (dirty) event.preventDefault(); }}
              >
                Preview draft
              </a>
              {dirty ? <span className={styles.hint}>Unsaved changes</span> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
