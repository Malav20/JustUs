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
};

// Playback-sync timing/threshold constants live in `sync-core.ts` (the SYNC object),
// which is the single source of truth shared with the party-overlay logic.

