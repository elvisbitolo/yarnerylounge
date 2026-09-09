import { redirect } from "next/navigation";

const LANDING_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

export const dynamic = "force-dynamic";

export default function Home() {
  redirect(LANDING_URL);
}