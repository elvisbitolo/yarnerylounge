import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/authorize";
import { logError } from "@/lib/server/log";
import {
  exchangeCustomerCode,
  fetchShopifyCustomerProfile,
  persistShopifyCustomerLink,
  readLinkState,
} from "@/lib/server/shopify-customer.js";
import { LINK_STATE_COOKIE, normalizeEmail } from "@/lib/server/shopify-customer-core.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function redirectToMembership(origin, query = "") {
  const target = new URL("/account/membership", origin);
  if (query) target.search = query;
  const response = NextResponse.redirect(target);
  response.cookies.delete(LINK_STATE_COOKIE);
  return response;
}

function fail(origin, message) {
  return redirectToMembership(origin, `shopifyError=${encodeURIComponent(message)}`);
}

export async function GET(req) {
  const origin = req.nextUrl.origin;
  const params = req.nextUrl.searchParams;
  const upstreamError = params.get("error");
  if (upstreamError) return fail(origin, "Shopify billing link was cancelled.");

  const code = params.get("code");
  const state = params.get("state");
  const cookieState = req.cookies.get(LINK_STATE_COOKIE)?.value;
  if (!code || !state || !cookieState) return fail(origin, "Shopify billing link expired. Please try again.");

  let decodedCookie = "";
  try {
    decodedCookie = decodeURIComponent(cookieState);
  } catch {
    return fail(origin, "Shopify billing link expired. Please try again.");
  }
  if (decodedCookie !== state) return fail(origin, "Shopify billing link expired. Please try again.");

  const parsed = readLinkState(state);
  if (!parsed) return fail(origin, "Shopify billing link expired. Please try again.");

  const auth = await requireUser();
  if (!auth.ok) return redirectToMembership(origin, "shopifyError=Please%20sign%20in%20again.");
  const uid = auth.user.uid;
  if (uid !== parsed.uid) return fail(origin, "Shopify billing link belongs to another account.");

  try {
    const tokens = await exchangeCustomerCode({ code, origin });
    const profile = await fetchShopifyCustomerProfile(tokens.accessToken, origin);
    const shopifyEmail = normalizeEmail(profile.customer?.emailAddress?.emailAddress);
    const expectedEmail = normalizeEmail(parsed.email);
    if (!shopifyEmail || !expectedEmail || shopifyEmail !== expectedEmail) {
      return fail(origin, "Use the same email address on Shopify and ChristaSpeakeasy.");
    }
    await persistShopifyCustomerLink({
      uid,
      tokens,
      customer: profile.customer,
      email: expectedEmail,
    });
    return redirectToMembership(origin, "shopifyLinked=1");
  } catch (error) {
    logError("shopify_callback_failed", { error: error.message, code: error.code });
    return fail(origin, error.code === "CONFIG_MISSING" ? "Shopify billing is not configured yet." : "Could not link Shopify billing. Please try again.");
  }
}
