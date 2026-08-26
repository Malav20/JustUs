// JustUS iOS / iPadOS Injected Watch Party Overlay
// Provides Floating Party HUD, Cross-Platform Supabase Playback Sync, Event Logging & Chat
//
// NOTE: This is a standalone vanilla script injected into arbitrary streaming pages,
// so it cannot import from the app bundle. Its playback-sync thresholds/timings are
// intentionally kept in lock-step with the canonical extension/src/shared/sync-core.ts
// (the SYNC object). Change both together.

(function () {
  if (window.__JUSTUS_PARTY_OVERLAY_LOADED__) {
    if (typeof window.__JUSTUS_ENSURE_MOUNTED__ === "function") {
      window.__JUSTUS_ENSURE_MOUNTED__();
    }
    return;
  }
  window.__JUSTUS_PARTY_OVERLAY_LOADED__ = true;

  let SUPABASE_URL = window.__JUSTUS_CONFIG__?.supabaseUrl || "";
  let SUPABASE_ANON_KEY = window.__JUSTUS_CONFIG__?.supabaseAnonKey || "";
  const API_BASE = window.__JUSTUS_CONFIG__?.appUrl || "https://just-us-web.vercel.app";

  async function ensureConfigLoaded() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) return;
    try {
      const res = await fetch(`${API_BASE}/api/config`);
      if (res.ok) {
        const config = await res.json();
        if (config.supabaseUrl) SUPABASE_URL = config.supabaseUrl;
        if (config.supabaseAnonKey) SUPABASE_ANON_KEY = config.supabaseAnonKey;
      }
    } catch (e) {
      console.warn("[JustUS] Could not load dynamic config:", e);
    }
  }

  let supabaseClient = null;
  let activeChannel = null;
  let activeRoomId = null;
  let currentUserName = localStorage.getItem("justus_username") || "iPad_User_" + Math.floor(Math.random() * 1000);
  let isHost = false;
  let isSyncActionInProgress = false;
  let isInitialSyncCompleted = false;
  let heartbeatTimer = null;
  let boundVideoEl = null;

  // Persist party state across page navigations (YouTube SPA full-reloads)
  function savePartyState() {
    try {
      if (activeRoomId) {
        sessionStorage.setItem("justus_active_room", activeRoomId);
        sessionStorage.setItem("justus_is_host", isHost ? "1" : "0");
      } else {
        sessionStorage.removeItem("justus_active_room");
        sessionStorage.removeItem("justus_is_host");
      }
    } catch (e) {}
  }
  function restorePartyState() {
    try {
      const savedRoom = sessionStorage.getItem("justus_active_room");
      const savedHost = sessionStorage.getItem("justus_is_host");
      if (savedRoom) {
        activeRoomId = savedRoom;
        isHost = savedHost === "1";
        return true;
      }
    } catch (e) {}
    return false;
  }

  // Storage of events & chat
  const eventLogs = [];
  let boundLocalPreviewTrack = null;

  // Helper to load Supabase JS SDK dynamically
  async function loadSupabase(callback) {
    await ensureConfigLoaded();
    if (window.supabase && window.supabase.createClient) {
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
      }
      callback();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
    script.onload = function () {
      if (window.supabase && window.supabase.createClient && SUPABASE_URL && SUPABASE_ANON_KEY) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
      }
      callback();
    };
    script.onerror = function () {
      console.warn("[JustUS] Could not load Supabase SDK from CDN");
    };
    (document.head || document.documentElement).appendChild(script);
  }

  // ── Touch / mobile helpers (iPad WKWebView + YouTube gesture competition) ──
  const IS_IOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const IS_TOUCH_DEVICE = IS_IOS || navigator.maxTouchPoints > 0;
  const DRAG_THRESHOLD_PX = IS_TOUCH_DEVICE ? 14 : 6;

  function getEventPoint(e) {
    if (e.touches && e.touches.length) return e.touches[0];
    if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0];
    return e;
  }

  /** One handler per tap — touchstart on iOS avoids double-fire with synthetic click. */
  function bindOverlayTap(el, handler) {
    if (!el || !handler) return;
    let lastTap = 0;
    const run = (e) => {
      if (e) {
        try {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        } catch (err) {}
      }
      const now = Date.now();
      if (now - lastTap < 400) return;
      lastTap = now;
      handler(e);
    };
    if (IS_TOUCH_DEVICE) {
      el.addEventListener("touchstart", run, { passive: false, capture: true });
    } else {
      el.addEventListener("click", run);
    }
  }

  function getVideoCapturePreset() {
    // Match pre-optimization preset that worked on iPad (336f86d regressed touch to 320x240).
    if (IS_TOUCH_DEVICE) {
      const lk = window.LivekitClient;
      if (lk?.VideoPresets?.h216?.resolution) return lk.VideoPresets.h216.resolution;
      return { width: 384, height: 216, frameRate: 15 };
    }
    return { width: 480, height: 360, frameRate: 24 };
  }

  async function playVideoElement(el) {
    if (!el) return;
    el.muted = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    try {
      await el.play();
    } catch (e) {
      setTimeout(() => {
        try {
          el.play().catch(() => {});
        } catch (err) {}
      }, 150);
    }
  }

  function attachVideoTrack(track, videoEl, isLocalPreview) {
    if (!track || !videoEl) return;
    // detach() before attach breaks local camera preview on iOS WKWebView (faea8ba regression).
    if (!isLocalPreview) {
      try {
        track.detach();
      } catch (e) {}
    }
    try {
      track.attach(videoEl);
    } catch (e) {
      console.warn("[JustUS] track.attach failed:", e);
    }
    playVideoElement(videoEl);
  }

  function attachLocalPreview(track, videoEl) {
    if (!track || !videoEl) return;
    const mediaTrack = track.mediaStreamTrack;
    if (!mediaTrack) return;

    // Skip re-bind — re-attaching causes iOS WKWebView preview flicker.
    if (
      boundLocalPreviewTrack === mediaTrack &&
      videoEl.srcObject &&
      videoEl.srcObject.getVideoTracks()[0] === mediaTrack
    ) {
      videoEl.classList.remove("hidden");
      return;
    }
    boundLocalPreviewTrack = mediaTrack;

    videoEl.muted = true;
    videoEl.setAttribute("playsinline", "true");
    videoEl.setAttribute("webkit-playsinline", "true");

    if (IS_IOS) {
      // LiveKit track.attach() flickers in Shadow DOM on WKWebView — use srcObject only.
      try {
        videoEl.srcObject = new MediaStream([mediaTrack]);
      } catch (e) {
        console.warn("[JustUS] local srcObject failed:", e);
      }
    } else {
      try {
        track.attach(videoEl);
      } catch (e) {
        console.warn("[JustUS] local preview attach failed:", e);
      }
    }

    videoEl.classList.remove("hidden");
    videoEl.play().catch(() => {
      setTimeout(() => videoEl.play().catch(() => {}), 150);
    });
  }
