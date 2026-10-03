"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Download, Trash2 } from "lucide-react";
import StickerPicker from "@/components/StickerPicker";
import styles from "./gallery.module.css";

export default function GalleryGrid({ photos, currentUserId, canModerate = false }) {
  const [items, setItems] = useState(photos);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Only member-posted photos are deletable: the seeded crochet images have no
  // author and no backing row. Authors may remove their own; staff may remove
  // any — the same rule the DELETE endpoint enforces.
  function canDelete(photo) {
    if (!photo || String(photo.id).startsWith("crochet-") || !photo.authorId) return false;
    return canModerate || photo.authorId === currentUserId;
  }

  async function remove(photo) {
    if (busy) return;
    if (!window.confirm("Delete this photo? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/posts/${photo.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete photo");
      setItems((prev) => prev.filter((p) => p.id !== photo.id));
      setModal(null);
    } catch (err) {
      setError(err?.message || "Could not delete photo");
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <p style={{ color: "#9b9bab", fontSize: 14 }}>
        No photos posted yet. Share something in the feed to see it here.
      </p>
    );
  }

  return (
    <>
      <div className={styles.grid}>
        {items.map((photo, i) => (
          <button
            key={photo.id}
            className={styles.cell}
            style={{ animationDelay: `${(i % 12) * 0.35}s` }}
            onClick={() => {
              setError("");
              setModal(photo);
            }}
            aria-label={`Photo by ${photo.authorName}`}
          >
            <span className={styles.circle}>
              <Image
                className={styles.img}
                src={photo.imageUrl}
                alt={photo.text || "Photo"}
                width={140}
                height={140}
                sizes="(max-width: 520px) 90px, 140px"
                loading="lazy"
              />
            </span>
          </button>
        ))}
      </div>

      {modal && (
        <div className={styles.overlay} onClick={() => setModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeBtn} onClick={() => setModal(null)} aria-label="Close">
              ✕
            </button>
            <div className={styles.modalImage}>
              <Image
                src={modal.imageUrl}
                alt={modal.text || "Photo"}
                width={480}
                height={400}
                sizes="(max-width: 480px) 100vw, 480px"
                style={{ width: "100%", height: "auto" }}
              />
            </div>
            {modal.text && <p className={styles.modalText}>{modal.text}</p>}
            <div className={styles.modalMeta}>
              <Link
                className={styles.modalAuthor}
                href={`/members/${modal.authorId}`}
                onClick={() => setModal(null)}
              >
                {modal.authorName}
              </Link>
              {modal.createdAt > 0 && (
                <span className={styles.modalDate}>
                  {new Date(modal.createdAt).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
            {error && <p className={styles.modalError}>{error}</p>}
            <div className={styles.modalActions}>
              <Link
                className={styles.actionBtn}
                href={`/members/${modal.authorId}`}
                onClick={() => setModal(null)}
              >
                View profile
              </Link>
              <Link
                className={styles.actionBtn}
                href={`/chat?with=${modal.authorId}`}
                onClick={() => setModal(null)}
              >
                Message
              </Link>
              <a
                className={styles.actionBtn}
                href={modal.imageUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download size={14} /> Save
              </a>
              {canDelete(modal) && (
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionDanger}`}
                  onClick={() => remove(modal)}
                  disabled={busy}
                >
                  <Trash2 size={14} /> {busy ? "Deleting…" : "Delete"}
                </button>
              )}
            </div>
            <div style={{ padding: "0 20px 16px" }}>
              <StickerPicker toUid={modal.authorId} toName={modal.authorName} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
