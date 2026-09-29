"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }) {
  // Never hand an internal TypeError to a member. It reads as a broken site and
  // leaks internals; the console keeps it for us.
  const detail = process.env.NODE_ENV === "development" ? error?.message : null;
  if (error) console.error("[error-boundary]", error);

  return (
    <div style={wrap}>
      <div style={card}>
        <p style={code}>Something went wrong</p>
        <h1 style={title}>That page hit a snag</h1>
        <p style={body}>
          {detail ||
            "We couldn't load this page. Try again, and if it keeps happening, let us know."}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
          <button type="button" onClick={reset} style={primary}>
            Try again
          </button>
          <Link href="/dashboard" style={secondary}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

const wrap = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#14141b",
  padding: 24,
};

const card = {
  maxWidth: 460,
  textAlign: "center",
};

const code = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--secondary-light)",
  margin: "0 0 10px",
};

const title = {
  margin: "0 0 10px",
  fontSize: 26,
  fontWeight: 800,
  color: "#ffffff",
};

const body = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.6,
  color: "rgba(255,255,255,0.65)",
};

const primary = {
  border: "none",
  borderRadius: 999,
  padding: "10px 18px",
  fontFamily: "inherit",
  fontWeight: 700,
  fontSize: 13,
  background: "linear-gradient(135deg, var(--primary), var(--secondary))",
  color: "#ffffff",
  cursor: "pointer",
};

const secondary = {
  borderRadius: 999,
  padding: "10px 18px",
  fontWeight: 700,
  fontSize: 13,
  color: "var(--secondary-light)",
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.18)",
};