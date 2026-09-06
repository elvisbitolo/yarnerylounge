import { redirect } from "next/navigation";
import { SHOPIFY_UPGRADE_URL } from "@/lib/server/shopify";

export const dynamic = "force-dynamic";

export function GET() {
  redirect(SHOPIFY_UPGRADE_URL);
}