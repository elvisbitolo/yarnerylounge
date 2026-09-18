import { createClient } from "@supabase/supabase-js";

// Single shared Supabase client for everything that runs in the browser.
// Every other browser-facing module imports this one instance, so GoTrue
// (Auth) initializes exactly once per browser context — avoiding the
// "Multiple GoTrueClient instances detected in the same browser context"
// warning.
//
// No localStorage persistence and no self-auto-refresh: the server-side
// Session store (Postgres) is the single owner of the Supabase tokens,
// exposed to the browser only as the httpOnly `community-auth` session
// cookie. If the browser client also persisted + auto-rotated the refresh
// token, it would consume the single-use refresh token the server shares —
// leaving the server side with a burned token that logs the member out on
// the next real-token rotation. OAuth (tokens parsed from the URL hash) and
// password sign-in (in-memory session) still work without persistence;
// recovery after a reload comes from `/api/me`, which the cookie authorizes.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase credentials missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export default supabase;