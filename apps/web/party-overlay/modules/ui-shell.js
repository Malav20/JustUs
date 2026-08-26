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
      <video class="remote-video-feed" id="ju-remote-video" autoplay playsinline webkit-playsinline x-webkit-airplay="deny" disablepictureinpicture controlslist="nodownload nofullscreen noremoteplayback"></video>
      <video class="local-video-pip hidden" id="ju-local-video" autoplay playsinline webkit-playsinline muted x-webkit-airplay="deny" disablepictureinpicture controlslist="nodownload nofullscreen noremoteplayback"></video>

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

  if (document.body || document.documentElement) {
    ensureOverlayMounted();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureOverlayMounted);
  }

  window.addEventListener("yt-navigate-finish", ensureOverlayMounted);
  window.addEventListener("popstate", ensureOverlayMounted);
  window.addEventListener("load", ensureOverlayMounted);

  try {
    const observer = new MutationObserver(() => {
      if (!document.getElementById("justus-party-overlay-root")) {
        scheduleEnsureMounted();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: false });
  } catch (e) {}

  // Drawer Open / Close State Controller
  let isDrawerOpen = false;

  function openDrawer() {
    try {
      isDrawerOpen = true;
      drawer.classList.add("open");
      renderDrawerContent();
    } catch (err) {}
  }

  function closeDrawer(e) {
    if (e) {
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
    }
    isDrawerOpen = false;
    drawer.classList.remove("open");
  }

  function toggleDrawer() {
    if (isDrawerOpen || drawer.classList.contains("open")) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  // Badge taps — bindOverlayTap avoids touchstart + click double-toggle on iPad
  bindOverlayTap(partyPill, () => toggleDrawer());
  bindOverlayTap(videoPill, () => toggleVideoCallWindow());

  // Prevent touches inside drawer from reaching YouTube's gesture handlers
  drawer.addEventListener("touchstart", function(e) { e.stopPropagation(); }, { passive: false });
  drawer.addEventListener("touchmove", function(e) { e.stopPropagation(); }, { passive: false });
  drawer.addEventListener("touchend", function(e) { e.stopPropagation(); }, { passive: false });
  drawer.addEventListener("click", function(e) { e.stopPropagation(); });

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
    }, 5000);
  }

  function isInteractionTargetBlocked(target) {
    return (
      target.closest("button") ||
      target.closest(".call-ctrl-btn") ||
      target.closest(".overlay-close-btn") ||
      target.closest(".video-resize-handle") ||
      target.closest(".video-control-bar")
    );
  }

  function onWindowInteractionStart(e) {
    if (isInteractionTargetBlocked(e.target)) return;
    const pt = getEventPoint(e);
    isDraggingWindow = true;
    hasMovedWindow = false;
    dragWindowStartX = pt.clientX;
    dragWindowStartY = pt.clientY;
    const rect = videoWindow.getBoundingClientRect();
    winStartLeft = rect.left;
    winStartTop = rect.top;
    if (IS_TOUCH_DEVICE) {
      try {
        e.preventDefault();
      } catch (err) {}
    }
  }

  let isPointerMoveScheduled = false;
  let latestPointerEvent = null;

  function onWindowInteractionMove(e) {
    if (!isDraggingWindow) return;
    latestPointerEvent = e;
    if (isPointerMoveScheduled) return;
    isPointerMoveScheduled = true;

    requestAnimationFrame(() => {
      isPointerMoveScheduled = false;
      if (!isDraggingWindow || !latestPointerEvent) return;
      const pt = getEventPoint(latestPointerEvent);
      const deltaX = pt.clientX - dragWindowStartX;
      const deltaY = pt.clientY - dragWindowStartY;

      if (Math.abs(deltaX) > DRAG_THRESHOLD_PX || Math.abs(deltaY) > DRAG_THRESHOLD_PX) {
        hasMovedWindow = true;
      }

      if (hasMovedWindow) {
        const winWidth = videoWindow.offsetWidth;
        const winHeight = videoWindow.offsetHeight;
        const newLeft = Math.max(8, Math.min(window.innerWidth - winWidth - 8, winStartLeft + deltaX));
        const newTop = Math.max(8, Math.min(window.innerHeight - winHeight - 8, winStartTop + deltaY));

        videoWindow.style.left = `${newLeft}px`;
        videoWindow.style.top = `${newTop}px`;
        videoWindow.style.right = "auto";
      }
    });

    if (IS_TOUCH_DEVICE && hasMovedWindow) {
      try {
        e.preventDefault();
      } catch (err) {}
    }
  }

  function onWindowInteractionEnd(e) {
    if (!isDraggingWindow) return;
    isDraggingWindow = false;
    if (!hasMovedWindow) {
      toggleControlsOverlay();
    }
    if (IS_TOUCH_DEVICE) {
      try {
        e.preventDefault();
      } catch (err) {}
    }
  }

  if (IS_TOUCH_DEVICE) {
    videoCanvas.addEventListener("touchstart", onWindowInteractionStart, { passive: false, capture: true });
    window.addEventListener("touchmove", onWindowInteractionMove, { passive: false });
    window.addEventListener("touchend", onWindowInteractionEnd, { passive: false });
    window.addEventListener("touchcancel", onWindowInteractionEnd, { passive: false });
  } else {
    videoCanvas.addEventListener("pointerdown", onWindowInteractionStart);
    window.addEventListener("pointermove", onWindowInteractionMove);
    window.addEventListener("pointerup", onWindowInteractionEnd);
  }

  // Prevent taps inside controls overlay from closing it
  videoControls.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    resetControlsHideTimer();
  });
  videoControls.addEventListener("click", (e) => {
    e.stopPropagation();
    resetControlsHideTimer();
  });

  // Resize Handlers
  let isResizingWindow = false;
  let resizeStartX = 0, resizeStartY = 0;
  let startWinWidth = 0, startWinHeight = 0;

  function onWindowResizeStart(e) {
    if (e) {
      try {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      } catch (err) {}
    }
    isResizingWindow = true;
    const touch = e.touches ? e.touches[0] : e;
    resizeStartX = touch.clientX;
    resizeStartY = touch.clientY;
    startWinWidth = videoWindow.offsetWidth;
    startWinHeight = videoWindow.offsetHeight;
  }

  function onWindowResizeMove(e) {
    if (!isResizingWindow) return;
    if (e) {
      try { e.preventDefault(); } catch (err) {}
    }
    const touch = e.touches ? e.touches[0] : e;
    if (!touch || typeof touch.clientX !== "number") return;
    const deltaX = touch.clientX - resizeStartX;
    const deltaY = touch.clientY - resizeStartY;

    const rect = videoWindow.getBoundingClientRect();
    const maxWidth = window.innerWidth - rect.left - 10;
    const maxHeight = window.innerHeight - rect.top - 10;

    const newWidth = Math.max(160, Math.min(maxWidth, startWinWidth + deltaX));
    const newHeight = Math.max(120, Math.min(maxHeight, startWinHeight + deltaY));

    videoWindow.style.width = `${newWidth}px`;
    videoWindow.style.height = `${newHeight}px`;
  }

  function onWindowResizeEnd() {
    isResizingWindow = false;
  }

  resizeHandle.addEventListener("pointerdown", onWindowResizeStart);
  resizeHandle.addEventListener("touchstart", onWindowResizeStart, { passive: false });
  window.addEventListener("pointermove", onWindowResizeMove);
  window.addEventListener("touchmove", onWindowResizeMove, { passive: false });
  window.addEventListener("pointerup", onWindowResizeEnd);
  window.addEventListener("touchend", onWindowResizeEnd);

  // Helper to reliably attach click & touch events with instant touch response
  function setupControlButton(id, callback) {
    const btn = shadow.getElementById(id);
    if (!btn) return;
    bindOverlayTap(btn, () => {
      resetControlsHideTimer();
      callback();
    });
  }

  // Video Window Control Buttons
  setupControlButton("ju-btn-close-call", () => {
    videoWindow.classList.add("hidden");
    if (remoteVideoTrack && typeof remoteVideoTrack.setSubscribed === "function") {
      remoteVideoTrack.setSubscribed(false);
    }
  });

  setupControlButton("ju-btn-hangup", () => {
    leaveLiveKitCall();
    videoWindow.classList.add("hidden");
  });

  setupControlButton("ju-btn-mic", () => {
    toggleMic();
  });

  setupControlButton("ju-btn-cam", () => {
    toggleCam();
  });

  setupControlButton("ju-btn-flip", () => {
    flipCamera();
  });

  // ─────────────────────────────────────────────────────────────────