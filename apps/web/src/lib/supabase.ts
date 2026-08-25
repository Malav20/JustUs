import { createClient } from "@supabase/supabase-js";

const DEFAULT_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqdXFuaHFlZHlraGVjdGZoemJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MzMxNzcsImV4cCI6MjEwMzIwOTE3N30.UhcqK9MfjxuT-XjjiHzpnrRgZKjkyX2IDuh5FMhoO98";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://djuqnhqedykhectfhzba.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_ANON_KEY;

// Public browser/client client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin server-side client
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
