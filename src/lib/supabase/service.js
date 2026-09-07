import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey || serviceRoleKey === "[SENSITIVE]" || serviceRoleKey.includes("[SENSITIVE]")) {
  throw new Error(
    "Supabase service-role credentials missing or redacted. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
      "to the real values in .env.local (the current value looks redacted)."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default supabaseAdmin;