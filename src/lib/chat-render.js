"use client";

import React from "react";
import Link from "next/link";
import styles from "@/app/chat/chat.module.css";
import { tokenizeChatText } from "./chat-render-core.js";

// Turns chat markup into React nodes. Text is passed through untouched: React
// escapes text children itself, so HTML-escaping here would render entities
// literally ("it&#39;s" instead of "it's").
export function renderRichText(text, opts = {}) {
  const { onTag } = opts || {};
  const tokens = tokenizeChatText(text);
  if (tokens.length === 0) return null;

  return tokens.map((token, key) => {
    switch (token.type) {
      case "bold":
        return <strong key={key}>{token.value}</strong>;
      case "italic":
        return <em key={key}>{token.value}</em>;
      case "link":
        return (
          <a key={key} href={token.href} target="_blank" rel="noopener noreferrer">
            {token.label}
          </a>
        );
      case "mention":
        return (
          <Link
            key={key}
            className={styles.chatMention}
            href={`/members?q=${encodeURIComponent(token.name)}`}
            prefetch={false}
          >
            {token.value}
          </Link>
        );
      case "tag":
        if (onTag) {
          return (
            <button
              key={key}
              type="button"
              className={styles.chatHash}
              onClick={() => onTag(token.name)}
            >
              {token.value}
            </button>
          );
        }
        return (
          <span key={key} className={styles.chatHash}>
            {token.value}
          </span>
        );
      default:
        return token.value;
    }
  });
}
