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

    /* Ultra-Sleek Floating Video-First PIP Window (Hardware Composited) */
    .video-call-window {
      position: fixed;
      top: 70px;
      right: 20px;
      width: 240px;
      height: 180px;
      min-width: 160px;
      min-height: 120px;
      max-width: 85vw;
      max-height: 80vh;
      border-radius: 18px;
      /* Transparent — actual video is rendered in document.body <video> elements
         that sit below this Shadow DOM stacking context but are visible through it */
      background: transparent;
      border: 1.5px solid rgba(255, 255, 255, 0.22);
      box-shadow: 0 14px 40px rgba(0, 0, 0, 0.85);
      overflow: visible;
      z-index: 2147483645;
      pointer-events: auto;
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
      transform: translate3d(0, 0, 0);
      will-change: transform;
      -webkit-backface-visibility: hidden;
      backface-visibility: hidden;
      transition: box-shadow 0.2s ease;
    }
    .video-call-window.hidden {
      display: none !important;
    }

    .video-canvas {
      position: relative;
      width: 100%;
      height: 100%;
      /* Transparent so body-level <video> elements show through the Shadow DOM
         stacking context. The waiting overlay provides the dark background when
         no video is playing. */
      background: transparent;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* .remote-video-feed and .local-video-pip live in document.body (not Shadow DOM)
       and are styled inline by livekit.js so iOS WKWebView plays them inline. */

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
      background: linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 35%, transparent 60%, rgba(0,0,0,0.85) 100%);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      padding: 8px;
      z-index: 4;
      opacity: 1;
      transition: opacity 0.2s ease;
      pointer-events: auto;
    }
    .video-controls-overlay.hidden {
      opacity: 0 !important;
      pointer-events: none !important;
    }

    .overlay-close-btn {
      align-self: flex-end !important;
      width: 28px !important;
      height: 28px !important;
      border-radius: 14px !important;
      background: rgba(0, 0, 0, 0.75) !important;
      border: 1px solid rgba(255, 255, 255, 0.35) !important;
      color: #ffffff !important;
      font-size: 13px !important;
      font-weight: 700 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      touch-action: manipulation !important;
      -webkit-tap-highlight-color: transparent !important;
      pointer-events: auto !important;
      z-index: 10 !important;
    }
    .overlay-close-btn:active { transform: scale(0.92) !important; }

    .video-control-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 5px 8px;
      background: rgba(12, 14, 24, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 22px;
      pointer-events: auto;
      z-index: 10;
    }

    .call-ctrl-btn {
      width: 34px !important;
      height: 34px !important;
      min-width: 34px !important;
      min-height: 34px !important;
      border-radius: 17px !important;
      background: rgba(255, 255, 255, 0.08) !important;
      border: 1px solid rgba(255, 255, 255, 0.25) !important;
      color: #ffffff !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      touch-action: manipulation !important;
      -webkit-tap-highlight-color: transparent !important;
      user-select: none !important;
      -webkit-user-select: none !important;
      pointer-events: auto !important;
      z-index: 10 !important;
    }
    .call-ctrl-btn svg, .call-ctrl-btn path, .call-ctrl-btn rect, .call-ctrl-btn line {
      pointer-events: none !important;
    }
    .call-ctrl-btn:active { transform: scale(0.92) !important; }
    .call-ctrl-btn.off {
      background: rgba(239, 68, 68, 0.9) !important;
      border-color: #EF4444 !important;
    }
    .call-ctrl-btn.end-call {
      background: #EF4444 !important;
      border-color: #DC2626 !important;
    }

    .video-resize-handle {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 32px !important;
      height: 32px !important;
      cursor: nwse-resize;
      display: flex;
      align-items: flex-end;
      justify-content: flex-end;
      padding: 6px;
      touch-action: none;
      z-index: 20 !important;
      pointer-events: auto !important;
    }

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