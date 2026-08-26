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