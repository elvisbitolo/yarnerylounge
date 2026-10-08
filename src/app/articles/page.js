"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function ArticlesPage() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/articles")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setArticles(data.articles || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 20px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#f5f5f5", margin: "0 0 6px" }}>
              Articles
            </h1>
            <p style={{ fontSize: 14, color: "#9b9bab", margin: 0 }}>
              In-depth tutorials, patterns, and stories from the community.
            </p>
          </div>
          <Link
            href="/articles/new"
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              background: "var(--secondary-light)",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            Write article
          </Link>
        </div>

        {loading ? (
          <p style={{ color: "#9b9bab", fontSize: 13 }}>Loading articles...</p>
        ) : articles.length === 0 ? (
          <p style={{ color: "#9b9bab", fontSize: 13 }}>
            No articles yet. Be the first to write one!
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {articles.map((a) => (
              <Link
                key={a.id}
                href={`/articles/${a.id}`}
                style={{
                  display: "flex",
                  gap: 20,
                  padding: 20,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  textDecoration: "none",
                  transition: "background 0.15s ease, border-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(167,139,250,0.08)";
                  e.currentTarget.style.borderColor = "rgba(167,139,250,0.25)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                }}
              >
                {a.coverImage && (
                  <img
                    src={a.coverImage}
                    alt=""
                    style={{
                      width: 180,
                      height: 120,
                      objectFit: "cover",
                      borderRadius: 10,
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f5f5f5", margin: "0 0 6px" }}>
                    {a.title}
                  </h2>
                  {a.excerpt && (
                    <p style={{ fontSize: 13, color: "#d5d5d5", margin: "0 0 8px", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {a.excerpt}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#9b9bab" }}>
                    <span>{a.authorName}</span>
                    <span>{a.readTime} min read</span>
                    <span>{new Date(a.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                  </div>
                  {a.hashtags.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {a.hashtags.slice(0, 4).map((tag) => (
                        <span key={tag} style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--secondary-light)",
                          background: "rgba(167,139,250,0.1)",
                          padding: "2px 8px",
                          borderRadius: 999,
                        }}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
  );
}
