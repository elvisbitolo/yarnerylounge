import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";

const LANDING_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : LANDING_URL);
}