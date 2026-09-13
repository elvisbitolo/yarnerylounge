import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error(
    "Supabase browser credentials missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment."
  );
}

// No localStorage persistence and no self-auto-refresh: the server-side Session
// store (Postgres) is the single owner of the Supabase tokens, exposed to the
// browser only as the httpOnly `community-auth` session cookie. If the browser
// client also persisted + auto-rotated the refresh token, it would consume the
// single-use refresh token the server shares — leaving the server side with a
// burned token that logs the member out on the next real-token rotation. OAuth
// (tokens parsed from the URL hash) and password sign-in (in-memory session)
// still work without persistence; recovery after a reload comes from `/api/me`,
// which the cookie authorizes.
export const supabaseBrowser = createClient(supabaseUrl, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export default supabaseBrowser;