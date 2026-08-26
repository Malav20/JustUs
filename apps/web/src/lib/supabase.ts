import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

// Public browser/client client (anon key — safe to import in client components).
// The privileged service-role client lives in `supabase.server.ts` so it is
// never bundled into client-side JavaScript.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
