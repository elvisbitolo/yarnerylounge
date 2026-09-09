import { NextResponse } from "next/server";

const AUTH_COOKIE = "community-auth";

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
  const { pathname } = request.nextUrl;
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
  matcher: [
    "/rooms/:path*",
    "/courses/:path*",
    "/groups/:path*",
    "/notifications/:path*",
    "/account/:path*",
    "/admin/:path*",
    "/members/:path*",
    "/community/:path*",
    "/neighbourhoods/:path*",
    "/feed/:path*",
    "/events/:path*",
    "/chat/:path*",
    "/host/:path*",
    "/leaderboard/:path*",
    "/challenges/:path*",
    "/spaces/:path*",
    "/discovery/:path*",
    "/dashboard/:path*",
    "/articles/:path*",
    "/gallery/:path*",
    "/search/:path*",
    "/perks/:path*",
  ],
};
