import { NextResponse } from "next/server";

// Blocks cookie-CSRF-style cross-origin requests to auth endpoints. Requests
// without an Origin header (curl, servers) are allowed; browsers are expected
// to send one. The Origin must match the Host the request was addressed to,
// which is what a real browser sends for same-site requests and what malicious
// cross-site forms/fetches cannot forge.
export function assertSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("host");
  if (!host) return null;
  try {
    const parsed = new URL(origin);
    if (parsed.host === host && (parsed.protocol === "https:" || parsed.protocol === "http:")) {
      return null;
    }
  } catch {
    // invalid origin — fall through and block
  }
  return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
}