"use client";

import React from "react";
import Link from "next/link";
import styles from "@/app/chat/chat.module.css";

const ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

function renderRichText(text, opts = {}) {
  if (!text || typeof text !== "string") return null;

  const { onTag } = opts || {};
  const escaped = escapeHtml(text);
  const elements = [];
  let remaining = escaped;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    const linkMatch = remaining.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
    const mentionMatch = remaining.match(/^@([a-zA-Z0-9_.]{1,30})/);
    const tagMatch = remaining.match(/^#([a-zA-Z0-9_-]{1,30})/);

    if (boldMatch) {
      elements.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
    } else if (italicMatch) {
      elements.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
    } else if (linkMatch) {
      elements.push(
        <a key={key++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer">
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
    } else if (mentionMatch) {
      elements.push(
        <Link
          key={key++}
          className={styles.chatMention}
          href={`/members?q=${encodeURIComponent(mentionMatch[1])}`}
          prefetch={false}
        >
          {mentionMatch[0]}
        </Link>
      );
      remaining = remaining.slice(mentionMatch[0].length);
    } else if (tagMatch) {
      const label = tagMatch[0];
      if (onTag) {
        elements.push(
          <button
            key={key++}
            type="button"
            className={styles.chatHash}
            onClick={() => onTag(tagMatch[1])}
          >
            {label}
          </button>
        );
      } else {
        elements.push(<span key={key++} className={styles.chatHash}>{label}</span>);
      }
      remaining = remaining.slice(label.length);
    } else {
      const nextMarker = remaining.search(/\*|(\[)|@|#/);
      if (nextMarker === -1) {
        elements.push(remaining);
        break;
      } else if (nextMarker === 0) {
        elements.push(remaining.charAt(0));
        remaining = remaining.slice(1);
      } else {
        elements.push(remaining.slice(0, nextMarker));
        remaining = remaining.slice(nextMarker);
      }
    }
  }

  return elements.length === 0 ? null : elements;
}

export { renderRichText };