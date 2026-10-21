// Shared fail-closed authentication for scheduled jobs.
// A missing/empty secret must never authenticate a request as "Bearer undefined".
export function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (typeof secret !== "string" || secret.length === 0) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
