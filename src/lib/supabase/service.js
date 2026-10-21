import { createClient } from "@supabase/supabase-js";

// The service-role client is built on first use, not at import time.
//
// `next build` imports every route module to collect page data, so a module
// that threw on missing credentials broke the whole build (the cron routes
// import this file through the recording helpers). The credential check still
// runs before the client is handed out, so a misconfigured deployment fails
// loudly at the point of use instead of at import.
const globalForSupabase = globalThis;

function serviceRoleCredentials() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || serviceRoleKey === "[SENSITIVE]" || serviceRoleKey.includes("[SENSITIVE]")) {
    throw new Error(
      "Supabase service-role credentials missing or redacted. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "to the real values in .env.local (the current value looks redacted)."
    );
  }

  return { supabaseUrl, serviceRoleKey };
}

export function getSupabaseAdmin() {
  if (!globalForSupabase.__supabaseAdmin) {
    const { supabaseUrl, serviceRoleKey } = serviceRoleCredentials();
    globalForSupabase.__supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return globalForSupabase.__supabaseAdmin;
}

// Proxied so `supabaseAdmin.storage` / `supabaseAdmin.auth` keep working the
// same way for callers while the client itself stays lazy.
export const supabaseAdmin = new Proxy(
  {},
  {
    get(_target, prop) {
      // `then` would make the proxy look like a thenable to `await`, and
      // symbol lookups (inspect, toPrimitive) must not need credentials.
      if (prop === "then" || typeof prop === "symbol") return undefined;
      const client = getSupabaseAdmin();
      const value = client[prop];
      return typeof value === "function" ? value.bind(client) : value;
    },
  }
);

export default supabaseAdmin;
