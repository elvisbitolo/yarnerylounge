// Content Security Policy. The app statically prerenders pages, so nonce-based
// CSP (which forces dynamic rendering) would be a regression — the documented
// "without nonces" baseline is used instead, widened with the third-party hosts
// the app talks to. This still hardens against injection: no object embedding,
// no base-uri/clickjacking, no form exfiltration, and HTTPS-only upgrades.
//
// Lives apart from src/proxy.js so it can be unit tested: that file imports
// next/server, and the policy is the one header a regression in which silently
// breaks the whole site (a missing directive fails closed, with no stack trace
// and only a console warning to show for it).
export function buildCspHeader({ isDev = process.env.NODE_ENV === "development" } = {}) {
  return `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://8x8.vc https://*.8x8.vc;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https:;
  font-src 'self';
  media-src 'self' blob: https://*.supabase.co;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.bigdatacloud.net https://api-bdc.io;
  frame-src 'self' https://8x8.vc https://*.8x8.vc https://www.youtube.com https://youtube.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
    .replace(/\s{2,}/g, " ")
    .trim();
}
