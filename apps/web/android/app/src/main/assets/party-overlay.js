// JustUS iOS / iPadOS Injected Watch Party Overlay
// Provides Floating Party HUD, Cross-Platform Supabase Playback Sync, Event Logging & Chat

(function () {
  if (window.__JUSTUS_PARTY_OVERLAY_LOADED__) return;
  window.__JUSTUS_PARTY_OVERLAY_LOADED__ = true;

  const SUPABASE_URL = "https://djuqnhqedykhectfhzba.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqdXFuaHFlZHlraGVjdGZoemJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MzMxNzcsImV4cCI6MjEwMzIwOTE3N30.UhcqK9MfjxuT-XjjiHzpnrRgZKjkyX2IDuh5FMhoO98";
  const API_BASE = "https://just-us-web.vercel.app";

  let supabaseClient = null;
  let activeChannel = null;
  let activeRoomId = null;
  let currentUserName = localStorage.getItem("justus_username") || "iPad_User_" + Math.floor(Math.random() * 1000);
  let isHost = false;
  let isSyncActionInProgress = false;
  let isInitialSyncCompleted = false;
  let heartbeatTimer = null;
  let boundVideoEl = null;

  // Storage of events & chat
  const eventLogs = [];

  // Helper to load Supabase JS SDK dynamically
  function loadSupabase(callback) {
    if (window.supabase && window.supabase.createClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      callback();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
    script.onload = function () {
      if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        callback();
      }
    };
    script.onerror = function () {
      console.warn("[JustUS] Could not load Supabase SDK from CDN");
    };
    (document.head || document.documentElement).appendChild(script);
  }

  // Detect Video Player (YouTube, Netflix API or HTML5 video)
  function findVideoElement() {
    return document.querySelector(".html5-main-video, .watch-video video, .sizing-wrapper video, video");
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

  // Handle visibility change to re-acquire wake lock if tab is focused during playback
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && (isWakeLockRequested || isVideoPlaying())) {
        setWakeLock(true);
      }
    });
  }

  function playVideo() {
    setWakeLock(true);
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.play === "function") {
      try {
        netflixPlayer.play();
        return;
      } catch (e) {}
    }
    const v = findVideoElement();
    if (v) {
      v.volume = 1.0;
      v.muted = false;
      if (v.paused) {
        v.play().catch(() => {});
        const playBtn = document.querySelector("button[data-uia='control-play-pause']");
        if (playBtn) playBtn.click();
      }
    }
  }

  function pauseVideo() {
    setWakeLock(false);
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.pause === "function") {
      try {
        netflixPlayer.pause();
        return;
      } catch (e) {}
    }
    const v = findVideoElement();
    if (v && !v.paused) {
      v.pause();
      const playBtn = document.querySelector("button[data-uia='control-play-pause']");
      if (playBtn) playBtn.click();
    }
  }

  function seekVideo(timeInSeconds) {
    if (timeInSeconds <= 1.0) return; // Do not interrupt player initialization at 00:00
    const current = getCurrentVideoTime();
    if (Math.abs(current - timeInSeconds) < 2.0) return; // Already in sync, avoid buffer thrashing

    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.seek === "function") {
      try {
        netflixPlayer.seek(timeInSeconds * 1000);
        return;
      } catch (e) {}
    }
    const v = findVideoElement();
    if (v && Math.abs(v.currentTime - timeInSeconds) > 2.5) {
      try {
        v.currentTime = timeInSeconds;
      } catch (e) {}
    }
  }

  let currentPlaybackRate = 1.0;
  function setPlaybackRate(rate) {
    if (Math.abs(currentPlaybackRate - rate) < 0.01) return;
    currentPlaybackRate = rate;
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
    const v = findVideoElement();
    return v ? v.currentTime : 0;
  }

  function isVideoPlaying() {
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.isPlaying === "function") {
      return netflixPlayer.isPlaying();
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
    }
    
    .floating-pill {
      height: 38px !important;
      padding: 0 14px !important;
      border-radius: 19px !important;
      background: rgba(18, 20, 31, 0.94) !important;
      backdrop-filter: blur(16px) !important;
      -webkit-backdrop-filter: blur(16px) !important;
      border: 1px solid rgba(255, 255, 255, 0.25) !important;
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
      transition: transform 0.15s ease, background 0.2s ease !important;
      opacity: 1 !important;
      visibility: visible !important;
    }
    .floating-pill:active { transform: scale(0.96); }
    .floating-pill.hidden { display: none !important; }
    .floating-pill.video-pill {
      background: rgba(30, 27, 75, 0.94) !important;
      border-color: rgba(99, 102, 241, 0.45) !important;
    }
    .floating-pill.video-pill.active {
      background: rgba(6, 78, 59, 0.94) !important;
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

    /* Ultra-Sleek Floating Video-First PIP Window */
    .video-call-window {
      position: fixed;
      top: 65px;
      right: 20px;
      width: 220px;
      height: 165px;
      min-width: 150px;
      min-height: 110px;
      max-width: 85vw;
      max-height: 80vh;
      border-radius: 18px;
      background: #090A10;
      border: 1.5px solid rgba(255, 255, 255, 0.22);
      box-shadow: 0 14px 40px rgba(0, 0, 0, 0.85);
      overflow: hidden;
      z-index: 2147483645;
      pointer-events: auto;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      transition: box-shadow 0.2s ease;
    }
    .video-call-window.hidden {
      display: none !important;
    }

    .video-canvas {
      position: relative;
      width: 100%;
      height: 100%;
      background: #000;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .remote-video-feed {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background: #090A10;
    }

    .local-video-pip {
      position: absolute;
      bottom: 8px;
      right: 8px;
      width: 58px;
      height: 44px;
      border-radius: 8px;
      border: 1.5px solid rgba(255, 255, 255, 0.5);
      object-fit: cover;
      transform: scaleX(-1);
      background: #181A26;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.85);
      z-index: 2;
    }
    .local-video-pip.hidden {
      display: none !important;
    }

    .video-waiting-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: #0d0f18;
      color: #94A3B8;
      font-size: 10px;
      font-weight: 600;
      z-index: 1;
      padding: 8px;
      text-align: center;
    }
    .video-waiting-overlay.hidden {
      display: none !important;
    }
    .waiting-pulse {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #6366F1;
      animation: pulseRing 1.8s infinite;
    }

    /* Tap-to-Reveal Controls Overlay */
    .video-controls-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.85) 100%);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 6px;
      z-index: 4;
      opacity: 1;
      transition: opacity 0.25s ease;
      pointer-events: auto;
    }
    .video-controls-overlay.hidden {
      opacity: 0 !important;
      pointer-events: none !important;
    }

    .overlay-close-btn {
      align-self: flex-end;
      width: 22px;
      height: 22px;
      border-radius: 11px;
      background: rgba(0, 0, 0, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: #fff;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .video-control-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding-bottom: 2px;
    }

    .call-ctrl-btn {
      width: 28px;
      height: 28px;
      border-radius: 14px;
      background: rgba(0, 0, 0, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      backdrop-filter: blur(8px);
      transition: transform 0.1s;
    }
    .call-ctrl-btn:active { transform: scale(0.92); }
    .call-ctrl-btn.off {
      background: rgba(239, 68, 68, 0.7);
      border-color: #EF4444;
    }
    .call-ctrl-btn.end-call {
      background: #EF4444;
      border-color: #DC2626;
    }

    .video-resize-handle {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 20px;
      height: 20px;
      cursor: nwse-resize;
      display: flex;
      align-items: flex-end;
      justify-content: flex-end;
      padding: 2px;
      touch-action: none;
      z-index: 5;
    }

    .drawer-overlay {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 340px;
      background: rgba(14, 16, 26, 0.96);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border-left: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: -10px 0 35px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      color: #F1F5F9;
      z-index: 2147483646;
      pointer-events: auto;
      transform: translateX(100%);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .drawer-overlay.open { transform: translateX(0); }

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
    .action-btn:active { transform: scale(0.98); }

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

  // Floating Draggable & Resizable Video-First PIP Window
  const videoWindow = document.createElement("div");
  videoWindow.className = "video-call-window hidden";
  videoWindow.id = "ju-video-window";
  videoWindow.innerHTML = `
    <div class="video-canvas" id="ju-video-canvas">
      <div class="video-waiting-overlay" id="ju-video-waiting">
        <div class="waiting-pulse"></div>
        <span id="ju-waiting-text">Connecting video call...</span>
      </div>
      <video class="remote-video-feed" id="ju-remote-video" autoplay playsinline></video>
      <video class="local-video-pip hidden" id="ju-local-video" autoplay playsinline muted></video>

      <!-- Tap-to-Reveal Controls Overlay -->
      <div class="video-controls-overlay hidden" id="ju-video-controls">
        <button class="overlay-close-btn" id="ju-btn-close-call" title="Close">✕</button>
        <div class="video-control-bar">
          <button class="call-ctrl-btn" id="ju-btn-mic" title="Mute/Unmute Mic">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
          </button>
          <button class="call-ctrl-btn" id="ju-btn-cam" title="Camera On/Off">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
          </button>
          <button class="call-ctrl-btn" id="ju-btn-flip" title="Flip Camera">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          </button>
          <button class="call-ctrl-btn end-call" id="ju-btn-hangup" title="End Call">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/></svg>
          </button>
        </div>
      </div>

      <!-- Resize Grip -->
      <div class="video-resize-handle" id="ju-video-resize-handle" title="Drag to resize">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="3"><line x1="22" y1="2" x2="2" y2="22"/><line x1="22" y1="12" x2="12" y2="22"/></svg>
      </div>
    </div>
  `;
  shadow.appendChild(videoWindow);

  // Drawer Overlay Element
  const drawer = document.createElement("div");
  drawer.className = "drawer-overlay";
  shadow.appendChild(drawer);

  function ensureOverlayMounted() {
    const existing = document.getElementById("justus-party-overlay-root");
    const target = document.body || document.documentElement;
    if (!existing && target) {
      target.appendChild(hostDiv);
    } else if (existing && target && existing.parentElement !== target) {
      target.appendChild(existing);
    }
  }

  if (document.body || document.documentElement) {
    ensureOverlayMounted();
  } else {
    document.addEventListener("DOMContentLoaded", ensureOverlayMounted);
  }

  window.addEventListener("yt-navigate-finish", ensureOverlayMounted);
  window.addEventListener("popstate", ensureOverlayMounted);
  window.addEventListener("load", ensureOverlayMounted);
  setInterval(ensureOverlayMounted, 600);

  // Party Pill Tap Handlers
  let lastPillToggleTimestamp = 0;
  let lastVideoToggleTimestamp = 0;

  drawer.addEventListener("touchstart", (e) => e.stopPropagation());
  drawer.addEventListener("touchmove", (e) => e.stopPropagation());
  drawer.addEventListener("touchend", (e) => e.stopPropagation());
  drawer.addEventListener("click", (e) => e.stopPropagation());

  function handlePartyPillTap(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const now = Date.now();
    if (now - lastPillToggleTimestamp < 250) return;
    lastPillToggleTimestamp = now;
    toggleDrawer();
  }

  partyPill.addEventListener("click", handlePartyPillTap);
  partyPill.addEventListener("touchend", handlePartyPillTap);

  function handleVideoPillTap(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const now = Date.now();
    if (now - lastVideoToggleTimestamp < 250) return;
    lastVideoToggleTimestamp = now;
    toggleVideoCallWindow();
  }

  videoPill.addEventListener("click", handleVideoPillTap);
  videoPill.addEventListener("touchend", handleVideoPillTap);

  function toggleDrawer() {
    if (drawer.classList.contains("open")) {
      drawer.classList.remove("open");
    } else {
      drawer.classList.add("open");
      renderDrawerContent();
    }
  }

  function closeDrawer(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    drawer.classList.remove("open");
  }
      e.preventDefault();
      e.stopPropagation();
    }
    drawer.classList.remove("open");
  }

  // ─────────────────────────────────────────────────────────────────
  // DRAGGABLE, RESIZABLE & TAP-TO-REVEAL VIDEO WINDOW HANDLERS
  // ─────────────────────────────────────────────────────────────────
  const videoCanvas = shadow.getElementById("ju-video-canvas");
  const resizeHandle = shadow.getElementById("ju-video-resize-handle");
  const videoControls = shadow.getElementById("ju-video-controls");
  
  // Pointer-Based Draggable, Resizable & Tap-to-Reveal Video Window Handlers
  let isDraggingWindow = false;
  let hasMovedWindow = false;
  let dragWindowStartX = 0, dragWindowStartY = 0;
  let winStartLeft = 0, winStartTop = 0;
  let controlsHideTimeout = null;
  let lastControlsToggleTime = 0;

  function toggleControlsOverlay() {
    if (!videoControls) return;
    const now = Date.now();
    if (now - lastControlsToggleTime < 300) return;
    lastControlsToggleTime = now;

    if (videoControls.classList.contains("hidden")) {
      videoControls.classList.remove("hidden");
      resetControlsHideTimer();
    } else {
      videoControls.classList.add("hidden");
      if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
    }
  }

  function resetControlsHideTimer() {
    if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
    controlsHideTimeout = setTimeout(() => {
      if (videoControls) videoControls.classList.add("hidden");
    }, 4500);
  }

  function onWindowPointerDown(e) {
    if (e.target.closest("button") || e.target.closest(".video-resize-handle") || e.target.closest(".video-controls-overlay")) return;
    isDraggingWindow = true;
    hasMovedWindow = false;
    dragWindowStartX = e.clientX;
    dragWindowStartY = e.clientY;
    const rect = videoWindow.getBoundingClientRect();
    winStartLeft = rect.left;
    winStartTop = rect.top;
  }

  function onWindowPointerMove(e) {
    if (!isDraggingWindow) return;
    const deltaX = e.clientX - dragWindowStartX;
    const deltaY = e.clientY - dragWindowStartY;

    if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
      hasMovedWindow = true;
    }

    if (hasMovedWindow) {
      let newLeft = winStartLeft + deltaX;
      let newTop = winStartTop + deltaY;

      const winWidth = videoWindow.offsetWidth;
      const winHeight = videoWindow.offsetHeight;
      newLeft = Math.max(8, Math.min(window.innerWidth - winWidth - 8, newLeft));
      newTop = Math.max(8, Math.min(window.innerHeight - winHeight - 8, newTop));

      videoWindow.style.left = `${newLeft}px`;
      videoWindow.style.top = `${newTop}px`;
      videoWindow.style.right = "auto";
    }
  }

  function onWindowPointerUp(e) {
    if (!isDraggingWindow) return;
    isDraggingWindow = false;
    if (!hasMovedWindow) {
      toggleControlsOverlay();
    }
  }

  videoCanvas.addEventListener("pointerdown", onWindowPointerDown);
  window.addEventListener("pointermove", onWindowPointerMove);
  window.addEventListener("pointerup", onWindowPointerUp);

  // Prevent taps inside controls overlay from closing it
  videoControls.addEventListener("pointerdown", (e) => e.stopPropagation());
  videoControls.addEventListener("click", (e) => {
    e.stopPropagation();
    resetControlsHideTimer();
  });

  // Resize Handlers
  let isResizingWindow = false;
  let resizeStartX = 0, resizeStartY = 0;
  let startWinWidth = 0, startWinHeight = 0;

  function onWindowResizeStart(e) {
    e.stopPropagation();
    isResizingWindow = true;
    const touch = e.touches ? e.touches[0] : e;
    resizeStartX = touch.clientX;
    resizeStartY = touch.clientY;
    startWinWidth = videoWindow.offsetWidth;
    startWinHeight = videoWindow.offsetHeight;
  }

  function onWindowResizeMove(e) {
    if (!isResizingWindow) return;
    const touch = e.touches ? e.touches[0] : e;
    const deltaX = touch.clientX - resizeStartX;
    const deltaY = touch.clientY - resizeStartY;

    const rect = videoWindow.getBoundingClientRect();
    const maxWidth = window.innerWidth - rect.left - 10;
    const maxHeight = window.innerHeight - rect.top - 10;

    const newWidth = Math.max(150, Math.min(maxWidth, startWinWidth + deltaX));
    const newHeight = Math.max(110, Math.min(maxHeight, startWinHeight + deltaY));

    videoWindow.style.width = `${newWidth}px`;
    videoWindow.style.height = `${newHeight}px`;
  }

  function onWindowResizeEnd() {
    isResizingWindow = false;
  }

  resizeHandle.addEventListener("pointerdown", onWindowResizeStart);
  window.addEventListener("pointermove", onWindowResizeMove);
  window.addEventListener("pointerup", onWindowResizeEnd);

  // Video Window Control Buttons
  shadow.getElementById("ju-btn-close-call")?.addEventListener("click", (e) => {
    e.stopPropagation();
    videoWindow.classList.add("hidden");
  });
  shadow.getElementById("ju-btn-hangup")?.addEventListener("click", (e) => {
    e.stopPropagation();
    leaveLiveKitCall();
    videoWindow.classList.add("hidden");
  });
  shadow.getElementById("ju-btn-mic")?.addEventListener("click", (e) => {
    e.stopPropagation();
    resetControlsHideTimer();
    toggleMic();
  });
  shadow.getElementById("ju-btn-cam")?.addEventListener("click", (e) => {
    e.stopPropagation();
    resetControlsHideTimer();
    toggleCam();
  });
  shadow.getElementById("ju-btn-flip")?.addEventListener("click", (e) => {
    e.stopPropagation();
    resetControlsHideTimer();
    flipCamera();
  });

  // ─────────────────────────────────────────────────────────────────
  // LIVEKIT WEBRTC VIDEO CALLING LOGIC
  // ─────────────────────────────────────────────────────────────────
  let livekitRoom = null;
  let localVideoTrack = null;
  let localAudioTrack = null;
  let remoteAudioEl = null;
  let isVideoCallActive = false;
  let isMicEnabled = true;
  let isCamEnabled = true;
  let currentFacingMode = "user";
  let isLiveKitConnecting = false;

  function loadLiveKitSDK(callback) {
    if (window.LivekitClient) {
      callback();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/livekit-client@2.6.0/dist/livekit-client.umd.min.js";
    script.onload = () => {
      if (window.LivekitClient) callback();
    };
    script.onerror = () => {
      console.warn("[JustUS] Could not load LiveKit SDK from CDN");
      addEventLog("⚠️ Could not load video call client", "System");
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function toggleVideoCallWindow() {
    if (!activeRoomId) {
      addEventLog("⚠️ Please create or join a watch party first!", "System");
      toggleDrawer();
      return;
    }

    if (videoWindow.classList.contains("hidden")) {
      videoWindow.classList.remove("hidden");
      toggleControlsOverlay();
      if (!livekitRoom && !isLiveKitConnecting) {
        connectLiveKitCall();
      }
    } else {
      videoWindow.classList.add("hidden");
    }
  }

  // Fallback JWT token generator using browser WebCrypto
  async function createClientLiveKitToken(roomName, identity, isHost) {
    try {
      const header = { alg: "HS256", typ: "JWT" };
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: "APIukxmynV6MQkR",
        sub: identity,
        name: identity.split("_")[0],
        nbf: now - 5,
        exp: now + 6 * 3600,
        video: {
          roomJoin: true,
          room: roomName,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          roomAdmin: Boolean(isHost),
        },
      };

      function b64url(str) {
        return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      }

      const encHeader = b64url(JSON.stringify(header));
      const encPayload = b64url(JSON.stringify(payload));
      const dataToSign = `${encHeader}.${encPayload}`;

      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode("OiAeIxN1foN0UQTbvdWW4veSRC4rtTNZua64vC9Qzl3A"),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(dataToSign));
      const sigArray = Array.from(new Uint8Array(sigBuf));
      const sigStr = sigArray.map((b) => String.fromCharCode(b)).join("");
      const signatureB64 = b64url(sigStr);
      return `${dataToSign}.${signatureB64}`;
    } catch (e) {
      console.warn("[JustUS] Local JWT generation fallback failed:", e);
      return null;
    }
  }

  async function connectLiveKitCall() {
    if (!activeRoomId || isLiveKitConnecting) return;
    isLiveKitConnecting = true;
    const waitingText = shadow.getElementById("ju-waiting-text");
    if (waitingText) waitingText.textContent = "Connecting video call...";

    loadLiveKitSDK(async () => {
      try {
        const participantId = currentUserName + "_" + Math.random().toString(36).substring(2, 6);
        let token = null;
        let wsUrl = "wss://justus-0q7zbww8.livekit.cloud";

        try {
          const res = await fetch(`${API_BASE}/api/livekit/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              roomName: activeRoomId,
              identity: participantId,
              name: currentUserName,
              isHost: isHost,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            token = data.token;
            if (data.wsUrl) wsUrl = data.wsUrl;
          }
        } catch (fetchErr) {
          console.warn("[JustUS] Token API fetch notice, using direct token generator:", fetchErr);
        }

        if (!token) {
          token = await createClientLiveKitToken(activeRoomId, participantId, isHost);
        }

        if (!token) {
          throw new Error("Unable to obtain LiveKit token");
        }

        const room = new window.LivekitClient.Room({
          adaptiveStream: true,
          dynacast: true,
        });
        livekitRoom = room;

        room.on(window.LivekitClient.RoomEvent.TrackSubscribed, (track, pub, participant) => {
          const waitingOverlay = shadow.getElementById("ju-video-waiting");
          if (track.kind === window.LivekitClient.Track.Kind.Video) {
            const remoteVideo = shadow.getElementById("ju-remote-video");
            if (remoteVideo) {
              track.attach(remoteVideo);
              if (waitingOverlay) waitingOverlay.classList.add("hidden");
            }
          }
          if (track.kind === window.LivekitClient.Track.Kind.Audio) {
            const audioEl = track.attach();
            remoteAudioEl = audioEl;
            audioEl.volume = 0.9;
            shadow.appendChild(audioEl);
          }
        });

        room.on(window.LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
          track.detach();
          if (track.kind === window.LivekitClient.Track.Kind.Video) {
            const waitingOverlay = shadow.getElementById("ju-video-waiting");
            if (waitingOverlay) waitingOverlay.classList.remove("hidden");
          }
        });

        room.on(window.LivekitClient.RoomEvent.ParticipantDisconnected, () => {
          const waitingOverlay = shadow.getElementById("ju-video-waiting");
          if (waitingOverlay) {
            waitingOverlay.classList.remove("hidden");
            const wt = shadow.getElementById("ju-waiting-text");
            if (wt) wt.textContent = "Friend left call";
          }
        });

        room.on(window.LivekitClient.RoomEvent.Disconnected, () => {
          leaveLiveKitCall();
        });

        await room.connect(wsUrl, token);
        isVideoCallActive = true;
        updateVideoPillState();

        // 1. Microphone track strictly with Acoustic Echo Cancellation & Noise Suppression
        // Isolated to hardware mic so speaker video playback audio is NOT transmitted into the call
        try {
          localAudioTrack = await window.LivekitClient.createLocalAudioTrack({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
          await room.localParticipant.publishTrack(localAudioTrack);
        } catch (e) {
          console.warn("[JustUS] Microphone setup notice:", e);
        }

        // 2. Front/User Camera track
        try {
          localVideoTrack = await window.LivekitClient.createLocalVideoTrack({
            facingMode: currentFacingMode || "user",
          });
          const localVideoEl = shadow.getElementById("ju-local-video");
          if (localVideoEl) {
            localVideoTrack.attach(localVideoEl);
            localVideoEl.classList.remove("hidden");
          }
          await room.localParticipant.publishTrack(localVideoTrack);
        } catch (e) {
          console.warn("[JustUS] Camera setup notice:", e);
        }

        if (waitingText) waitingText.textContent = "Waiting for friend to join call...";
      } catch (err) {
        console.error("[JustUS] LiveKit call error:", err);
        if (waitingText) waitingText.textContent = `Connection error: ${err.message || "Failed to connect"}`;
      } finally {
        isLiveKitConnecting = false;
      }
    });
  }

  function leaveLiveKitCall() {
    isVideoCallActive = false;
    if (localAudioTrack) {
      try {
        localAudioTrack.stop();
        if (localAudioTrack.mediaStreamTrack) localAudioTrack.mediaStreamTrack.stop();
      } catch (e) {}
      localAudioTrack = null;
    }
    if (localVideoTrack) {
      try {
        localVideoTrack.stop();
        if (localVideoTrack.mediaStreamTrack) localVideoTrack.mediaStreamTrack.stop();
      } catch (e) {}
      localVideoTrack = null;
    }
    if (remoteAudioEl) {
      try { remoteAudioEl.remove(); } catch (e) {}
      remoteAudioEl = null;
    }
    if (livekitRoom) {
      try { livekitRoom.disconnect(); } catch (e) {}
      livekitRoom = null;
    }
    const localVideoEl = shadow.getElementById("ju-local-video");
    if (localVideoEl) localVideoEl.classList.add("hidden");
    const waitingOverlay = shadow.getElementById("ju-video-waiting");
    if (waitingOverlay) waitingOverlay.classList.remove("hidden");
    updateVideoPillState();
  }

  async function toggleMic() {
    isMicEnabled = !isMicEnabled;
    const btn = shadow.getElementById("ju-btn-mic");
    if (btn) btn.classList.toggle("off", !isMicEnabled);

    if (!isMicEnabled) {
      if (localAudioTrack) {
        const tr = localAudioTrack;
        localAudioTrack = null;
        try {
          if (livekitRoom) await livekitRoom.localParticipant.unpublishTrack(tr, true);
          tr.stop();
          if (tr.mediaStreamTrack) tr.mediaStreamTrack.stop();
        } catch (e) {}
      }
    } else {
      if (livekitRoom) {
        try {
          localAudioTrack = await window.LivekitClient.createLocalAudioTrack({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
          await livekitRoom.localParticipant.publishTrack(localAudioTrack);
        } catch (e) {}
      }
    }
  }

  async function toggleCam() {
    isCamEnabled = !isCamEnabled;
    const btn = shadow.getElementById("ju-btn-cam");
    const localVideoEl = shadow.getElementById("ju-local-video");
    if (btn) btn.classList.toggle("off", !isCamEnabled);

    if (!isCamEnabled) {
      if (localVideoEl) localVideoEl.classList.add("hidden");
      if (localVideoTrack) {
        const tr = localVideoTrack;
        localVideoTrack = null;
        try {
          if (livekitRoom) await livekitRoom.localParticipant.unpublishTrack(tr, true);
          tr.stop();
          if (tr.mediaStreamTrack) tr.mediaStreamTrack.stop();
        } catch (e) {}
      }
    } else {
      if (livekitRoom) {
        try {
          localVideoTrack = await window.LivekitClient.createLocalVideoTrack({
            facingMode: currentFacingMode,
            resolution: { width: 480, height: 360, frameRate: 24 },
          });
          if (localVideoEl) {
            localVideoTrack.attach(localVideoEl);
            localVideoEl.classList.remove("hidden");
          }
          await livekitRoom.localParticipant.publishTrack(localVideoTrack);
        } catch (e) {}
      }
    }
  }

  async function flipCamera() {
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
    const localVideoEl = shadow.getElementById("ju-local-video");
    if (localVideoTrack) {
      const oldTrack = localVideoTrack;
      try {
        if (livekitRoom) await livekitRoom.localParticipant.unpublishTrack(oldTrack, true);
        oldTrack.stop();
        if (oldTrack.mediaStreamTrack) oldTrack.mediaStreamTrack.stop();
      } catch (e) {}
    }
    if (livekitRoom && isCamEnabled) {
      try {
        localVideoTrack = await window.LivekitClient.createLocalVideoTrack({
          facingMode: currentFacingMode,
          resolution: { width: 480, height: 360, frameRate: 24 },
        });
        if (localVideoEl) {
          localVideoTrack.attach(localVideoEl);
          localVideoEl.classList.remove("hidden");
        }
        await livekitRoom.localParticipant.publishTrack(localVideoTrack);
      } catch (e) {}
    }
  }

  function updateVideoPillState() {
    const videoDot = shadow.getElementById("ju-video-dot");
    const videoPillText = shadow.getElementById("ju-video-pill-text");
    const vPill = shadow.getElementById("ju-video-pill");
    if (!vPill) return;

    if (!activeRoomId) {
      vPill.classList.add("hidden");
      return;
    }

    vPill.classList.remove("hidden");

    if (videoDot && videoPillText) {
      if (isVideoCallActive) {
        videoDot.className = "status-dot active";
        vPill.classList.add("active");
        videoPillText.textContent = "📹 In Call";
      } else {
        videoDot.className = "status-dot idle";
        vPill.classList.remove("active");
        videoPillText.textContent = "📹 Video Call";
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // LOG EVENT HELPER
  // ─────────────────────────────────────────────────────────────────
  function addEventLog(text, sender = "System", type = "event") {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    eventLogs.push({ text, sender, time, type });
    renderFeed();
  }

  function renderFeed() {
    const feedEl = shadow.getElementById("ju-event-feed");
    if (!feedEl) return;
    feedEl.innerHTML = eventLogs
      .map(
        (e) => `
        <div class="feed-item ${e.type === "chat" ? "chat" : ""}">
          <div class="feed-header">
            <span class="feed-sender">${e.sender}</span>
            <span>${e.time}</span>
          </div>
          <div>${e.text}</div>
        </div>
      `
      )
      .join("");
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
      // Active Party Screen (Event feed, Presence, Chat, Sync)
      const inviteUrl = `${API_BASE}/join/${activeRoomId}`;
      drawer.innerHTML = `
        <div class="drawer-header">
          <div class="brand-title">
            <img src="${API_BASE}/logo.png" style="width: 20px; height: 20px; border-radius: 6px; object-fit: cover;" />
            <span class="status-dot"></span>
            <span>Party Active</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="close-btn" id="ju-leave-party" title="Leave Party" style="color: #F87171;">✕</button>
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

      shadow.getElementById("ju-leave-party")?.addEventListener("click", leaveParty);
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

    loadSupabase(() => {
      const nowIso = new Date().toISOString();
      const roomPayload = {
        id: newRoomId,
        host_id: currentUserName,
        service: window.location.hostname.includes("prime") ? "prime" : "netflix",
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

    loadSupabase(() => {
      connectRealtimeChannel(cleanCode, false);
      addEventLog(`🍿 You joined party [${cleanCode}]`, currentUserName);
      updatePillState();
      renderDrawerContent();
    });
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
          const currentUrl = window.location.href.split("#")[0].split("?")[0];
          const targetUrl = payload.videoUrl.split("#")[0].split("?")[0];
          if (currentUrl !== targetUrl && targetUrl.includes("/watch/")) {
            addEventLog(`🎬 Host opened: ${payload.title || "Selected Video"}`, payload.sender);
            window.location.href = payload.videoUrl + "#justus=" + activeRoomId;
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

  function handleRemotePlay(payload) {
    const sender = payload.sender || "Friend";
    const timeStr = formatTime(payload.time);
    addEventLog(`▶️ Played video at ${timeStr}`, sender);
    isSyncActionInProgress = true;
    const current = getCurrentVideoTime();
    const latency = Math.max(0, (Date.now() - (payload.sentAt || Date.now())) / 1000);
    const target = payload.time + (latency > 0 && latency < 1.5 ? latency : 0);
    if (target > 1.0 && Math.abs(current - target) > 0.35) {
      seekVideo(target);
    }
    playVideo();
    setTimeout(() => (isSyncActionInProgress = false), 1000);
  }

  function handleRemotePause(payload) {
    const sender = payload.sender || "Friend";
    const timeStr = formatTime(payload.time);
    addEventLog(`⏸️ Paused video at ${timeStr}`, sender);
    isSyncActionInProgress = true;
    pauseVideo();
    if (payload.time > 1.0 && Math.abs(getCurrentVideoTime() - payload.time) > 0.25) {
      seekVideo(payload.time);
    }
    setTimeout(() => (isSyncActionInProgress = false), 1000);
  }

  function handleRemoteSeek(payload) {
    if (!payload || payload.time < 1.0) return;
    const sender = payload.sender || "Friend";
    const timeStr = formatTime(payload.time);
    const current = getCurrentVideoTime();
    if (Math.abs(current - payload.time) < 0.35) return;

    addEventLog(`⏩ Jumped to ${timeStr}`, sender);
    isSyncActionInProgress = true;
    seekVideo(payload.time);
    setTimeout(() => (isSyncActionInProgress = false), 1000);
  }

  function handleRemoteHeartbeat(payload) {
    if (isSyncActionInProgress || isHost) return;

    if (payload.videoUrl && !isHost) {
      const currentUrl = window.location.href.split("#")[0].split("?")[0];
      const targetUrl = payload.videoUrl.split("#")[0].split("?")[0];
      if (currentUrl !== targetUrl && targetUrl.includes("/watch/")) {
        window.location.href = payload.videoUrl + "#justus=" + activeRoomId;
        return;
      }
    }

    const current = getCurrentVideoTime();
    const latency = Math.max(0, (Date.now() - (payload.sentAt || Date.now())) / 1000);
    const hostExpectedTime = payload.isPlaying ? payload.time + latency : payload.time;
    const delta = hostExpectedTime - current;

    if (payload.isPlaying) {
      if (Math.abs(delta) > 0.6 && hostExpectedTime > 1.0) {
        seekVideo(hostExpectedTime);
        if (!isVideoPlaying()) playVideo();
      } else if (!isVideoPlaying()) {
        playVideo();
      }
    } else {
      if (Math.abs(delta) > 0.25 && hostExpectedTime > 1.0) {
        seekVideo(hostExpectedTime);
      }
      if (isVideoPlaying()) {
        pauseVideo();
      }
    }
  }

  function handleRequestState(payload) {
    if (!activeChannel) return;
    activeChannel.send({
      type: "broadcast",
      event: "STATE_RESPONSE",
      payload: {
        time: getCurrentVideoTime(),
        isPlaying: isVideoPlaying(),
        videoUrl: window.location.href,
        title: document.title,
        sender: currentUserName,
        sentAt: Date.now(),
      },
    });
  }

  function handleStateResponse(payload) {
    if (isInitialSyncCompleted) return;
    isInitialSyncCompleted = true;

    if (payload.videoUrl && !isHost) {
      const currentUrl = window.location.href.split("#")[0].split("?")[0];
      const targetUrl = payload.videoUrl.split("#")[0].split("?")[0];
      if (currentUrl !== targetUrl && targetUrl.includes("/watch/")) {
        window.location.href = payload.videoUrl + "#justus=" + activeRoomId;
        return;
      }
    }

    const latency = (Date.now() - (payload.sentAt || Date.now())) / 1000;
    const target = payload.time + (payload.isPlaying && latency > 0 && latency < 2 ? latency : 0);
    if (target > 1.0) {
      seekVideo(target);
    }
    if (payload.isPlaying) playVideo();
    else pauseVideo();
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (!activeChannel || isSyncActionInProgress) return;
      const current = getCurrentVideoTime();
      if (current < 0.5 && !isVideoPlaying()) return; // Do not broadcast inactive 0 state

      activeChannel.send({
        type: "broadcast",
        event: "SYNC_HEARTBEAT",
        payload: {
          time: current,
          isPlaying: isVideoPlaying(),
          videoUrl: window.location.href,
          title: document.title,
          sender: currentUserName,
          sentAt: Date.now(),
        },
      });
    }, 1000);
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
      const time = v.currentTime;
      activeChannel.send({
        type: "broadcast",
        event: "PLAY",
        payload: { time, isPlaying: true, sender: currentUserName, sentAt: Date.now() },
      });
      addEventLog(`▶️ You played the video at ${formatTime(time)}`, currentUserName);
    });

    v.addEventListener("playing", () => {
      setWakeLock(true);
    });

    v.addEventListener("pause", () => {
      setWakeLock(false);
      if (isSyncActionInProgress || !activeChannel) return;
      const time = v.currentTime;
      activeChannel.send({
        type: "broadcast",
        event: "PAUSE",
        payload: { time, isPlaying: false, sender: currentUserName, sentAt: Date.now() },
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
      if (time < 1.0) return; // Suppress initial stream startup seek to 00:00
      activeChannel.send({
        type: "broadcast",
        event: "SEEK",
        payload: { time, isPlaying: !v.paused, sender: currentUserName, sentAt: Date.now() },
      });
      addEventLog(`⏩ You jumped to ${formatTime(time)}`, currentUserName);
    });
  }

  // Track URL changes when host opens a movie or switches episodes
  let lastRecordedUrl = window.location.href;
  function checkUrlChange() {
    if (!activeRoomId || !isHost) return;
    const currentUrl = window.location.href;
    if (currentUrl !== lastRecordedUrl && (currentUrl.includes("/watch/") || currentUrl.includes("/title/"))) {
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

  // Periodic video, URL, and wake lock watcher to catch dynamic DOM changes
  setInterval(() => {
    attachLocalPlayerListeners();
    checkUrlChange();
    const playing = isVideoPlaying();
    if (playing !== isWakeLockRequested) {
      setWakeLock(playing);
    }
  }, 2000);

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
    if (videoWindow) videoWindow.classList.add("hidden");
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
    updatePillState();
    renderDrawerContent();
  }

  // Purge room when host closes browser tab / window
  window.addEventListener("beforeunload", () => {
    if (isHost && activeRoomId) {
      fetch(`${API_BASE}/api/rooms?id=${encodeURIComponent(activeRoomId)}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {});
    }
  });
})();
