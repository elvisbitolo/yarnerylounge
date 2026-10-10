"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import styles from "./MentionInput.module.css";
import { detectTrigger } from "@/lib/feed-utils";

export default function MentionInput({
  value,
  onChange,
  placeholder,
  className,
  rows = 3,
  maxLength,
  disabled,
  withTags = false,
}) {
  const [query, setQuery] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const fetchRef = useRef(null);

  const fetchSuggestions = useCallback(
    async (q) => {
      if (fetchRef.current) clearTimeout(fetchRef.current);
      fetchRef.current = setTimeout(async () => {
        setBusy(true);
        try {
          const url =
            q.type === "tag"
              ? `/api/hashtags?q=${encodeURIComponent(q.query)}`
              : `/api/members/mention?q=${encodeURIComponent(q.query)}`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            const list = q.type === "tag" ? data.tags || [] : data.members || [];
            setSuggestions(list);
            setShowDropdown(list.length > 0);
            setActiveIndex(-1);
          }
        } catch {
          setSuggestions([]);
          setShowDropdown(false);
        } finally {
          setBusy(false);
        }
      }, 200);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (fetchRef.current) clearTimeout(fetchRef.current);
    };
  }, []);

  function handleChange(e) {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(newValue);

    const trigger = detectTrigger(newValue, cursorPos);
    if (trigger && (!(trigger.type === "tag") || withTags) && trigger.query.length >= 1) {
      setQuery(trigger);
      fetchSuggestions(trigger);
    } else {
      setShowDropdown(false);
      setQuery(null);
    }
  }

  function insertSuggestion(entry) {
    if (!query || !inputRef.current) return;
    const text = value;
    const before = text.slice(0, query.start - 1);
    const after = text.slice(query.start + query.query.length);
    const glyph = query.type === "tag" ? "#" : "@";
    const insert = query.type === "tag" ? entry.tag : entry.username || entry.name;
    const newText = `${before}${glyph}${insert} ${after}`;
    onChange(newText);
    setShowDropdown(false);
    setQuery(null);
    setTimeout(() => {
      const pos = before.length + insert.length + 2;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(pos, pos);
    }, 0);
  }

  function handleKeyDown(e) {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        insertSuggestion(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={styles.wrapper}>
      <textarea
        ref={inputRef}
        className={`${styles.input} ${className || ""}`}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        maxLength={maxLength}
        disabled={disabled}
      />
      {showDropdown && suggestions.length > 0 && (
        <div ref={dropdownRef} className={styles.dropdown}>
          {suggestions.map((entry, index) => {
            const isTag = query.type === "tag";
            const key = isTag ? `#${entry.tag}` : entry.uid;
            return (
              <button
                key={key}
                type="button"
                className={`${styles.suggestion} ${index === activeIndex ? styles.suggestionActive : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertSuggestion(entry);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {isTag ? (
                  <>
                    <span className={`${styles.suggestionAvatar} ${styles.tagGlyph}`}>#</span>
                    <span className={styles.suggestionInfo}>
                      <span className={styles.suggestionName}>{entry.tag}</span>
                      {Number(entry.count) > 0 && (
                        <span className={styles.suggestionUsername}>
                          {Number(entry.count) === 1 ? "1 post" : `${entry.count} posts`}
                        </span>
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <span className={styles.suggestionAvatar}>
                      {entry.photoURL ? (
                        <Image
                          src={entry.photoURL}
                          alt=""
                          width={28}
                          height={28}
                          className={styles.suggestionImg}
                          unoptimized
                        />
                      ) : (
                        (entry.name || "?").slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className={styles.suggestionInfo}>
                      <span className={styles.suggestionName}>{entry.name || entry.username}</span>
                      {entry.username && (
                        <span className={styles.suggestionUsername}>@{entry.username}</span>
                      )}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}