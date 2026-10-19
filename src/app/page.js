import { cookies } from "next/headers";
import { redirect, permanentRedirect } from "next/navigation";
import { AUTH_COOKIE } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const SPEAKEASY_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

export default async function Home() {
  const cookieStore = await cookies();
  if (cookieStore.get(AUTH_COOKIE)?.value) redirect("/api/auth/reentry");

  permanentRedirect(SPEAKEASY_URL);
}
