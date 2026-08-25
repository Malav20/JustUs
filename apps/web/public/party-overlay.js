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

  // Detect Video Player (Netflix API or HTML5 video)
  function findVideoElement() {
    return document.querySelector(".watch-video video, .sizing-wrapper video, video");
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

  function playVideo() {
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.play === "function") {
      try {
        netflixPlayer.play();
        return;
      } catch (e) {}
    }
    const v = findVideoElement();
    if (v && v.paused) {
      v.play().catch(() => {});
      const playBtn = document.querySelector("button[data-uia='control-play-pause']");
      if (playBtn) playBtn.click();
    }
  }

  function pauseVideo() {
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
    const netflixPlayer = getNetflixPlayer();
    if (netflixPlayer && typeof netflixPlayer.seek === "function") {
      try {
        netflixPlayer.seek(timeInSeconds * 1000);
        return;
      } catch (e) {}
    }
    const v = findVideoElement();
    if (v && Math.abs(v.currentTime - timeInSeconds) > 0.4) {
      v.currentTime = timeInSeconds;
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
    "all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important; pointer-events: none !important;";

  const shadow = hostDiv.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    
    .floating-pill {
      position: fixed;
      top: 14px;
      right: 16px;
      height: 38px;
      padding: 0 16px;
      border-radius: 19px;
      background: rgba(18, 20, 31, 0.92);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.22);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      z-index: 2147483647;
      pointer-events: auto;
      user-select: none;
      -webkit-user-select: none;
      transition: transform 0.15s ease, background 0.2s ease;
    }
    .floating-pill:active { transform: scale(0.96); }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10B981;
      box-shadow: 0 0 8px #10B981;
    }
    .status-dot.idle { background: #6366F1; box-shadow: 0 0 8px #6366F1; }

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

  // Floating Button Element
  const pill = document.createElement("div");
  pill.className = "floating-pill";
  pill.innerHTML = `
    <span class="status-dot idle" id="ju-status-dot"></span>
    <span id="ju-pill-text">🎉 Watch Party</span>
  `;
  shadow.appendChild(pill);

  // Drawer Overlay Element
  const drawer = document.createElement("div");
  drawer.className = "drawer-overlay";
  shadow.appendChild(drawer);

  document.body.appendChild(hostDiv);

  // Draggable Physics & Tap Handler on Pill
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let startPos = { x: 0, y: 0 };
  let lastToggleTimestamp = 0;

  drawer.addEventListener("touchstart", (e) => e.stopPropagation());
  drawer.addEventListener("touchmove", (e) => e.stopPropagation());
  drawer.addEventListener("touchend", (e) => e.stopPropagation());
  drawer.addEventListener("click", (e) => e.stopPropagation());

  pill.addEventListener("touchstart", (e) => {
    isDragging = false;
    const touch = e.touches[0];
    const rect = pill.getBoundingClientRect();
    startPos.x = touch.clientX;
    startPos.y = touch.clientY;
    dragOffset.x = touch.clientX - rect.left;
    dragOffset.y = touch.clientY - rect.top;
  }, { passive: true });

  pill.addEventListener("touchmove", (e) => {
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - startPos.x) > 6 || Math.abs(touch.clientY - startPos.y) > 6) {
      isDragging = true;
    }
    if (isDragging) {
      const newX = Math.max(10, Math.min(window.innerWidth - 160, touch.clientX - dragOffset.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 50, touch.clientY - dragOffset.y));
      pill.style.left = newX + "px";
      pill.style.right = "auto";
      pill.style.top = newY + "px";
    }
  }, { passive: true });

  pill.addEventListener("touchend", (e) => {
    if (!isDragging) {
      e.preventDefault();
      e.stopPropagation();
      toggleDrawer();
    }
  });

  pill.addEventListener("click", (e) => {
    if (!isDragging) {
      e.preventDefault();
      e.stopPropagation();
      toggleDrawer();
    }
  });

  function toggleDrawer() {
    const now = Date.now();
    if (now - lastToggleTimestamp < 350) return;
    lastToggleTimestamp = now;

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
            <span>🍿</span>
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
    if (!dot || !text) return;
    if (activeRoomId) {
      dot.className = "status-dot";
      text.textContent = `👥 Party: ${activeRoomId}`;
    } else {
      dot.className = "status-dot idle";
      text.textContent = "🎉 Watch Party";
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // PARTY LIFECYCLE & SYNC LOGIC
  // ─────────────────────────────────────────────────────────────────
  function createParty() {
    const newRoomId = "ju_" + Math.random().toString(36).substring(2, 8);
    isHost = true;
    activeRoomId = newRoomId;

    loadSupabase(() => {
      // 1. Post to Vercel Room API
      fetch(`${API_BASE}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customId: newRoomId,
          service: window.location.hostname.includes("prime") ? "prime" : "netflix",
          videoUrl: window.location.href,
          title: document.title || "JustUS Watch Party",
          hostId: currentUserName,
        }),
      }).catch(() => {});

      // 2. Connect Realtime Sync
      connectRealtimeChannel(newRoomId, true);
      addEventLog(`🎉 ${currentUserName} created the watch party!`, currentUserName);
      updatePillState();
      renderDrawerContent();
    });
  }

  function joinParty(codeOrUrl) {
    let cleanCode = codeOrUrl.trim();
    if (cleanCode.includes("/join/")) {
      cleanCode = cleanCode.split("/join/")[1].split("?")[0].split("/")[0];
    } else if (cleanCode.includes("/party/")) {
      cleanCode = cleanCode.split("/party/")[1].split("?")[0].split("/")[0];
    }
    isHost = false;
    activeRoomId = cleanCode;

    loadSupabase(() => {
      connectRealtimeChannel(cleanCode, false);
      addEventLog(`🍿 You joined the party (${cleanCode})`, currentUserName);
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
      .on("broadcast", { event: "USER_JOINED" }, ({ payload }) => {
        if (payload.userName && payload.userName !== currentUserName) {
          addEventLog(`🍿 ${payload.userName} joined the watch party`, payload.userName);
        }
      })
      .on("broadcast", { event: "CHAT" }, ({ payload }) => {
        addEventLog(payload.text, payload.sender, "chat");
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
        }
      });

    attachLocalPlayerListeners();
  }

  function sendChat(text) {
    if (!activeChannel) return;
    const payload = { sender: currentUserName, text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    activeChannel.send({ type: "broadcast", event: "CHAT", payload });
    addEventLog(text, currentUserName, "chat");
  }

  function handleRemotePlay(payload) {
    const sender = payload.sender || "Friend";
    const timeStr = formatTime(payload.time);
    addEventLog(`▶️ Played video at ${timeStr}`, sender);
    isSyncActionInProgress = true;
    const latency = (Date.now() - (payload.sentAt || Date.now())) / 1000;
    const target = payload.time + (latency > 0 && latency < 2 ? latency : 0);
    seekVideo(target);
    playVideo();
    setTimeout(() => (isSyncActionInProgress = false), 1000);
  }

  function handleRemotePause(payload) {
    const sender = payload.sender || "Friend";
    const timeStr = formatTime(payload.time);
    addEventLog(`⏸️ Paused video at ${timeStr}`, sender);
    isSyncActionInProgress = true;
    seekVideo(payload.time);
    pauseVideo();
    setTimeout(() => (isSyncActionInProgress = false), 1000);
  }

  function handleRemoteSeek(payload) {
    const sender = payload.sender || "Friend";
    const timeStr = formatTime(payload.time);
    addEventLog(`⏩ Jumped to ${timeStr}`, sender);
    isSyncActionInProgress = true;
    seekVideo(payload.time);
    setTimeout(() => (isSyncActionInProgress = false), 1000);
  }

  function handleRemoteHeartbeat(payload) {
    if (isSyncActionInProgress) return;
    const current = getCurrentVideoTime();
    const latency = (Date.now() - (payload.sentAt || Date.now())) / 1000;
    const target = payload.time + (payload.isPlaying && latency > 0 && latency < 2 ? latency : 0);
    if (Math.abs(current - target) > 1.5) {
      seekVideo(target);
      if (payload.isPlaying && !isVideoPlaying()) playVideo();
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
        sender: currentUserName,
        sentAt: Date.now(),
      },
    });
  }

  function handleStateResponse(payload) {
    if (isInitialSyncCompleted) return;
    isInitialSyncCompleted = true;
    const latency = (Date.now() - (payload.sentAt || Date.now())) / 1000;
    const target = payload.time + (payload.isPlaying && latency > 0 && latency < 2 ? latency : 0);
    seekVideo(target);
    if (payload.isPlaying) playVideo();
    else pauseVideo();
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (!activeChannel || isSyncActionInProgress) return;
      activeChannel.send({
        type: "broadcast",
        event: "SYNC_HEARTBEAT",
        payload: {
          time: getCurrentVideoTime(),
          isPlaying: isVideoPlaying(),
          sender: currentUserName,
          sentAt: Date.now(),
        },
      });
    }, 3000);
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
      if (isSyncActionInProgress || !activeChannel) return;
      const time = v.currentTime;
      activeChannel.send({
        type: "broadcast",
        event: "PLAY",
        payload: { time, isPlaying: true, sender: currentUserName, sentAt: Date.now() },
      });
      addEventLog(`▶️ You played the video at ${formatTime(time)}`, currentUserName);
    });

    v.addEventListener("pause", () => {
      if (isSyncActionInProgress || !activeChannel) return;
      const time = v.currentTime;
      activeChannel.send({
        type: "broadcast",
        event: "PAUSE",
        payload: { time, isPlaying: false, sender: currentUserName, sentAt: Date.now() },
      });
      addEventLog(`⏸️ You paused the video at ${formatTime(time)}`, currentUserName);
    });

    v.addEventListener("seeked", () => {
      if (isSyncActionInProgress || !activeChannel) return;
      const time = v.currentTime;
      activeChannel.send({
        type: "broadcast",
        event: "SEEK",
        payload: { time, isPlaying: !v.paused, sender: currentUserName, sentAt: Date.now() },
      });
      addEventLog(`⏩ You jumped to ${formatTime(time)}`, currentUserName);
    });
  }

  // Periodic video watcher to catch dynamic DOM changes
  setInterval(attachLocalPlayerListeners, 2000);

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

  function leaveParty() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (activeChannel && supabaseClient) {
      supabaseClient.removeChannel(activeChannel);
      activeChannel = null;
    }
    activeRoomId = null;
    updatePillState();
    renderDrawerContent();
  }
})();
