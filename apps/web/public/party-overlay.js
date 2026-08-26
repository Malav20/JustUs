// JustUS iOS / Android / iPadOS Injected Watch Party Overlay
// Built from apps/web/party-overlay/modules — run: npm run build:overlay
// Playback-sync thresholds match extension/src/shared/sync-core.ts (change both together).

// JustUS iOS / iPadOS Injected Watch Party Overlay
// Provides Floating Party HUD, Cross-Platform Supabase Playback Sync, Event Logging & Chat
//
// NOTE: This is a standalone vanilla script injected into arbitrary streaming pages,
// so it cannot import from the app bundle. Its playback-sync thresholds/timings are
// intentionally kept in lock-step with the canonical extension/src/shared/sync-core.ts
// (the SYNC object). Change both together.

(function () {
  window.__JUSTUS_OVERLAY_VERSION__ = "android-netflix-v1";
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
  const IS_ANDROID = !!window.__JUSTUS_NATIVE_ANDROID__;
  const IS_IOS =
    !!window.__JUSTUS_NATIVE_IOS__ ||
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const IS_TOUCH_DEVICE = IS_IOS || IS_ANDROID || navigator.maxTouchPoints > 0;
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

  // Detect Video Player (YouTube, Netflix API, Prime, or HTML5 video)
  function findVideoElement() {
    return document.querySelector(".html5-main-video, .watch-video video, .sizing-wrapper video, .webPlayerUIContainer video, .rendererContainer video, video");
  }

  function getYouTubePlayer() {
    try {
      const ytp = document.getElementById("movie_player") || document.querySelector(".html5-video-player");
      if (ytp && typeof ytp.playVideo === "function") {
        return ytp;
      }
    } catch (e) {}
    return null;
  }

  function getNetflixPlayer() {
    try {
      const netflix = window.netflix;
      if (
        netflix &&
        netflix.appContext &&
        netflix.appContext.state &&
        netflix.appContext.state.playerApp &&
        netflix.appContext.state.playerApp.getAPI
      ) {
        const videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
        if (videoPlayer) {
          const sessionIds = videoPlayer.getAllPlayerSessionIds();
          if (sessionIds && sessionIds.length > 0) {
            for (let i = sessionIds.length - 1; i >= 0; i--) {
              const player = videoPlayer.getVideoPlayerBySessionId(sessionIds[i]);
              if (player && typeof player.play === "function") return player;
            }
            return videoPlayer.getVideoPlayerBySessionId(sessionIds[0]);
          }
        }
      }
    } catch (e) {}
    return null;
  }

  // ─────────────────────────────────────────────────────────────────
  // SCREEN WAKE LOCK CONTROLLER (Keep Screen Awake while Playing)
  // ─────────────────────────────────────────────────────────────────
  let overlayWakeLockSentinel = null;
  let isWakeLockRequested = false;

  async function setWakeLock(enable) {
    isWakeLockRequested = enable;

    // 1. Android Native Bridge
    try {
      if (window.AndroidWakeLock && typeof window.AndroidWakeLock.setKeepScreenOn === "function") {
        window.AndroidWakeLock.setKeepScreenOn(enable);
      }
    } catch (e) {}

    // 2. iOS WKWebView Message Handler Bridge
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.wakeLock) {
        window.webkit.messageHandlers.wakeLock.postMessage({ keepAwake: enable });
      }
    } catch (e) {}

    // 3. Web Screen Wake Lock API (Safari 16.4+, Chrome, Edge, Mobile Browsers)
    try {
      if ("wakeLock" in navigator && typeof navigator.wakeLock.request === "function") {
        if (enable) {
          if (!overlayWakeLockSentinel || overlayWakeLockSentinel.released) {
            overlayWakeLockSentinel = await navigator.wakeLock.request("screen");
            overlayWakeLockSentinel.addEventListener("release", () => {
              overlayWakeLockSentinel = null;
            });
          }
        } else {
          if (overlayWakeLockSentinel && !overlayWakeLockSentinel.released) {
            await overlayWakeLockSentinel.release();
            overlayWakeLockSentinel = null;
          }
        }
      }
    } catch (e) {}
  }

  // Resilient visibility and network reconnect handlers
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        if (isWakeLockRequested || isVideoPlaying()) {
          setWakeLock(true);
        }
        // Re-verify and restore channel connectivity on tab resume
        if (activeRoomId && supabaseClient) {
          if (!activeChannel || activeChannel.state === "errored" || activeChannel.state === "closed") {
            console.log("[JustUS] Tab resumed, reconnecting Realtime channel...");
            connectRealtimeChannel(activeRoomId, isHost);
          }
        }
      }
    });

    window.addEventListener("online", () => {
      console.log("[JustUS] Network back online, restoring party state...");
      if (activeRoomId && supabaseClient) {
        connectRealtimeChannel(activeRoomId, isHost);
      }
    });
  }

  function playVideo() {
    setWakeLock(true);
    // 1. Netflix Player API
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.play === "function") {
      try {
        netflixPlayer.play();
        return;
      } catch (e) {}
    }

    // 2. YouTube Player API
    const ytp = getYouTubePlayer();
    if (ytp) {
      try {
        ytp.playVideo();
      } catch (e) {}
    }

    // YouTube Large Play Button (unstarted stream overlay)
    const ytpLargePlay = document.querySelector(".ytp-large-play-button, .ytp-cued-thumbnail-overlay-image");
    if (ytpLargePlay) {
      try {
        ytpLargePlay.click();
      } catch (e) {}
    }

    // YouTube Play/Pause Toggle button
    const ytpPlayBtn = document.querySelector(".ytp-play-button, button.player-control-play-pause-icon, .player-controls-middle button");
    const v = findVideoElement();
    if (ytpPlayBtn && v && v.paused) {
      try {
        ytpPlayBtn.click();
      } catch (e) {}
    }

    // Prime Video Play Button
    const primePlayBtn = document.querySelector("button.paused, button[aria-label*='Play'], button.atvwebplayersdk-playpause-button");
    if (primePlayBtn && v && v.paused) {
      try {
        primePlayBtn.click();
      } catch (e) {}
    }

    // 3. HTML5 Video Element Fallback
    if (v) {
      if (v.paused) {
        const playPromise = v.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            const playBtn = document.querySelector("button[data-uia='control-play-pause'], .ytp-play-button, .ytp-large-play-button");
            if (playBtn) playBtn.click();
          });
        }
      }
    }
  }

  function pauseVideo() {
    setWakeLock(false);
    // 1. Netflix Player API
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.pause === "function") {
      try {
        netflixPlayer.pause();
        return;
      } catch (e) {}
    }

    // 2. YouTube Player API
    const ytp = getYouTubePlayer();
    if (ytp) {
      try {
        ytp.pauseVideo();
      } catch (e) {}
    }

    const v = findVideoElement();
    // YouTube Play/Pause Toggle button
    const ytpPlayBtn = document.querySelector(".ytp-play-button");
    if (ytpPlayBtn && v && !v.paused) {
      try {
        ytpPlayBtn.click();
      } catch (e) {}
    }

    // Prime Video Pause Button
    const primePauseBtn = document.querySelector("button[aria-label*='Pause']");
    if (primePauseBtn && v && !v.paused) {
      try {
        primePauseBtn.click();
      } catch (e) {}
    }

    // 3. HTML5 Video Element
    if (v && !v.paused) {
      try {
        v.pause();
      } catch (e) {}
      const playBtn = document.querySelector("button[data-uia='control-play-pause']");
      if (playBtn) playBtn.click();
    }
  }

  function seekVideo(timeInSeconds) {
    if (timeInSeconds < 0.5) return;
    // 1. Netflix Player API
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.seek === "function") {
      try {
        netflixPlayer.seek(timeInSeconds * 1000);
        return;
      } catch (e) {}
    }

    // 2. YouTube Player API
    const ytp = getYouTubePlayer();
    if (ytp && typeof ytp.seekTo === "function") {
      try {
        ytp.seekTo(timeInSeconds, true);
      } catch (e) {}
    }

    // 3. HTML5 Video Element
    const v = findVideoElement();
    if (v) {
      try {
        v.currentTime = timeInSeconds;
      } catch (e) {}
    }
  }

  let currentPlaybackRate = 1.0;
  function setPlaybackRate(rate) {
    if (Math.abs(currentPlaybackRate - rate) < 0.01) return;
    currentPlaybackRate = rate;
    const ytp = getYouTubePlayer();
    if (ytp && typeof ytp.setPlaybackRate === "function") {
      try {
        ytp.setPlaybackRate(rate);
      } catch (e) {}
    }
    const v = findVideoElement();
    if (v) {
      try {
        v.playbackRate = rate;
      } catch (e) {}
    }
  }

  function getCurrentVideoTime() {
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.getCurrentTime === "function") {
      return netflixPlayer.getCurrentTime() / 1000;
    }
    const ytp = getYouTubePlayer();
    if (ytp && typeof ytp.getCurrentTime === "function") {
      const t = ytp.getCurrentTime();
      if (typeof t === "number" && !isNaN(t) && t > 0) return t;
    }
    const v = findVideoElement();
    return v ? v.currentTime : 0;
  }

  function isVideoPlaying() {
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.isPlaying === "function") {
      return netflixPlayer.isPlaying();
    }
    const ytp = getYouTubePlayer();
    if (ytp && typeof ytp.getPlayerState === "function") {
      const s = ytp.getPlayerState();
      // 1 = PLAYING, 3 = BUFFERING
      if (s === 1 || s === 3) return true;
      if (s === 2 || s === 0 || s === -1) return false;
    }
    const v = findVideoElement();
    return Boolean(v && !v.paused && !v.ended);
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const formattedMins = mins < 10 ? `0${mins}` : `${mins}`;
    const formattedSecs = secs < 10 ? `0${secs}` : `${secs}`;
    return `${formattedMins}:${formattedSecs}`;
  }

  // ─────────────────────────────────────────────────────────────────
  // SHADOW DOM OVERLAY UI CREATION
  // ─────────────────────────────────────────────────────────────────
  const hostDiv = document.createElement("div");
  hostDiv.id = "justus-party-overlay-root";
  if (typeof IS_IOS !== "undefined" && IS_IOS) {
    hostDiv.classList.add("ju-is-ios");
  }
  hostDiv.style.cssText =
    "position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 2147483647 !important; pointer-events: none !important; margin: 0 !important; padding: 0 !important; border: none !important;";

  const shadow = hostDiv.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    
    .badges-container {
      position: fixed !important;
      top: max(14px, env(safe-area-inset-top, 14px)) !important;
      right: max(16px, env(safe-area-inset-right, 16px)) !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      transform: translate3d(0, 0, 0) !important;
      will-change: transform !important;
    }
    
    .floating-pill {
      height: 38px !important;
      padding: 0 14px !important;
      border-radius: 19px !important;
      background: #111320 !important;
      border: 1px solid rgba(255, 255, 255, 0.22) !important;
      color: #ffffff !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      display: flex !important;
      align-items: center !important;
      gap: 7px !important;
      cursor: pointer !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6) !important;
      pointer-events: auto !important;
      user-select: none !important;
      -webkit-user-select: none !important;
      -webkit-touch-callout: none !important;
      touch-action: manipulation !important;
      -ms-touch-action: manipulation !important;
      transition: transform 0.15s ease, background 0.2s ease !important;
      transform: translate3d(0, 0, 0) !important;
      opacity: 1 !important;
      visibility: visible !important;
    }
    .floating-pill:active { transform: translate3d(0, 0, 0) scale(0.96) !important; }
    .floating-pill.hidden { display: none !important; }
    .floating-pill.video-pill {
      background: #1e1b4b !important;
      border-color: rgba(99, 102, 241, 0.45) !important;
    }
    .floating-pill.video-pill.active {
      background: #064e3b !important;
      border-color: rgba(16, 185, 129, 0.5) !important;
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10B981;
      box-shadow: 0 0 8px #10B981;
    }
    .status-dot.idle { background: #6366F1; box-shadow: 0 0 8px #6366F1; }
    .status-dot.active { background: #10B981; box-shadow: 0 0 8px #10B981; animation: pulseRing 1.8s infinite; }
    .status-dot.off { background: #94A3B8; box-shadow: none; }

    @keyframes pulseRing {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }

    /* PIP video window is built in document.body by livekit.js with inline styles.
       No Shadow DOM video elements. */

    .drawer-overlay {
      position: fixed !important;
      top: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: min(340px, 92vw) !important;
      max-width: 100vw !important;
      background: #0e101a !important;
      border-left: 1px solid rgba(255, 255, 255, 0.15) !important;
      box-shadow: -10px 0 40px rgba(0, 0, 0, 0.75) !important;
      display: flex !important;
      flex-direction: column !important;
      color: #F1F5F9 !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      transform: translate3d(100%, 0, 0) !important;
      will-change: transform !important;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    .drawer-overlay.open {
      transform: translate3d(0, 0, 0) !important;
    }

    .drawer-header {
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .brand-title {
      font-size: 14px;
      font-weight: 800;
      background: linear-gradient(135deg, #fff, #94A3B8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .close-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #94A3B8;
      width: 28px;
      height: 28px;
      border-radius: 14px;
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .tabs-bar {
      display: flex;
      padding: 8px 12px;
      gap: 6px;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .tab-btn {
      flex: 1;
      padding: 8px;
      border-radius: 10px;
      background: transparent;
      border: none;
      color: #94A3B8;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .tab-btn.active {
      background: rgba(99, 102, 241, 0.25);
      color: #fff;
      border: 1px solid rgba(99, 102, 241, 0.4);
    }

    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .input-field {
      width: 100%;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      padding: 10px 12px;
      color: #fff;
      font-size: 12px;
      outline: none;
    }
    .input-field:focus {
      border-color: #6366F1;
    }

    .action-btn {
      width: 100%;
      padding: 12px;
      border-radius: 12px;
      background: linear-gradient(135deg, #E50914, #991B1B);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(229, 9, 20, 0.35);
      transition: transform 0.1s ease, filter 0.2s ease;
    }
    .action-btn.indigo {
      background: linear-gradient(135deg, #6366F1, #4F46E5);
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
    }
    .action-btn.emerald {
      background: linear-gradient(135deg, #10B981, #059669);
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
    }
    .action-btn:active { transform: scale(0.98); }

    .action-header-btn {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #F87171;
      padding: 5px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: background 0.15s ease, transform 0.1s ease;
    }
    .action-header-btn:active {
      transform: scale(0.95);
    }

    .party-active-card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .room-badge {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(0, 0, 0, 0.4);
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11px;
    }
    .copy-btn {
      background: rgba(99, 102, 241, 0.3);
      border: 1px solid rgba(99, 102, 241, 0.5);
      color: #C7D2FE;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
    }

    .event-feed {
      flex: 1;
      min-height: 200px;
      max-height: 380px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-right: 4px;
    }
    .feed-item {
      padding: 8px 10px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 11px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .feed-item.chat {
      background: rgba(99, 102, 241, 0.15);
      border-color: rgba(99, 102, 241, 0.25);
    }
    .feed-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #94A3B8;
      font-size: 10px;
    }
    .feed-sender { font-weight: 700; color: #A5B4FC; }

    .reactions-bar {
      display: flex;
      justify-content: space-between;
      gap: 4px;
      padding: 6px 0;
    }
    .reaction-btn {
      flex: 1;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 6px 0;
      font-size: 15px;
      cursor: pointer;
      text-align: center;
      transition: transform 0.1s ease;
    }
    .reaction-btn:active { transform: scale(1.2); }

    .chat-input-bar {
      display: flex;
      gap: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
  `;

  shadow.appendChild(style);

  // Floating Badges Container
  const badgesContainer = document.createElement("div");
  badgesContainer.className = "badges-container";
  badgesContainer.innerHTML = `
    <div class="floating-pill video-pill hidden" id="ju-video-pill">
      <span class="status-dot idle" id="ju-video-dot"></span>
      <span id="ju-video-pill-text">📹 Video Call</span>
    </div>
    <div class="floating-pill" id="ju-party-pill">
      <span class="status-dot idle" id="ju-status-dot"></span>
      <span id="ju-pill-text">🎉 Watch Party</span>
    </div>
  `;
  shadow.appendChild(badgesContainer);

  const partyPill = shadow.getElementById("ju-party-pill");
  const videoPill = shadow.getElementById("ju-video-pill");

  // Drawer Overlay Element (stays in Shadow DOM — no video inside)
  const drawer = document.createElement("div");
  drawer.className = "drawer-overlay";
  shadow.appendChild(drawer);

  function ensureOverlayMounted() {
    try {
      const existing = document.getElementById("justus-party-overlay-root");
      const target = document.body || document.documentElement;
      if (!existing && target) {
        target.appendChild(hostDiv);
      } else if (existing && target && existing.parentElement !== target) {
        target.appendChild(existing);
      }
    } catch (e) {}
  }
  let mountScheduled = false;
  function scheduleEnsureMounted() {
    if (mountScheduled) return;
    mountScheduled = true;
    requestAnimationFrame(() => {
      mountScheduled = false;
      ensureOverlayMounted();
    });
  }

  if (document.body || document.documentElement) ensureOverlayMounted();
  window.__JUSTUS_ENSURE_MOUNTED__ = ensureOverlayMounted;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureOverlayMounted);
  }
  window.addEventListener("yt-navigate-finish", ensureOverlayMounted);
  window.addEventListener("popstate", ensureOverlayMounted);
  window.addEventListener("load", ensureOverlayMounted);
  try {
    const observer = new MutationObserver(() => {
      if (!document.getElementById("justus-party-overlay-root")) scheduleEnsureMounted();
    });
    observer.observe(document.documentElement, { childList: true, subtree: false });
  } catch (e) {}

  let isDrawerOpen = false;

  function openDrawer() {
    try { isDrawerOpen = true; drawer.classList.add("open"); renderDrawerContent(); } catch {}
  }
  function closeDrawer(e) {
    if (e) { try { e.preventDefault(); e.stopPropagation(); } catch {} }
    isDrawerOpen = false;
    drawer.classList.remove("open");
  }
  function toggleDrawer() {
    if (isDrawerOpen || drawer.classList.contains("open")) closeDrawer();
    else openDrawer();
  }

  // Badge taps — bindOverlayTap avoids double-fire on iPad
  bindOverlayTap(partyPill, () => toggleDrawer());
  bindOverlayTap(videoPill, () => toggleVideoCallWindow());

  // Prevent touches inside drawer from reaching the streaming page
  drawer.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: false });
  drawer.addEventListener("touchmove",  (e) => e.stopPropagation(), { passive: false });
  drawer.addEventListener("touchend",   (e) => e.stopPropagation(), { passive: false });
  drawer.addEventListener("click",      (e) => e.stopPropagation());

  // ─────────────────────────────────────────────────────────────────
  // NOTE: The video call PIP window is built in document.body by
  // livekit.js so that iOS WKWebView applies its inline-playback
  // policy to the <video> elements (Shadow DOM blocks inline playback).
  // ─────────────────────────────────────────────────────────────────
  // ─── JustUS Video Call PIP ─────────────────────────────────────────────────
  //
  // Architecture: The entire PIP window lives in document.body, never in the
  // Shadow DOM. This is the only way iOS WKWebView applies its inline-playback
  // policy to <video> elements.
  //
  // Camera: getUserMedia() directly — no LiveKit camera management.
  //   LiveKit is used only for signalling/transport (publishTrack).
  //   This prevents LiveKit's internal mute/restart logic from touching the
  //   track and causing the "flash then black" symptom on iOS WKWebView.
  //
  // Mute: mediaStreamTrack.enabled = false — instant, no re-acquire.
  // Camera off: same. Never call track.stop() mid-call on iOS.
  // Remote audio: track.attach() appended to body (not Shadow DOM).
  // ──────────────────────────────────────────────────────────────────────────

  // ── state ─────────────────────────────────────────────────────────────────
  let livekitRoom        = null;
  let lkLocalAudioTrack  = null;   // LiveKit LocalAudioTrack (mic)
  let lkLocalVideoTrack  = null;   // LiveKit LocalVideoTrack (published camera)
  let localCameraStream  = null;   // raw MediaStream from getUserMedia
  let remoteAudioEl      = null;   // <audio> in body for remote voice

  // The PIP container and its children (all in document.body)
  let pipContainer       = null;
  let pipRemoteVideo     = null;
  let pipLocalVideo      = null;
  let pipWaitOverlay     = null;
  let pipCtrlOverlay     = null;
  let pipStatusText      = null;

  let isVideoCallActive  = false;
  let isMicEnabled       = false;
  let isCamEnabled       = true;
  let currentFacingMode  = "user";
  let isLkConnecting     = false;
  let reconnectTimer     = null;
  let autoCallScheduled  = false;
  let userHungUp         = false;
  let ctrlHideTimer      = null;
  let captureUsesCombinedAv = false;
  let iosHeldAudioTrack     = null; // iOS: audio captured at join, published when mic tapped
  // Simple stroke icons for PIP controls (no emoji)
  const PIP_ICONS = {
    close: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    mic: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  micOff: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-1.32"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
    cam: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>',
    camOff: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m2 2 20 20"/><path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16"/><path d="m9.5 7.5 3 2.5 3-2.5"/></svg>',
    flip: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>',
    end: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 1.72 1.84 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/></svg>',
  };

  const PIP_BTN = "width:32px;height:32px;border-radius:16px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;touch-action:manipulation;padding:0;";

  // ── identity ───────────────────────────────────────────────────────────────
  function getLkIdentity() {
    try {
      let id = sessionStorage.getItem("justus_lk_id");
      if (!id) { id = currentUserName + "_" + Math.random().toString(36).slice(2, 8); sessionStorage.setItem("justus_lk_id", id); }
      return id;
    } catch { return currentUserName + "_" + Math.random().toString(36).slice(2, 8); }
  }
  function clearLkIdentity() { try { sessionStorage.removeItem("justus_lk_id"); } catch {} }

  // ── SDK loader ─────────────────────────────────────────────────────────────
  function loadLiveKitSDK(cb) {
    if (window.LivekitClient) { cb(); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/livekit-client@2.6.0/dist/livekit-client.umd.min.js";
    s.onload = () => { if (window.LivekitClient) cb(); };
    s.onerror = () => addEventLog("⚠️ Could not load video SDK", "System");
    (document.head || document.documentElement).appendChild(s);
  }

  // ── PIP DOM builder ────────────────────────────────────────────────────────
  // Everything here is a plain document.body element so iOS WKWebView inline-
  // playback policy applies. All styles are inline to prevent page CSS bleed.
  function buildPip() {
    if (document.getElementById("justus-pip")) return; // already built

    // ── container ────────────────────────────────────────────────────────────
    const pip = document.createElement("div");
    pip.id = "justus-pip";
    pip.style.cssText = [
      "position:fixed",
      "bottom:80px",
      "right:16px",
      "width:240px",
      "height:180px",
      "min-width:160px",
      "min-height:120px",
      "background:#090a14",
      "border-radius:16px",
      "border:1.5px solid rgba(255,255,255,0.22)",
      "box-shadow:0 12px 40px rgba(0,0,0,0.85)",
      "z-index:2147483646",
      "overflow:hidden",
      "display:none",
      "touch-action:none",
      "user-select:none",
      "-webkit-user-select:none",
      "font-family:-apple-system,BlinkMacSystemFont,sans-serif",
      "box-sizing:border-box",
    ].join(";");

    // ── remote video — fills entire pip ──────────────────────────────────────
    const rv = document.createElement("video");
    rv.id = "justus-rv";
    rv.muted = true;
    rv.playsInline = true;
    rv.setAttribute("playsinline", "");
    rv.setAttribute("webkit-playsinline", "");
    rv.setAttribute("x-webkit-airplay", "deny");
    rv.setAttribute("disablepictureinpicture", "");
    rv.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
    rv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;background:#090a14;";
    pip.appendChild(rv);

    // ── local camera preview — small, top-left ────────────────────────────────
    const lv = document.createElement("video");
    lv.id = "justus-lv";
    lv.muted = true;
    lv.playsInline = true;
    lv.setAttribute("playsinline", "");
    lv.setAttribute("webkit-playsinline", "");
    lv.setAttribute("x-webkit-airplay", "deny");
    lv.setAttribute("disablepictureinpicture", "");
    lv.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
    lv.style.cssText = "position:absolute;top:8px;left:8px;width:64px;height:48px;object-fit:cover;border-radius:8px;border:1.5px solid rgba(255,255,255,0.55);background:#1a1c2a;display:none;z-index:2;";
    pip.appendChild(lv);

    // ── waiting overlay ───────────────────────────────────────────────────────
    const wait = document.createElement("div");
    wait.id = "justus-pip-wait";
    wait.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:#0d0f1a;z-index:1;pointer-events:none;";
    wait.innerHTML = `
      <div style="width:10px;height:10px;border-radius:50%;background:#6366f1;"></div>
      <span id="justus-pip-status" style="color:#94a3b8;font-size:11px;font-weight:600;text-align:center;padding:0 12px;">Connecting…</span>
    `;
    pip.appendChild(wait);

    // ── controls overlay (tap to reveal) ──────────────────────────────────────
    const ctrl = document.createElement("div");
    ctrl.id = "justus-pip-ctrl";
    ctrl.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:6px;z-index:3;opacity:0;pointer-events:none;transition:opacity 0.2s;background:linear-gradient(to bottom,rgba(0,0,0,0.65) 0%,transparent 40%,transparent 55%,rgba(0,0,0,0.85) 100%);";
    ctrl.innerHTML = `
      <button id="justus-btn-close" title="Close" style="align-self:flex-end;width:26px;height:26px;border-radius:13px;background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.3);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;touch-action:manipulation;padding:0;">${PIP_ICONS.close}</button>
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;padding:4px 8px;background:rgba(8,10,20,0.92);border:1px solid rgba(255,255,255,0.15);border-radius:20px;">
        <button id="justus-btn-mic" title="Mic" style="${PIP_BTN} opacity:0.35;">${PIP_ICONS.micOff}</button>
        <button id="justus-btn-cam" title="Camera" style="${PIP_BTN}">${PIP_ICONS.cam}</button>
        <button id="justus-btn-flip" title="Flip" style="${PIP_BTN}">${PIP_ICONS.flip}</button>
        <button id="justus-btn-end" title="End call" style="${PIP_BTN} background:#7f1d1d;border-color:rgba(239,68,68,0.4);">${PIP_ICONS.end}</button>
      </div>
    `;
    pip.appendChild(ctrl);

    document.body.appendChild(pip);

    pipContainer   = pip;
    pipRemoteVideo = rv;
    pipLocalVideo  = lv;
    pipWaitOverlay = wait;
    pipCtrlOverlay = ctrl;
    pipStatusText  = wait.querySelector("#justus-pip-status");

    setupPipInteractions(pip, ctrl);
    updatePipCtrlButtons();
  }

  // ── PIP drag + tap-to-reveal controls ─────────────────────────────────────
  function setupPipInteractions(pip, ctrl) {
    let dragStartX = 0, dragStartY = 0;
    let pipStartX = 0, pipStartY = 0;
    let dragging = false, moved = false;
    const DRAG_THRESHOLD = 8;

    function getPoint(e) {
      return e.touches ? e.touches[0] : e;
    }

    function onStart(e) {
      if (e.target.closest("button")) return;
      const pt = getPoint(e);
      dragStartX = pt.clientX;
      dragStartY = pt.clientY;
      const r = pip.getBoundingClientRect();
      pipStartX = r.left;
      pipStartY = r.top;
      dragging = true;
      moved = false;
      try { e.preventDefault(); } catch {}
    }

    function onMove(e) {
      if (!dragging) return;
      const pt = getPoint(e);
      const dx = pt.clientX - dragStartX;
      const dy = pt.clientY - dragStartY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) moved = true;
      if (moved) {
        const W = pip.offsetWidth, H = pip.offsetHeight;
        const newX = Math.max(4, Math.min(window.innerWidth - W - 4, pipStartX + dx));
        const newY = Math.max(4, Math.min(window.innerHeight - H - 4, pipStartY + dy));
        pip.style.right  = "auto";
        pip.style.bottom = "auto";
        pip.style.left   = newX + "px";
        pip.style.top    = newY + "px";
        try { e.preventDefault(); } catch {}
      }
    }

    function onEnd(e) {
      if (!dragging) return;
      dragging = false;
      if (!moved) togglePipControls();
      try { e.preventDefault(); } catch {}
    }

    // Touch (iOS primary path)
    pip.addEventListener("touchstart", onStart, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: false });

    // Pointer (desktop fallback)
    pip.addEventListener("pointerdown", onStart);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);

    // Controls: prevent touch from bubbling to drag handler
    ctrl.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });

    // Buttons
    function pipBtn(id, fn) {
      const btn = pip.querySelector("#" + id);
      if (!btn) return;
      btn.addEventListener("touchstart", (e) => { e.stopPropagation(); e.preventDefault(); fn(); schedulePipControlsHide(); }, { passive: false });
      btn.addEventListener("click", (e) => { e.stopPropagation(); fn(); schedulePipControlsHide(); });
    }

    pipBtn("justus-btn-close", () => { pipContainer.style.display = "none"; });
    pipBtn("justus-btn-end",   () => { leaveLiveKitCall(); });
    pipBtn("justus-btn-mic",   () => { toggleMic(); });
    pipBtn("justus-btn-cam",   () => { toggleCam(); });
    pipBtn("justus-btn-flip",  () => { flipCamera(); });
  }

  function togglePipControls() {
    if (!pipCtrlOverlay) return;
    const visible = pipCtrlOverlay.style.opacity === "1";
    pipCtrlOverlay.style.opacity = visible ? "0" : "1";
    pipCtrlOverlay.style.pointerEvents = visible ? "none" : "auto";
    if (!visible) schedulePipControlsHide();
  }

  function schedulePipControlsHide() {
    clearTimeout(ctrlHideTimer);
    ctrlHideTimer = setTimeout(() => {
      if (pipCtrlOverlay) { pipCtrlOverlay.style.opacity = "0"; pipCtrlOverlay.style.pointerEvents = "none"; }
    }, 4000);
  }

  function restoreLocalVideoPreview() {
    if (!pipLocalVideo || !localCameraStream || !isCamEnabled) return;
    const vt = localCameraStream.getVideoTracks()[0];
    if (!vt || vt.readyState !== "live") return;

    const existing =
      pipLocalVideo.srcObject instanceof MediaStream
        ? pipLocalVideo.srcObject.getVideoTracks()[0]
        : null;

    if (existing !== vt) {
      setVideoSrc(pipLocalVideo, new MediaStream([vt]));
    } else if (pipLocalVideo.paused) {
      pipLocalVideo.play().catch(() => {});
    }
    pipLocalVideo.style.display = "block";
  }

  function updatePipCtrlButtons() {
    const micBtn = pipContainer?.querySelector("#justus-btn-mic");
    const camBtn = pipContainer?.querySelector("#justus-btn-cam");
    if (micBtn) {
      micBtn.style.opacity = isMicEnabled ? "1" : "0.35";
      micBtn.innerHTML = isMicEnabled ? PIP_ICONS.mic : PIP_ICONS.micOff;
    }
    if (camBtn) {
      camBtn.style.opacity = isCamEnabled ? "1" : "0.35";
      camBtn.innerHTML = isCamEnabled ? PIP_ICONS.cam : PIP_ICONS.camOff;
    }
  }

  function notifyNativePrepareCallAudio() {
    try {
      if (window.webkit?.messageHandlers?.prepareCallAudio) {
        window.webkit.messageHandlers.prepareCallAudio.postMessage({});
      }
      if (window.AndroidPrepareCallAudio?.prepareCallAudio) {
        window.AndroidPrepareCallAudio.prepareCallAudio();
      }
    } catch {}
  }

  // iOS: capture mic+camera ONCE at join. Mic toggle only unmutes — never re-acquires.
  async function startLocalCaptureIOS() {
    if (!navigator.mediaDevices?.getUserMedia || livekitRoom?.state !== "connected") return;
    const LK = window.LivekitClient;
    if (!LK) return;

    try {
      notifyNativePrepareCallAudio();

      if (lkLocalVideoTrack) {
        try { await livekitRoom.localParticipant.unpublishTrack(lkLocalVideoTrack); } catch {}
        lkLocalVideoTrack = null;
      }
      if (lkLocalAudioTrack) {
        try { await livekitRoom.localParticipant.unpublishTrack(lkLocalAudioTrack); } catch {}
        try { lkLocalAudioTrack.stop(); } catch {}
        lkLocalAudioTrack = null;
      }
      iosHeldAudioTrack = null;

      if (localCameraStream) {
        localCameraStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        localCameraStream = null;
      }
      if (pipLocalVideo) pipLocalVideo.srcObject = null;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 480 },
          height: { ideal: 360 },
          frameRate: { ideal: 24 },
        },
      });

      localCameraStream = stream;
      captureUsesCombinedAv = true;

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (audioTrack) {
        audioTrack.enabled = false;
        iosHeldAudioTrack = audioTrack;
      }

      if (pipLocalVideo && videoTrack && isCamEnabled) {
        setVideoSrc(pipLocalVideo, new MediaStream([videoTrack]));
        pipLocalVideo.style.display = "block";
      }

      if (videoTrack && isCamEnabled) await publishCameraTrack(videoTrack);
    } catch (err) {
      console.warn("[JustUS] iOS AV capture:", err);
      captureUsesCombinedAv = false;
      iosHeldAudioTrack = null;
      addEventLog("⚠️ Camera — " + (err.message || err.name), "System");
    }
  }

  async function enableMicFromHeldTrack() {
    if (!livekitRoom || livekitRoom.state !== "connected") return;
    const LK = window.LivekitClient;
    if (!LK) return;

    const audioTrack = iosHeldAudioTrack || localCameraStream?.getAudioTracks()[0];
    if (!audioTrack) {
      isMicEnabled = false;
      updatePipCtrlButtons();
      addEventLog("⚠️ Mic unavailable — rejoin the call", "System");
      return;
    }

    notifyNativePrepareCallAudio();
    audioTrack.enabled = true;

    try {
      if (!lkLocalAudioTrack) {
        lkLocalAudioTrack = new LK.LocalAudioTrack(audioTrack, undefined, false);
        await livekitRoom.localParticipant.publishTrack(lkLocalAudioTrack);
      } else {
        lkLocalAudioTrack.mediaStreamTrack.enabled = true;
      }
    } catch (err) {
      console.warn("[JustUS] Mic publish:", err);
      isMicEnabled = false;
      audioTrack.enabled = false;
      updatePipCtrlButtons();
      return;
    }

    // Publishing audio can stall the camera preview on iOS — refresh without re-acquiring.
    restoreLocalVideoPreview();
    setTimeout(() => restoreLocalVideoPreview(), 200);
    setTimeout(() => restoreLocalVideoPreview(), 600);
  }

  async function restartLocalCameraAfterMic() {
    await new Promise((r) => setTimeout(r, 250));
    const vt = localCameraStream?.getVideoTracks()[0];
    if (vt && vt.readyState === "live") {
      restoreLocalVideoPreview();
      return;
    }
    await startLocalCamera(true);
  }

  async function startLocalMic() {
    if (!navigator.mediaDevices?.getUserMedia || livekitRoom?.state !== "connected") return;

    if (IS_IOS && captureUsesCombinedAv) {
      await enableMicFromHeldTrack();
      return;
    }

    if (captureUsesCombinedAv && lkLocalAudioTrack?.mediaStreamTrack) {
      lkLocalAudioTrack.mediaStreamTrack.enabled = true;
      return;
    }

    const LK = window.LivekitClient;
    if (!LK) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const rawTrack = stream.getAudioTracks()[0];
      if (!rawTrack) return;

      if (lkLocalAudioTrack) {
        try { await livekitRoom.localParticipant.unpublishTrack(lkLocalAudioTrack); } catch {}
        try { lkLocalAudioTrack.stop(); } catch {}
        lkLocalAudioTrack = null;
      }

      lkLocalAudioTrack = new LK.LocalAudioTrack(rawTrack, undefined, false);
      await livekitRoom.localParticipant.publishTrack(lkLocalAudioTrack);
      lkLocalAudioTrack.mediaStreamTrack.enabled = true;

      await restartLocalCameraAfterMic();
    } catch (err) {
      console.warn("[JustUS] Mic:", err);
      isMicEnabled = false;
      updatePipCtrlButtons();
      addEventLog("⚠️ Mic unavailable — check permissions", "System");
    }
  }

  // Mirrors LiveKit's own Safari workaround in Track.ts:
  //   - No `autoplay` attribute (iOS low-power mode shows pause overlay)
  //   - srcObject assigned twice with setTimeout(0) to force WebKit repaint
  //   - play() called exactly once, inside the timeout
  function setVideoSrc(videoEl, stream) {
    if (!videoEl || !stream) return;
    videoEl.srcObject = stream;
    setTimeout(() => {
      videoEl.srcObject = stream;
      videoEl.play().catch((err) => {
        // AbortError = a second play() raced us; ignore.
        if (err?.name !== "AbortError") console.warn("[JustUS] play():", err);
      });
    }, 0);
  }

  // ── local camera via getUserMedia (bypasses LiveKit camera management) ─────
  async function startLocalCamera(force = false) {
    if (!navigator.mediaDevices?.getUserMedia) {
      addEventLog("⚠️ getUserMedia not available", "System");
      return;
    }
    try {
      if (!force && localCameraStream) {
        const tracks = localCameraStream.getVideoTracks();
        if (tracks.length && tracks[0].readyState === "live") {
          tracks[0].enabled = isCamEnabled;
          if (isCamEnabled && pipLocalVideo) {
            setVideoSrc(pipLocalVideo, new MediaStream([tracks[0]]));
            pipLocalVideo.style.display = "block";
          }
          return;
        }
      }

      if (localCameraStream) {
        localCameraStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        localCameraStream = null;
      }
      if (lkLocalVideoTrack && livekitRoom?.state === "connected") {
        try { await livekitRoom.localParticipant.unpublishTrack(lkLocalVideoTrack); } catch {}
        lkLocalVideoTrack = null;
      }

      localCameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode  : { ideal: currentFacingMode },
          width       : { ideal: 480 },
          height      : { ideal: 360 },
          frameRate   : { ideal: 24 },
        },
        audio: false,
      });
      captureUsesCombinedAv = false;

      if (pipLocalVideo) {
        const vt = localCameraStream.getVideoTracks()[0];
        if (vt) {
          setVideoSrc(pipLocalVideo, new MediaStream([vt]));
        }
        pipLocalVideo.style.display = isCamEnabled ? "block" : "none";
      }

      // Publish the raw track to LiveKit so the remote sees it
      if (livekitRoom?.state === "connected") {
        await publishCameraTrack(localCameraStream.getVideoTracks()[0]);
      }
    } catch (err) {
      console.warn("[JustUS] Camera:", err);
      addEventLog("⚠️ Camera — " + (err.message || err.name), "System");
    }
  }

  async function publishCameraTrack(rawTrack) {
    if (!rawTrack || !livekitRoom) return;
    const LK = window.LivekitClient;
    try {
      // Unpublish any existing camera track first
      if (lkLocalVideoTrack) {
        try { await livekitRoom.localParticipant.unpublishTrack(lkLocalVideoTrack); } catch {}
        lkLocalVideoTrack = null;
      }
      lkLocalVideoTrack = new LK.LocalVideoTrack(rawTrack, undefined, false);
      await livekitRoom.localParticipant.publishTrack(lkLocalVideoTrack, {
        videoCodec: "vp8",
        simulcast : false,
      });
    } catch (err) {
      console.warn("[JustUS] publishCamera:", err);
    }
  }

  // ── token fetch ────────────────────────────────────────────────────────────
  async function fetchLkToken(roomName, identity) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${API_BASE}/api/livekit/token`, {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({ roomName, identity, name: currentUserName, isHost: !!isHost }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d.token) return { token: d.token, wsUrl: d.wsUrl || "" };
        }
      } catch {}
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 800));
    }
    return null;
  }

  // ── connect ────────────────────────────────────────────────────────────────
  async function connectLiveKitCall() {
    if (!activeRoomId || isLkConnecting) return;
    if (livekitRoom?.state === "connected") return;

    isLkConnecting = true;
    userHungUp = false;
    buildPip();

    if (pipStatusText) pipStatusText.textContent = "Connecting…";

    loadLiveKitSDK(async () => {
      try {
        const LK = window.LivekitClient;
        const td = await fetchLkToken(activeRoomId, getLkIdentity());
        if (!td) throw new Error("Could not get video call token");

        const room = new LK.Room({
          adaptiveStream : false,
          dynacast       : false,
          publishDefaults: { simulcast: false, videoCodec: "vp8" },
        });
        livekitRoom = room;

        // Remote video ── use srcObject, not track.attach() on our element
        room.on(LK.RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === LK.Track.Kind.Video && pipRemoteVideo) {
            setVideoSrc(pipRemoteVideo, new MediaStream([track.mediaStreamTrack]));
            if (pipWaitOverlay) pipWaitOverlay.style.display = "none";
          }
          if (track.kind === LK.Track.Kind.Audio) {
            if (remoteAudioEl) { try { remoteAudioEl.remove(); } catch {} }
            remoteAudioEl = track.attach(); // creates an <audio> element
            remoteAudioEl.volume = 1.0;
            document.body.appendChild(remoteAudioEl); // MUST be in body, not Shadow DOM
          }
        });

        room.on(LK.RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind === LK.Track.Kind.Video) {
            if (pipRemoteVideo) pipRemoteVideo.srcObject = null;
            if (pipWaitOverlay) pipWaitOverlay.style.display = "flex";
          }
          try { track.detach(); } catch {}
        });

        room.on(LK.RoomEvent.ParticipantDisconnected, () => {
          if (pipRemoteVideo) pipRemoteVideo.srcObject = null;
          if (pipWaitOverlay) { pipWaitOverlay.style.display = "flex"; }
          if (pipStatusText) pipStatusText.textContent = "Friend left call";
        });

        // iOS: WebKit pauses videos when app backgrounds; resume them
        room.on(LK.RoomEvent.VideoPlaybackStatusChanged, () => {
          if (!room.canPlaybackVideo) room.startVideo().catch(() => {});
        });

        room.on(LK.RoomEvent.Disconnected, onLkDisconnected);

        await room.connect(td.wsUrl, td.token);
        isVideoCallActive = true;
        updateVideoPillState();

        // iOS: one combined capture at join; mic is unmuted later without re-acquiring.
        if (isCamEnabled) {
          if (IS_IOS) await startLocalCaptureIOS();
          else await startLocalCamera();
        }

        // Pick up tracks already in room
        room.remoteParticipants.forEach((p) => {
          p.videoTrackPublications.forEach((pub) => {
            if (pub.track && pub.isSubscribed && pipRemoteVideo) {
              setVideoSrc(pipRemoteVideo, new MediaStream([pub.track.mediaStreamTrack]));
              if (pipWaitOverlay) pipWaitOverlay.style.display = "none";
            }
          });
        });

        if (pipStatusText) pipStatusText.textContent = "Waiting for friend…";
      } catch (err) {
        console.error("[JustUS] LiveKit:", err);
        if (pipStatusText) pipStatusText.textContent = "Error: " + (err.message || "failed");
      } finally {
        isLkConnecting = false;
      }
    });
  }

  // ── disconnect ─────────────────────────────────────────────────────────────
  function onLkDisconnected() {
    livekitRoom = null;
    isVideoCallActive = false;
    isLkConnecting = false;
    if (remoteAudioEl) { try { remoteAudioEl.remove(); } catch {} remoteAudioEl = null; }
    updateVideoPillState();
    if (!userHungUp && activeRoomId) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        if (!userHungUp && activeRoomId && !livekitRoom) connectLiveKitCall();
      }, 2500);
    }
  }

  // ── hang up ────────────────────────────────────────────────────────────────
  function leaveLiveKitCall() {
    userHungUp = true;
    autoCallScheduled = false;
    clearTimeout(reconnectTimer);
    clearLkIdentity();
    captureUsesCombinedAv = false;
    iosHeldAudioTrack = null;

    // Stop camera hardware (safe to stop on hangup — not toggling)
    if (localCameraStream) {
      localCameraStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      localCameraStream = null;
    }
    lkLocalVideoTrack = null;

    if (lkLocalAudioTrack) {
      try { lkLocalAudioTrack.stop(); } catch {}
      lkLocalAudioTrack = null;
    }
    if (remoteAudioEl) { try { remoteAudioEl.remove(); } catch {} remoteAudioEl = null; }

    if (pipRemoteVideo) pipRemoteVideo.srcObject = null;
    if (pipLocalVideo)  { pipLocalVideo.srcObject = null; pipLocalVideo.style.display = "none"; }
    if (pipWaitOverlay) { pipWaitOverlay.style.display = "flex"; }
    if (pipStatusText)  { pipStatusText.textContent = "Call ended"; }
    if (pipContainer)   { pipContainer.style.display = "none"; }

    if (livekitRoom) { try { livekitRoom.disconnect(true); } catch {} livekitRoom = null; }

    isVideoCallActive = false;
    updateVideoPillState();
  }

  // ── mic toggle ─────────────────────────────────────────────────────────────
  async function toggleMic() {
    if (!livekitRoom || livekitRoom.state !== "connected") return;

    isMicEnabled = !isMicEnabled;
    updatePipCtrlButtons();

    if (isMicEnabled) {
      await startLocalMic();
    } else {
      if (iosHeldAudioTrack) iosHeldAudioTrack.enabled = false;
      if (lkLocalAudioTrack?.mediaStreamTrack) {
        lkLocalAudioTrack.mediaStreamTrack.enabled = false;
      }
      restoreLocalVideoPreview();
    }
  }

  // ── camera toggle ──────────────────────────────────────────────────────────
  async function toggleCam() {
    isCamEnabled = !isCamEnabled;
    updatePipCtrlButtons();

    if (localCameraStream) {
      localCameraStream.getVideoTracks().forEach((t) => { t.enabled = isCamEnabled; });
    }
    if (lkLocalVideoTrack?.mediaStreamTrack) {
      lkLocalVideoTrack.mediaStreamTrack.enabled = isCamEnabled;
    }

    if (pipLocalVideo) pipLocalVideo.style.display = isCamEnabled ? "block" : "none";
  }

  // ── flip camera ────────────────────────────────────────────────────────────
  async function flipCamera() {
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
    if (IS_IOS) {
      const micWasOn = isMicEnabled;
      isMicEnabled = false;
      await startLocalCaptureIOS();
      if (micWasOn) {
        isMicEnabled = true;
        updatePipCtrlButtons();
        await enableMicFromHeldTrack();
      }
      return;
    }
    if (localCameraStream) {
      localCameraStream.getVideoTracks().forEach((t) => { try { t.stop(); } catch {} });
      localCameraStream = null;
    }
    if (pipLocalVideo) { pipLocalVideo.srcObject = null; pipLocalVideo.style.display = "none"; }
    await startLocalCamera();
  }

  // ── show / hide PIP ────────────────────────────────────────────────────────
  function toggleVideoCallWindow() {
    if (!activeRoomId) {
      addEventLog("⚠️ Join or create a watch party first", "System");
      toggleDrawer();
      return;
    }
    buildPip();
    const pip = pipContainer;
    if (!pip) return;

    if (pip.style.display === "none" || !pip.style.display) {
      pip.style.display = "block";
      if (!livekitRoom && !isLkConnecting) connectLiveKitCall();
    } else {
      pip.style.display = "none";
    }
  }

  // ── pill / drawer state ────────────────────────────────────────────────────
  function updateVideoPillState() {
    const dot  = shadow.getElementById("ju-video-dot");
    const text = shadow.getElementById("ju-video-pill-text");
    const pill = shadow.getElementById("ju-video-pill");
    if (!pill) return;

    if (!activeRoomId) { pill.classList.add("hidden"); return; }
    pill.classList.remove("hidden");

    if (isVideoCallActive) {
      if (dot) dot.className = "status-dot active";
      pill.classList.add("active");
      if (text) text.textContent = "📹 In Call";
    } else {
      if (dot) dot.className = "status-dot idle";
      pill.classList.remove("active");
      if (text) text.textContent = "📹 Video Call";
    }

    const drawerBtn = shadow.getElementById("ju-drawer-video-btn");
    if (drawerBtn) {
      drawerBtn.className = `action-btn ${isVideoCallActive ? "emerald" : "indigo"}`;
      drawerBtn.textContent = isVideoCallActive ? "📹 Open Video PIP" : "📹 Start / Join Video Call";
    }
  }

  // Video call is user-initiated only — no auto-connect on party join.
  function scheduleAutoVideoCall() {}
  // ─────────────────────────────────────────────────────────────────
  function addEventLog(text, sender = "System", type = "event") {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const entry = { text, sender, time, type };
    eventLogs.push(entry);
    appendFeedItem(entry); // Incremental append — avoids O(n^2) full-feed rebuild per message.
  }

  // Escape peer-supplied strings before they touch innerHTML (prevents chat XSS).
  function escapeOverlayHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function feedItemNode(e) {
    const item = document.createElement("div");
    item.className = "feed-item" + (e.type === "chat" ? " chat" : "");
    item.innerHTML = `
        <div class="feed-header">
          <span class="feed-sender">${escapeOverlayHtml(e.sender)}</span>
          <span>${escapeOverlayHtml(e.time)}</span>
        </div>
        <div>${escapeOverlayHtml(e.text)}</div>
      `;
    return item;
  }

  function appendFeedItem(e) {
    const feedEl = shadow.getElementById("ju-event-feed");
    if (!feedEl) return;
    feedEl.appendChild(feedItemNode(e));
    feedEl.scrollTop = feedEl.scrollHeight;
  }

  function renderFeed() {
    const feedEl = shadow.getElementById("ju-event-feed");
    if (!feedEl) return;
    feedEl.textContent = "";
    const frag = document.createDocumentFragment();
    for (const e of eventLogs) frag.appendChild(feedItemNode(e));
    feedEl.appendChild(frag);
    feedEl.scrollTop = feedEl.scrollHeight;
  }

  // ─────────────────────────────────────────────────────────────────
  // DRAWER RENDERING
  // ─────────────────────────────────────────────────────────────────
  let currentTab = "host"; // 'host' | 'join'

  function renderDrawerContent() {
    if (!activeRoomId) {
      // Idle Screen (Host / Join)
      drawer.innerHTML = `
        <div class="drawer-header">
          <div class="brand-title">
            <img src="${API_BASE}/logo.png" style="width: 22px; height: 22px; border-radius: 6px; object-fit: cover;" />
            <span>JustUS Watch Party</span>
          </div>
          <button class="close-btn" id="ju-close-drawer">✕</button>
        </div>

        <div class="tabs-bar">
          <button class="tab-btn ${currentTab === "host" ? "active" : ""}" id="ju-tab-host">🎉 Host Party</button>
          <button class="tab-btn ${currentTab === "join" ? "active" : ""}" id="ju-tab-join">🍿 Join Party</button>
        </div>

        <div class="drawer-body">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 10px; font-weight: 700; color: #94A3B8;">YOUR NAME</label>
            <input type="text" id="ju-username-input" class="input-field" value="${currentUserName}" placeholder="Enter your name" />
          </div>

          ${
            currentTab === "host"
              ? `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 12px; font-size: 11px; color: #CBD5E1;">
              <strong>Host Mode:</strong> Start a party for the currently playing video. A shareable invite link will be generated for your friends on iPad, iPhone, and Desktop.
            </div>
            <button class="action-btn" id="ju-create-party-btn">🎉 Create Watch Party</button>
          `
              : `
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 10px; font-weight: 700; color: #94A3B8;">ROOM CODE / INVITE URL</label>
              <input type="text" id="ju-room-code-input" class="input-field" placeholder="e.g. ju_abc123 or paste link" />
            </div>
            <button class="action-btn indigo" id="ju-join-party-btn">🍿 Join Watch Party</button>
          `
          }
        </div>
      `;

      shadow.getElementById("ju-close-drawer")?.addEventListener("click", (e) => closeDrawer(e));
      shadow.getElementById("ju-tab-host")?.addEventListener("click", () => {
        currentTab = "host";
        renderDrawerContent();
      });
      shadow.getElementById("ju-tab-join")?.addEventListener("click", () => {
        currentTab = "join";
        renderDrawerContent();
      });

      const nameInput = shadow.getElementById("ju-username-input");
      if (nameInput) {
        nameInput.addEventListener("change", (e) => {
          currentUserName = e.target.value.trim() || currentUserName;
          localStorage.setItem("justus_username", currentUserName);
        });
      }

      shadow.getElementById("ju-create-party-btn")?.addEventListener("click", () => {
        const u = shadow.getElementById("ju-username-input")?.value.trim();
        if (u) {
          currentUserName = u;
          localStorage.setItem("justus_username", u);
        }
        createParty();
      });

      shadow.getElementById("ju-join-party-btn")?.addEventListener("click", () => {
        const codeInput = shadow.getElementById("ju-room-code-input")?.value.trim();
        const u = shadow.getElementById("ju-username-input")?.value.trim();
        if (u) {
          currentUserName = u;
          localStorage.setItem("justus_username", u);
        }
        if (codeInput) {
          joinParty(codeInput);
        }
      });
    } else {
      // Active Party Screen (Event feed, Presence, Chat, Sync, Video Call)
      const inviteUrl = `${API_BASE}/join/${activeRoomId}`;
      drawer.innerHTML = `
        <div class="drawer-header">
          <div class="brand-title">
            <img src="${API_BASE}/logo.png" style="width: 20px; height: 20px; border-radius: 6px; object-fit: cover;" />
            <span class="status-dot"></span>
            <span>Party Active</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="action-header-btn" id="ju-leave-party" title="Leave Party">Leave</button>
            <button class="close-btn" id="ju-minimize-drawer" title="Minimize / Hide Sidebar">✕</button>
          </div>
        </div>

        <div class="drawer-body">
          <div class="party-active-card">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
              <span style="color: #94A3B8;">Room Code:</span>
              <strong style="color: #fff; letter-spacing: 0.5px;">${activeRoomId}</strong>
            </div>
            <div class="room-badge">
              <span style="color: #94A3B8; truncate; max-width: 170px;">${inviteUrl}</span>
              <button class="copy-btn" id="ju-copy-invite">📋 Copy</button>
            </div>
          </div>

          <!-- Video Call Section Inside Sidebar -->
          <div class="party-active-card" style="background: ${isVideoCallActive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(99, 102, 241, 0.08)'}; border-color: ${isVideoCallActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="status-dot ${isVideoCallActive ? 'active' : 'idle'}"></span>
                <span style="font-size: 11px; font-weight: 700; color: #F1F5F9;">FaceTime / Video Call</span>
              </div>
              <span style="font-size: 10px; font-weight: 600; color: ${isVideoCallActive ? '#10B981' : '#A5B4FC'};">
                ${isVideoCallActive ? "🟢 Active" : "Ready"}
              </span>
            </div>
            <button class="action-btn ${isVideoCallActive ? 'emerald' : 'indigo'}" id="ju-drawer-video-btn" style="padding: 10px; font-size: 12px; margin-top: 4px;">
              ${isVideoCallActive ? "📹 Open Video PIP Window" : "📹 Start / Join Video Call"}
            </button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; color: #94A3B8; padding: 0 2px;">
            <span>LIVE EVENT FEED</span>
            <span id="ju-participant-count" style="color: #10B981;">🟢 1 Online</span>
          </div>

          <div class="event-feed" id="ju-event-feed"></div>

          <div class="reactions-bar">
            <button class="reaction-btn" data-emoji="❤️">❤️</button>
            <button class="reaction-btn" data-emoji="😂">😂</button>
            <button class="reaction-btn" data-emoji="🍿">🍿</button>
            <button class="reaction-btn" data-emoji="🔥">🔥</button>
            <button class="reaction-btn" data-emoji="😮">😮</button>
            <button class="reaction-btn" data-emoji="👏">👏</button>
          </div>

          <form id="ju-chat-form" class="chat-input-bar">
            <input type="text" id="ju-chat-input" class="input-field" placeholder="Send a message to room..." />
            <button type="submit" class="action-btn indigo" style="width: auto; padding: 0 14px;">➔</button>
          </form>
        </div>
      `;

      shadow.getElementById("ju-minimize-drawer")?.addEventListener("click", (e) => closeDrawer(e));
      shadow.getElementById("ju-leave-party")?.addEventListener("click", leaveParty);
      shadow.getElementById("ju-drawer-video-btn")?.addEventListener("click", () => {
        toggleVideoCallWindow();
      });
      shadow.getElementById("ju-copy-invite")?.addEventListener("click", () => {
        navigator.clipboard.writeText(inviteUrl);
        const btn = shadow.getElementById("ju-copy-invite");
        if (btn) {
          btn.textContent = "✓ Copied";
          setTimeout(() => (btn.textContent = "📋 Copy"), 2000);
        }
      });

      // Quick Reactions
      shadow.querySelectorAll(".reaction-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const emoji = btn.getAttribute("data-emoji");
          if (emoji && activeChannel) {
            sendChat(emoji);
          }
        });
      });

      // Chat Form
      shadow.getElementById("ju-chat-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = shadow.getElementById("ju-chat-input");
        if (input && input.value.trim()) {
          sendChat(input.value.trim());
          input.value = "";
        }
      });

      renderFeed();
    }
  }

  function updatePillState() {
    const dot = shadow.getElementById("ju-status-dot");
    const text = shadow.getElementById("ju-pill-text");
    const vPill = shadow.getElementById("ju-video-pill");
    if (!dot || !text) return;
    if (activeRoomId) {
      dot.className = "status-dot";
      text.textContent = `👥 Party: ${activeRoomId}`;
      if (vPill) vPill.classList.remove("hidden");
    } else {
      dot.className = "status-dot idle";
      text.textContent = "🎉 Watch Party";
      if (vPill) vPill.classList.add("hidden");
    }
    updateVideoPillState();
  }

  // ─────────────────────────────────────────────────────────────────
  // PARTY LIFECYCLE & SYNC LOGIC
  // ─────────────────────────────────────────────────────────────────
  function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function createParty() {
    const newRoomId = generateRoomCode();
    isHost = true;
    activeRoomId = newRoomId;
    isInitialSyncCompleted = true;
    savePartyState();

    loadSupabase(() => {
      const nowIso = new Date().toISOString();
      const roomPayload = {
        id: newRoomId,
        host_id: currentUserName,
        service: window.location.hostname.includes("prime")
          ? "prime"
          : window.location.hostname.includes("youtube") || window.location.hostname.includes("youtu.be")
          ? "youtube"
          : "netflix",
        video_url: window.location.href,
        title: document.title || "JustUS Watch Party",
        playback_time: 0,
        is_playing: false,
        created_at: nowIso,
        updated_at: nowIso,
      };

      // 1. Direct Supabase insert
      if (supabaseClient) {
        supabaseClient
          .from("rooms")
          .upsert(roomPayload, { onConflict: "id" })
          .then(({ error }) => {
            if (error) {
              console.warn("[JustUS] Direct room create warning:", error.message);
              supabaseClient.from("rooms").insert(roomPayload).catch(() => {});
            } else {
              console.log("[JustUS] Room created in Supabase:", newRoomId);
            }
          })
          .catch(() => {});
      }

      // 2. Post to Vercel Room API
      fetch(`${API_BASE}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customId: newRoomId,
          service: roomPayload.service,
          videoUrl: roomPayload.video_url,
          title: roomPayload.title,
          hostId: currentUserName,
        }),
      }).catch(() => {});

      // 3. Connect Realtime Sync
      connectRealtimeChannel(newRoomId, true);
      addEventLog(`🎉 ${currentUserName} created watch party [${newRoomId}]!`, currentUserName);
      updatePillState();
      renderDrawerContent();
    });
  }

  function joinParty(codeOrUrl) {
    let cleanCode = codeOrUrl.trim().toUpperCase();
    if (cleanCode.includes("/JOIN/")) {
      cleanCode = cleanCode.split("/JOIN/")[1].split("?")[0].split("/")[0];
    } else if (cleanCode.includes("/PARTY/")) {
      cleanCode = cleanCode.split("/PARTY/")[1].split("?")[0].split("/")[0];
    } else if (cleanCode.includes("JUSTUS=")) {
      cleanCode = cleanCode.split("JUSTUS=")[1].split("&")[0];
    }
    isHost = false;
    activeRoomId = cleanCode;
    isInitialSyncCompleted = false;
    savePartyState();

    loadSupabase(() => {
      connectRealtimeChannel(cleanCode, false);
      addEventLog(`🍿 You joined party [${cleanCode}]`, currentUserName);
      updatePillState();
      renderDrawerContent();
    });
  }

  function isSameVideoUrl(url1, url2) {
    if (!url1 || !url2) return false;
    try {
      const u1 = new URL(url1, window.location.origin);
      const u2 = new URL(url2, window.location.origin);
      const v1 = u1.searchParams.get("v");
      const v2 = u2.searchParams.get("v");
      if (v1 && v2) return v1 === v2;
      return u1.pathname === u2.pathname && u1.search === u2.search;
    } catch (e) {
      return url1.split("#")[0] === url2.split("#")[0];
    }
  }

  function normalizeStreamingUrl(rawUrl) {
    if (!rawUrl) return rawUrl;
    try {
      const u = new URL(rawUrl, window.location.origin);
      if (window.location.hostname.includes("youtube") && u.hostname.includes("youtube")) {
        u.hostname = window.location.hostname;
      }
      return u.toString();
    } catch (e) {
      return rawUrl;
    }
  }

  function connectRealtimeChannel(roomId, asHost) {
    if (!supabaseClient) return;

    if (activeChannel) {
      supabaseClient.removeChannel(activeChannel);
      activeChannel = null;
    }

    activeChannel = supabaseClient.channel(`party:${roomId}`, {
      config: { broadcast: { self: false }, presence: { key: currentUserName } },
    });

    activeChannel
      .on("broadcast", { event: "PLAY" }, ({ payload }) => handleRemotePlay(payload))
      .on("broadcast", { event: "PAUSE" }, ({ payload }) => handleRemotePause(payload))
      .on("broadcast", { event: "SEEK" }, ({ payload }) => handleRemoteSeek(payload))
      .on("broadcast", { event: "SYNC_HEARTBEAT" }, ({ payload }) => handleRemoteHeartbeat(payload))
      .on("broadcast", { event: "REQUEST_STATE" }, ({ payload }) => handleRequestState(payload))
      .on("broadcast", { event: "STATE_RESPONSE" }, ({ payload }) => handleStateResponse(payload))
      .on("broadcast", { event: "HOST_LEFT" }, () => {
        addEventLog("👋 Host ended the watch party", "System");
        leaveParty(false);
      })
      .on("broadcast", { event: "USER_JOINED" }, ({ payload }) => {
        if (payload.userName && payload.userName !== currentUserName) {
          addEventLog(`🍿 ${payload.userName} joined the watch party`, payload.userName);
        }
      })
      .on("broadcast", { event: "CHAT" }, ({ payload }) => {
        addEventLog(payload.text, payload.sender, "chat");
      })
      .on("broadcast", { event: "VIDEO_CHANGED" }, ({ payload }) => {
        if (payload.videoUrl && !isHost) {
          const currentUrl = window.location.href;
          const targetUrl = normalizeStreamingUrl(payload.videoUrl);
          const isVideoPage = targetUrl.includes("/watch") || targetUrl.includes("/title/") || targetUrl.includes("/video/");
          if (!isSameVideoUrl(currentUrl, targetUrl) && isVideoPage) {
            addEventLog(`🎬 Host opened: ${payload.title || "Selected Video"}`, payload.sender);
            const sep = targetUrl.includes("#") ? "&" : "#";
            window.location.href = targetUrl + sep + "justus=" + activeRoomId;
          }
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state = activeChannel.presenceState();
        const count = Math.max(1, Object.keys(state).length);
        const countEl = shadow.getElementById("ju-participant-count");
        if (countEl) countEl.textContent = `🟢 ${count} Online`;
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          activeChannel.track({ userName: currentUserName, isHost: asHost, joinedAt: Date.now() });
          activeChannel.send({
            type: "broadcast",
            event: "USER_JOINED",
            payload: { userName: currentUserName, isHost: asHost, sentAt: Date.now() },
          });

          startHeartbeat();

          if (!asHost) {
            // Request initial state from peers
            activeChannel.send({
              type: "broadcast",
              event: "REQUEST_STATE",
              payload: { sender: currentUserName, sentAt: Date.now() },
            });
          }

          // Fetch past chat messages from Supabase directly & API fallback
          if (supabaseClient) {
            supabaseClient
              .from("chat_messages")
              .select("sender, message, created_at")
              .eq("room_id", roomId)
              .order("created_at", { ascending: true })
              .limit(100)
              .then(({ data, error }) => {
                if (data && !error && Array.isArray(data) && data.length > 0) {
                  data.forEach((m) => {
                    addEventLog(m.message, m.sender, "chat");
                  });
                } else {
                  fetch(`${API_BASE}/api/chat?roomId=${encodeURIComponent(roomId)}`)
                    .then((res) => res.json())
                    .then((data) => {
                      if (data && data.messages && Array.isArray(data.messages)) {
                        data.messages.forEach((msg) => {
                          addEventLog(msg.text, msg.sender, "chat");
                        });
                      }
                    })
                    .catch(() => {});
                }
              })
              .catch(() => {});
          } else {
            fetch(`${API_BASE}/api/chat?roomId=${encodeURIComponent(roomId)}`)
              .then((res) => res.json())
              .then((data) => {
                if (data && data.messages && Array.isArray(data.messages)) {
                  data.messages.forEach((msg) => {
                    addEventLog(msg.text, msg.sender, "chat");
                  });
                }
              })
              .catch(() => {});
          }
        }
      });

    attachLocalPlayerListeners();
  }

  function sendChat(text) {
    if (!activeChannel) return;
    const payload = { sender: currentUserName, text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    activeChannel.send({ type: "broadcast", event: "CHAT", payload });
    addEventLog(text, currentUserName, "chat");

    if (activeRoomId) {
      if (supabaseClient) {
        supabaseClient
          .from("chat_messages")
          .insert({
            room_id: activeRoomId,
            sender: currentUserName,
            message: text.trim(),
            created_at: new Date().toISOString(),
          })
          .then(() => {})
          .catch(() => {});
      }

      fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: activeRoomId,
          sender: currentUserName,
          text,
        }),
      }).catch(() => {});
    }
  }
// Mirrors extension/src/shared/sync-core.ts — keep in lock-step with that file.
const SYNC = {
  HEARTBEAT_INTERVAL_MS: 2000,
  USER_ACTION_GRACE_MS: 3500,
  SYNC_ACTION_COOLDOWN_MS: 400,
  RATE_DEADBAND_S: 0.15,
  RATE_FAST: 1.04,
  RATE_SLOW: 0.96,
  HARD_SEEK_WHILE_PLAYING_S: 1.2,
  HARD_SEEK_WHILE_PAUSED_S: 0.2,
  HEARTBEAT_MAX_LATENCY_S: 0.4,
  PLAY_MAX_LATENCY_S: 1.5,
  EVENT_SEEK_THRESHOLD_S: 0.35,
  MIN_MEANINGFUL_TIME_S: 0.5,
};

function clampLatencySeconds(sentAt, now, maxSeconds) {
  return Math.max(0, Math.min(maxSeconds, (now - sentAt) / 1000));
}

function expectedRemoteTime(payloadTime, isPlaying, latencySeconds) {
  return isPlaying ? payloadTime + latencySeconds : payloadTime;
}

function playTargetTime(payloadTime, sentAt, now) {
  const latency = Math.max(0, (now - sentAt) / 1000);
  return payloadTime + (latency > 0 && latency < SYNC.PLAY_MAX_LATENCY_S ? latency : 0);
}

function shouldSeek(currentTime, targetTime, threshold = SYNC.EVENT_SEEK_THRESHOLD_S) {
  return targetTime > 1.0 && Math.abs(currentTime - targetTime) > threshold;
}

  function computeHeartbeatCorrection(input) {
    const latency = clampLatencySeconds(input.sentAt, input.now, SYNC.HEARTBEAT_MAX_LATENCY_S);
    const expected = expectedRemoteTime(input.payloadTime, input.isPlaying, latency);
    const delta = expected - input.currentTime;
    const drift = Math.abs(delta);
    const correction = {};

    if (input.isPlaying) {
      correction.ensurePlaying = true;
      if (drift > SYNC.HARD_SEEK_WHILE_PLAYING_S && expected > SYNC.MIN_MEANINGFUL_TIME_S) {
        correction.seekTo = expected;
        correction.playbackRate = 1.0;
      } else if (delta > SYNC.RATE_DEADBAND_S) {
        correction.playbackRate = SYNC.RATE_FAST;
      } else if (delta < -SYNC.RATE_DEADBAND_S) {
        correction.playbackRate = SYNC.RATE_SLOW;
      } else {
        correction.playbackRate = 1.0;
      }
    } else {
      correction.playbackRate = 1.0;
      correction.ensurePaused = true;
      if (drift > SYNC.HARD_SEEK_WHILE_PAUSED_S && expected > SYNC.MIN_MEANINGFUL_TIME_S) {
        correction.seekTo = expected;
      }
    }
    return correction;
  }

  function computeHeartbeatPositionCorrection(input, localIsPlaying) {
    if (localIsPlaying !== input.isPlaying) return {};
    const full = computeHeartbeatCorrection(input);
    const correction = {};
    if (full.seekTo !== undefined) correction.seekTo = full.seekTo;
    if (full.playbackRate !== undefined) correction.playbackRate = full.playbackRate;
    return correction;
  }

  let lastUserActionTime = 0;

  function releaseSyncLock() {
    setTimeout(() => (isSyncActionInProgress = false), SYNC.SYNC_ACTION_COOLDOWN_MS);
  }

  function applySyncPlayerAction(fn) {
    isSyncActionInProgress = true;
    try {
      fn();
    } finally {
      releaseSyncLock();
    }
  }

  function handleRemotePlay(payload) {
    if (payload.sender === currentUserName) return;
    isInitialSyncCompleted = true;
    const sender = payload.sender || "Friend";
    const timeStr = formatTime(payload.time);
    addEventLog(`▶️ Played video at ${timeStr}`, sender);
    lastUserActionTime = Date.now();
    applySyncPlayerAction(() => {
      const current = getCurrentVideoTime();
      const now = Date.now();
      const target = playTargetTime(payload.time, payload.sentAt || now, now);
      if (shouldSeek(current, target)) {
        seekVideo(target);
      }
      playVideo();
    });
  }

  function handleRemotePause(payload) {
    if (payload.sender === currentUserName) return;
    isInitialSyncCompleted = true;
    const sender = payload.sender || "Friend";
    const timeStr = formatTime(payload.time);
    addEventLog(`⏸️ Paused video at ${timeStr}`, sender);
    lastUserActionTime = Date.now();
    applySyncPlayerAction(() => {
      pauseVideo();
      if (
        payload.time > SYNC.MIN_MEANINGFUL_TIME_S &&
        Math.abs(getCurrentVideoTime() - payload.time) > SYNC.HARD_SEEK_WHILE_PAUSED_S
      ) {
        seekVideo(payload.time);
      }
    });
  }

  function handleRemoteSeek(payload) {
    if (payload.sender === currentUserName) return;
    if (!payload || payload.time < SYNC.MIN_MEANINGFUL_TIME_S) return;
    isInitialSyncCompleted = true;
    const sender = payload.sender || "Friend";
    const timeStr = formatTime(payload.time);
    const current = getCurrentVideoTime();
    if (Math.abs(current - payload.time) < SYNC.EVENT_SEEK_THRESHOLD_S) return;

    addEventLog(`⏩ Jumped to ${timeStr}`, sender);
    lastUserActionTime = Date.now();
    applySyncPlayerAction(() => {
      seekVideo(payload.time);
    });
  }

  function handleRemoteHeartbeat(payload) {
    if (payload.sender === currentUserName) return;
    if (isSyncActionInProgress) return;

    if (Date.now() - lastUserActionTime < SYNC.USER_ACTION_GRACE_MS) return;

    if (payload.videoUrl && !isHost) {
      const currentUrl = window.location.href;
      const targetUrl = normalizeStreamingUrl(payload.videoUrl);
      const isVideoPage = targetUrl.includes("/watch") || targetUrl.includes("/title/") || targetUrl.includes("/video/");
      if (!isSameVideoUrl(currentUrl, targetUrl) && isVideoPage) {
        const sep = targetUrl.includes("#") ? "&" : "#";
        window.location.href = targetUrl + sep + "justus=" + activeRoomId;
        return;
      }
    }

    const now = Date.now();
    const localPlaying = isVideoPlaying();
    const remotePlaying = !!payload.isPlaying;

    if (!isInitialSyncCompleted) {
      isInitialSyncCompleted = true;
      applySyncPlayerAction(() => {
        const target = playTargetTime(payload.time, payload.sentAt || now, now);
        if (target > SYNC.MIN_MEANINGFUL_TIME_S) {
          seekVideo(target);
        }
        if (remotePlaying) playVideo();
        else pauseVideo();
      });
      return;
    }

    // Reconcile play state when explicit PLAY/PAUSE was missed (safe: sync lock blocks echo).
    if (remotePlaying !== localPlaying) {
      applySyncPlayerAction(() => {
        if (remotePlaying) playVideo();
        else pauseVideo();
      });
      return;
    }

    const correction = computeHeartbeatPositionCorrection(
      {
        currentTime: getCurrentVideoTime(),
        payloadTime: payload.time,
        isPlaying: remotePlaying,
        sentAt: payload.sentAt || now,
        now,
      },
      localPlaying
    );

    applySyncPlayerAction(() => {
      if (correction.seekTo !== undefined) {
        seekVideo(correction.seekTo);
        if (correction.playbackRate !== undefined) {
          setPlaybackRate(correction.playbackRate);
        }
      } else if (correction.playbackRate !== undefined) {
        setPlaybackRate(correction.playbackRate);
      }
    });
  }

  function handleRequestState(payload) {
    if (!activeChannel || payload.sender === currentUserName) return;
    activeChannel.send({
      type: "broadcast",
      event: "STATE_RESPONSE",
      payload: {
        time: getCurrentVideoTime(),
        isPlaying: isVideoPlaying(),
        videoUrl: window.location.href,
        title: document.title,
        sender: currentUserName,
        isHost: isHost,
        sentAt: Date.now(),
      },
    });
  }

  function handleStateResponse(payload) {
    if (isInitialSyncCompleted) return;
    if (payload.sender === currentUserName) return;
    isInitialSyncCompleted = true;

    if (payload.videoUrl && !isHost) {
      const currentUrl = window.location.href;
      const targetUrl = normalizeStreamingUrl(payload.videoUrl);
      const isVideoPage = targetUrl.includes("/watch") || targetUrl.includes("/title/") || targetUrl.includes("/video/");
      if (!isSameVideoUrl(currentUrl, targetUrl) && isVideoPage) {
        const sep = targetUrl.includes("#") ? "&" : "#";
        window.location.href = targetUrl + sep + "justus=" + activeRoomId;
        return;
      }
    }

    const now = Date.now();
    applySyncPlayerAction(() => {
      const target = playTargetTime(payload.time, payload.sentAt || now, now);
      if (target > SYNC.MIN_MEANINGFUL_TIME_S) {
        seekVideo(target);
      }
      if (payload.isPlaying) playVideo();
      else pauseVideo();
    });
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (!activeChannel || isSyncActionInProgress || !isInitialSyncCompleted) return;
      const current = getCurrentVideoTime();
      if (current < SYNC.MIN_MEANINGFUL_TIME_S && !isVideoPlaying()) return;

      activeChannel.send({
        type: "broadcast",
        event: "SYNC_HEARTBEAT",
        payload: {
          time: current,
          isPlaying: isVideoPlaying(),
          videoUrl: window.location.href,
          title: document.title,
          sender: currentUserName,
          isHost: isHost,
          sentAt: Date.now(),
        },
      });
    }, SYNC.HEARTBEAT_INTERVAL_MS);
  }

  function attachLocalPlayerListeners() {
    const v = findVideoElement();
    if (!v) {
      setTimeout(attachLocalPlayerListeners, 1000);
      return;
    }

    if (boundVideoEl === v) return;
    boundVideoEl = v;

    v.addEventListener("play", () => {
      setWakeLock(true);
      if (isSyncActionInProgress || !activeChannel) return;
      lastUserActionTime = Date.now();
      const time = v.currentTime;
      activeChannel.send({
        type: "broadcast",
        event: "PLAY",
        payload: { time, isPlaying: true, sender: currentUserName, isHost: isHost, sentAt: Date.now() },
      });
      addEventLog(`▶️ You played the video at ${formatTime(time)}`, currentUserName);
    });

    v.addEventListener("playing", () => {
      setWakeLock(true);
    });

    v.addEventListener("pause", () => {
      setWakeLock(false);
      if (isSyncActionInProgress || !activeChannel) return;
      lastUserActionTime = Date.now();
      const time = v.currentTime;
      activeChannel.send({
        type: "broadcast",
        event: "PAUSE",
        payload: { time, isPlaying: false, sender: currentUserName, isHost: isHost, sentAt: Date.now() },
      });
      addEventLog(`⏸️ You paused the video at ${formatTime(time)}`, currentUserName);
    });

    v.addEventListener("ended", () => {
      setWakeLock(false);
    });

    v.addEventListener("emptied", () => {
      setWakeLock(false);
    });

    v.addEventListener("seeked", () => {
      if (isSyncActionInProgress || !activeChannel) return;
      const time = v.currentTime;
      if (time < SYNC.MIN_MEANINGFUL_TIME_S) return;
      lastUserActionTime = Date.now();
      activeChannel.send({
        type: "broadcast",
        event: "SEEK",
        payload: { time, isPlaying: !v.paused, sender: currentUserName, isHost: isHost, sentAt: Date.now() },
      });
      addEventLog(`⏩ You jumped to ${formatTime(time)}`, currentUserName);
    });
  }
  // Track URL changes when host opens a movie or switches episodes
  let lastRecordedUrl = window.location.href;
  function checkUrlChange() {
    if (!activeRoomId || !isHost) return;
    const currentUrl = window.location.href;
    if (isSameVideoUrl(currentUrl, lastRecordedUrl)) return;
    const isVideoPage = currentUrl.includes("/watch") || currentUrl.includes("/title/") || currentUrl.includes("/video/");
    if (isVideoPage) {
      lastRecordedUrl = currentUrl;
      fetch(`${API_BASE}/api/rooms`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeRoomId,
          videoUrl: currentUrl,
          title: document.title || "Watch Party",
        }),
      }).catch(() => {});

      if (activeChannel) {
        activeChannel.send({
          type: "broadcast",
          event: "VIDEO_CHANGED",
          payload: {
            videoUrl: currentUrl,
            title: document.title || "Watch Party",
            sender: currentUserName,
          },
        });
      }
    }
  }

  window.addEventListener("yt-navigate-finish", checkUrlChange);
  window.addEventListener("yt-page-data-updated", checkUrlChange);
  window.addEventListener("popstate", checkUrlChange);

  // Netflix/Prime SPA navigation — re-attach overlay after in-page route changes
  let lastOverlayPath = location.pathname + location.search;
  setInterval(() => {
    const currentPath = location.pathname + location.search;
    if (currentPath !== lastOverlayPath) {
      lastOverlayPath = currentPath;
      if (typeof window.__JUSTUS_ENSURE_MOUNTED__ === "function") {
        window.__JUSTUS_ENSURE_MOUNTED__();
      }
    }
  }, 800);

  // Periodic video, URL, and wake lock watcher — lighter on touch devices
  let watcherBusy = false;
  setInterval(() => {
    if (watcherBusy) return;
    watcherBusy = true;
    try {
      const v = findVideoElement();
      if (v && v !== boundVideoEl) {
        attachLocalPlayerListeners();
      }
      checkUrlChange();
      const playing = isVideoPlaying();
      if (playing !== isWakeLockRequested) {
        setWakeLock(playing);
      }
    } finally {
      watcherBusy = false;
    }
  }, IS_TOUCH_DEVICE ? 4000 : 2000);
  // Check URL hash for auto-join (#justus=ju_xxx)
  function checkUrlHash() {
    const hash = window.location.hash;
    if (hash.includes("justus=")) {
      const code = hash.split("justus=")[1].split("&")[0];
      if (code) {
        joinParty(code);
      }
    }
  }
  checkUrlHash();

  function leaveParty(isLocalInitiated = true) {
    setWakeLock(false);
    leaveLiveKitCall();
    if (pipContainer) pipContainer.style.display = "none";
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    if (isLocalInitiated && isHost && activeRoomId) {
      const roomIdToPurge = activeRoomId;
      // 1. Broadcast to peers that host has ended the party
      if (activeChannel) {
        try {
          activeChannel.send({
            type: "broadcast",
            event: "HOST_LEFT",
            payload: { sender: currentUserName },
          });
        } catch (e) {}
      }

      // 2. Direct Supabase purge
      if (supabaseClient) {
        supabaseClient.from("chat_messages").delete().eq("room_id", roomIdToPurge).then(() => {}).catch(() => {});
        supabaseClient.from("room_participants").delete().eq("room_id", roomIdToPurge).then(() => {}).catch(() => {});
        supabaseClient.from("rooms").delete().eq("id", roomIdToPurge).then(() => {}).catch(() => {});
      }

      // 3. API endpoint purge
      fetch(`${API_BASE}/api/rooms?id=${encodeURIComponent(roomIdToPurge)}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {});
    }

    if (activeChannel && supabaseClient) {
      supabaseClient.removeChannel(activeChannel);
      activeChannel = null;
    }
    activeRoomId = null;
    isHost = false;
    isInitialSyncCompleted = false;
    savePartyState();
    updatePillState();
    renderDrawerContent();
  }
  // Purge room only when host CLOSES the tab/browser — not on same-site navigation.
  // We use the visibilitychange + pagehide pattern because beforeunload fires on both
  // tab close AND same-site navigation, which was destroying the room when the host
  // clicked a video on YouTube.
  let isTabClosing = false;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      // Could be tab close or navigation. We set a flag and let pagehide confirm.
      isTabClosing = true;
    } else {
      isTabClosing = false;
    }
  });
  window.addEventListener("pagehide", (e) => {
    // e.persisted === true means the page is being put in bfcache (navigation, not close)
    // For actual tab close, persisted is typically false
    if (isHost && activeRoomId && !e.persisted) {
      // Check if navigating within same streaming site (don't delete room)
      const savedRoom = sessionStorage.getItem("justus_active_room");
      if (savedRoom) {
        // Party state is saved — this is a same-site navigation, don't delete
        return;
      }
      fetch(`${API_BASE}/api/rooms?id=${encodeURIComponent(activeRoomId)}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {});
    }
  });

  // Auto-rejoin: If the script re-initializes (YouTube full page nav) and we have
  // a saved party in sessionStorage, reconnect to the realtime channel automatically.
  if (restorePartyState() && activeRoomId) {
    loadSupabase(() => {
      connectRealtimeChannel(activeRoomId, isHost);
      updatePillState();
      if (isHost) {
        // Broadcast the new URL to viewers once the channel is connected.
        // Retry because channel subscription is async.
        const currentUrl = window.location.href;
        let broadcastAttempts = 0;
        const broadcastInterval = setInterval(() => {
          broadcastAttempts++;
          if (activeChannel) {
            try {
              activeChannel.send({
                type: "broadcast",
                event: "VIDEO_CHANGED",
                payload: {
                  videoUrl: currentUrl,
                  title: document.title || "Watch Party",
                  sender: currentUserName,
                },
              });
              clearInterval(broadcastInterval);
            } catch (e) {}
          }
          if (broadcastAttempts > 12) clearInterval(broadcastInterval);
        }, 500);
      }
    });
  }
})();
