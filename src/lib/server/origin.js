// Single public origin for the whole app — replicates the proxy's CANONICAL_HOST
// so sitemaps, metadata, canonical tags and email links never reference the
// Vercel alias (yarnerylounge.vercel.app) or the bare domain after a 308.
export const CANONICAL_ORIGIN = "https://www.christasspeakeasy.com";

export function appOrigin(req) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const origin = req.headers.get("origin") || "";
  if (/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin)) return origin;
  return "http://localhost:3000";
}
