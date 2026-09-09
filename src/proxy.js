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

  const hasSession = request.cookies.get(AUTH_COOKIE)?.value;

  const needsAuth = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (needsAuth && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/(.*)"],
};
