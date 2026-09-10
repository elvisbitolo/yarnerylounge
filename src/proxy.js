import { NextResponse } from "next/server";

const AUTH_COOKIE = "community-auth";

// Single public origin for the whole app. The session cookie is host-only, so
// serving the same app from yarnerylounge.vercel.app, per-deploy aliases and the
// bare domain splits logins into independent walled-off islands. Everything else
// is canonically 308'd here so cookies, localStorage sessions and OAuth
// callbacks always live on one host.
const CANONICAL_HOST = "www.christasspeakeasy.com";

const AUTH_ROUTES = [
  "/rooms",
  "/courses",
  "/groups",
  "/notifications",
  "/account",
  "/admin",
  "/members",
  "/community",
  "/neighbourhoods",
  "/feed",
  "/events",
  "/chat",
  "/host",
  "/leaderboard",
  "/challenges",
  "/spaces",
  "/discovery",
  "/dashboard",
  "/articles",
  "/gallery",
  "/search",
  "/perks",
];

const isDev = process.env.NODE_ENV === "development";

// Content Security Policy. The app statically prerenders pages, so nonce-based
// CSP (which forces dynamic rendering) would be a regression — the documented
// "without nonces" baseline is used instead, widened with the third-party hosts
// the app talks to. This still hardens against injection: no object embedding,
// no base-uri/clickjacking, no form exfiltration, and HTTPS-only upgrades.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://8x8.vc https://*.8x8.vc;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https:;
  font-src 'self';
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.bigdatacloud.net;
  frame-src 'self' https://8x8.vc https://*.8x8.vc https://www.youtube.com https://youtube.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// CSRF shield: every state-changing API request must come from this origin.
// Requests without an Origin header (server-to-server: cron, webhooks, curl)
// are allowed — browsers always send one. This mirrors the same-origin guard
// already enforced in hand-rolled form on the auth routes.
function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const host = request.headers.get("host");
  if (!host) return null;
  try {
    const parsed = new URL(origin);
    if (
      parsed.host === host &&
      (parsed.protocol === "https:" || parsed.protocol === "http:")
    ) {
      return null;
    }
  } catch {
    // invalid origin — fall through and block
  }
  return NextResponse.json(
    { error: "Cross-origin request blocked" },
    { status: 403 }
  );
}

export function proxy(request) {
  const { hostname, pathname, search } = request.nextUrl;

  const isCanonical =
    hostname === CANONICAL_HOST || hostname === "localhost" || hostname.endsWith(".local");
  const isOwnHost =
    hostname === "yarnerylounge.vercel.app" ||
    hostname === "christasspeakeasy.com" ||
    hostname === "christaspeakeasy.com" ||
    hostname.endsWith("elvisbitolo11-8702s-projects.vercel.app");

  if (!isCanonical && isOwnHost) {
    return NextResponse.redirect(`https://${CANONICAL_HOST}${pathname}${search}`, { status: 308 });
  }

  // CSRF shield for state-changing API calls.
  if (MUTATING.has(request.method) && pathname.startsWith("/api/")) {
    const blocked = assertSameOrigin(request);
    if (blocked) return blocked;
  }

  const hasSession = request.cookies.get(AUTH_COOKIE)?.value;

  const needsAuth = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  let response;
  if (needsAuth && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next();
  }

  // Apply the CSP to page responses only (API + static assets don't need it).
  if (!pathname.startsWith("/api/") && !pathname.startsWith("/_next/static")) {
    response.headers.set("Content-Security-Policy", cspHeader);
  }

  return response;
}

export const config = {
  matcher: ["/(.*)"],
};