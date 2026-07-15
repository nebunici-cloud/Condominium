import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

// Service-role client for admin-only operations (creating users,
// generating sign-in links without emailing them). Only ever used
// server-side, gated on SUPABASE_SERVICE_ROLE_KEY being set -- that
// env var must never be exposed to the client and should only exist
// in non-production Vercel environments (Preview/Development), never
// Production, once real residents are using the platform.
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return null;
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
