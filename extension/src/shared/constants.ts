export const CONFIG = {
  SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (typeof (import.meta as any) !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_URL) ||
    "",
  SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    (typeof (import.meta as any) !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ||
    "",
  LIVEKIT_WS_URL:
    process.env.NEXT_PUBLIC_LIVEKIT_URL ||
    (typeof (import.meta as any) !== "undefined" && (import.meta as any).env?.VITE_LIVEKIT_WS_URL) ||
    "",
  WEB_API_URL:
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof (import.meta as any) !== "undefined" && (import.meta as any).env?.VITE_WEB_API_URL) ||
    "https://just-us-web.vercel.app",
  DRIFT_THRESHOLD_SECONDS: 0.15, // 150ms tolerance
  HEARTBEAT_INTERVAL_MS: 2000, // 2s adaptive smooth heartbeat
  SYNC_ACTION_COOLDOWN_MS: 400, // echo prevention lock window
};

