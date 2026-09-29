import { NextResponse } from "next/server";
import { buildCspHeader } from "@/lib/server/csp";

const AUTH_COOKIE = "community-auth";

// Single public origin for the whole app. The session cookie is host-only, so
// serving the same app from yarnerylounge.vercel.app, per-deploy aliases and the
// bare domain splits logins into independent walled-off islands. Everything else
// is canonically 308'd here so cookies, localStorage sessions and OAuth
// callbacks always live on one host.
const CANONICAL_HOST = (
  process.env.NEXT_PUBLIC_CANONICAL_HOST || "www.christasspeakeasy.com"
).trim().toLowerCase();

// Hosts known to serve this same app, which must therefore be folded onto the
// canonical origin. Vercel issues per-project, per-team and per-deploy domains
// and they change when a project is renamed or transferred, so the list lives in
// the environment (comma-separated) and adding a host is a config change rather
// than a code change.
//
// A host that is NOT on this list is still served — which matters for preview
// deployments — but because the session cookie is host-only, a member reaching
// the app that way sees a signed-out app and has to sign in again. So keep this
// list current: add any domain that links or points at the live site.
const OWN_HOSTS = (
  process.env.NEXT_PUBLIC_OWN_HOSTS ||
  "yarnerylounge.vercel.app,christasspeakeasy.com,christaspeakeasy.com,community-elvisbitolo11-8702s-projects.vercel.app,elvisbitolo11-8702s-projects.vercel.app"
)
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

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
  "/spaces",
  "/discovery",
  "/dashboard",
  "/articles",
  "/gallery",
  "/search",
  "/perks",
];

const isDev = process.env.NODE_ENV === "development";
const cspHeader = buildCspHeader({ isDev });

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

// Exact host, a subdomain of one we own, or a Vercel per-deploy sibling of one
// we own.
//
// Both boundaries are deliberate. A bare endsWith() would also match
// `notchristasspeakeasy.com`, so custom domains are anchored on `.`.
//
// The hyphen boundary exists because Vercel does not hang its per-project hosts
// off the team domain as subdomains. It glues the project name onto the team
// name with a dash instead, so
// `elvisbitolo11-8702s-projects.vercel.app` is the *parent* of
// `community-elvisbitolo11-8702s-projects.vercel.app` and of every
// `community-<hash>-elvisbitolo11-8702s-projects.vercel.app` preview — they are
// siblings under `vercel.app`, not subdomains of the team host. Matching only
// on `.` therefore silently missed every real deployment domain of this
// project, which left production served off-canonical and split the host-only
// session cookie across two origins. Only Vercel can issue a
// `<something>-<team>.vercel.app` host, so the dash form is not over-broad.
function isOwnHost(hostname) {
  return OWN_HOSTS.some(
    (host) =>
      hostname === host ||
      hostname.endsWith(`.${host}`) ||
      hostname.endsWith(`-${host}`)
  );
}

export function proxy(request) {
  const { hostname, pathname, search } = request.nextUrl;

  const isCanonical =
    hostname === CANONICAL_HOST || hostname === "localhost" || hostname.endsWith(".local");

  if (!isCanonical && isOwnHost(hostname)) {
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