"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function TopicsPage() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/topics")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setTopics(data.topics || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#f5f5f5", margin: "0 0 6px" }}>
          Topics
        </h1>
        <p style={{ fontSize: 14, color: "#9b9bab", margin: "0 0 28px" }}>
          Explore what the community is talking about.
        </p>

        {loading ? (
          <p style={{ color: "#9b9bab", fontSize: 13 }}>Loading topics...</p>
        ) : topics.length === 0 ? (
          <p style={{ color: "#9b9bab", fontSize: 13 }}>
            No topics yet. Start a post with #hashtags to create topics.
          </p>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}>
            {topics.map((t) => (
              <Link
                key={t.tag}
                href={`/search?hashtag=${encodeURIComponent(t.tag)}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  textDecoration: "none",
                  transition: "background 0.15s ease, border-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(167,139,250,0.1)";
                  e.currentTarget.style.borderColor = "rgba(167,139,250,0.25)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--secondary-light)" }}>
                  #{t.tag}
                </span>
                <span style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#9b9bab",
                  background: "rgba(255,255,255,0.06)",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}>
                  {t.count}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
  );
}
