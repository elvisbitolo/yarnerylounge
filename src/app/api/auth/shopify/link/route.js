import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { logError } from "@/lib/server/log";
import { createShopifyAuthorizeUrl } from "@/lib/server/shopify-customer.js";
import { LINK_STATE_COOKIE } from "@/lib/server/shopify-customer-core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const origin = req.nextUrl.origin;
  try {
    const uid = auth.user.uid;
    const email = auth.user.email || auth.userDoc?.email || "";
    const result = await createShopifyAuthorizeUrl({ uid, email, origin });
    const response = NextResponse.redirect(result.url);
    response.cookies.set(LINK_STATE_COOKIE, result.cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: result.maxAge,
    });
    return response;
  } catch (error) {
    logError("shopify_link_failed", { error: error.message, code: error.code });
    return NextResponse.json(
      {
        error: "Could not start Shopify billing link.",
        code: error.code || "LINK_FAILED",
      },
      { status: error.status || 502 },
    );
  }
}
