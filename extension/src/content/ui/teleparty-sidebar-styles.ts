export const TELEPARTY_SIDEBAR_CSS = `* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }

  #tp-sidebar-container {
    position: fixed;
    top: 0;
    right: 0;
    width: 330px;
    height: 100vh;
    background: #14151E;
    border-left: 1px solid #232636;
    box-shadow: -10px 0 35px rgba(0, 0, 0, 0.7);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    color: #E2E8F0;
  }

  #tp-sidebar-container.collapsed {
    transform: translateX(330px);
  }

  /* Toggle Tab */
  .tp-sidebar-tab {
    position: absolute;
    left: -32px;
    top: 20px;
    width: 32px;
    height: 42px;
    background: #1E2130;
    border: 1px solid #2B3045;
    border-right: none;
    border-radius: 8px 0 0 8px;
    color: #A5B4FC;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: -4px 4px 12px rgba(0, 0, 0, 0.5);
    transition: background 0.2s;
  }
        .tp-sidebar-tab:hover { background: #2A2F48; }
        .tp-sidebar-tab, .tp-btn-icon, .tp-av-btn, .tp-emoji-btn {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

  /* Top Bar matching Teleparty */
  .tp-topbar {
    height: 48px;
    padding: 0 12px;
    background: #191B26;
    border-bottom: 1px solid #232738;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .tp-topbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tp-brand-icon {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    background: linear-gradient(135deg, #FF4B72, #A838FF);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 12px;
    color: #fff;
  }

  .tp-badge-btn {
    background: #E5A914;
    color: #000;
    font-weight: 800;
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 12px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .tp-topbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tp-counter {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    color: #94A3B8;
  }

  .tp-btn-icon {
    background: transparent;
    border: none;
    color: #94A3B8;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: color 0.2s;
  }
  .tp-btn-icon:hover { color: #fff; background: rgba(255,255,255,0.06); }

  .tp-user-circle {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 800;
    color: #fff;
  }

  /* Video Call Panel (Integrated 1-on-1 Feed) */
  .tp-video-box {
    background: #0D0E15;
    border-bottom: 1px solid #232738;
    position: relative;
  }
  .tp-video-box.hidden {
    display: none !important;
  }

  .tp-video-canvas {
    position: relative;
    width: 100%;
    height: 160px;
    background: #000;
    overflow: hidden;
  }

  .tp-remote-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 0;
  }

  .tp-waiting-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: #0d0f18;
    color: #94A3B8;
    font-size: 11px;
    font-weight: 600;
    z-index: 1;
  }
  .tp-waiting-overlay.hidden {
    display: none;
  }
  .tp-pulse-ring {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #6366F1;
    box-shadow: 0 0 0 rgba(99, 102, 241, 0.4);
    animation: pulseRing 2s infinite;
  }
  @keyframes pulseRing {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
  }

  .tp-local-video-pip {
    position: absolute;
    bottom: 6px;
    right: 6px;
    width: 64px;
    height: 48px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.4);
    object-fit: cover;
    transform: scaleX(-1);
    background: #1E2130;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.8);
    z-index: 2;
  }

  .tp-video-toolbar {
    padding: 6px 10px;
    background: #14151F;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .tp-av-actions {
    display: flex;
    gap: 6px;
  }

  .tp-av-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #fff;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .tp-av-btn.off {
    background: rgba(239, 68, 68, 0.25);
    color: #EF4444;
    border-color: #EF4444;
  }
  .tp-av-btn.active {
    background: rgba(99, 102, 241, 0.3);
    color: #A5B4FC;
    border-color: #6366F1;
  }

  .tp-audio-panel {
    background: #11121C;
    border-top: 1px solid #232738;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: slideDown 0.15s ease;
  }
  .tp-audio-panel.hidden {
    display: none;
  }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .tp-slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tp-slider-label {
    width: 72px;
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: #A5B4FC;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .tp-slider-input {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    background: #25283D;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }
  .tp-slider-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #6366F1;
    cursor: pointer;
    transition: transform 0.1s;
  }
  .tp-slider-input::-webkit-slider-thumb:hover {
    transform: scale(1.25);
  }
  .tp-slider-val {
    width: 32px;
    text-align: right;
    font-family: monospace;
    font-size: 10px;
    color: #E2E8F0;
    font-weight: 700;
  }

  .tp-sync-badge {
    font-size: 10px;
    font-family: monospace;
    background: rgba(0, 0, 0, 0.4);
    padding: 2px 6px;
    border-radius: 4px;
    color: #10B981;
  }

  /* Chat & Event Feed */
  .tp-feed {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tp-log-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #CBD5E1;
    margin: 2px 0;
  }

  .tp-log-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    flex-shrink: 0;
  }

  .tp-log-content {
    font-weight: 500;
  }

  .tp-log-item.playback-action {
    padding-left: 30px;
    color: #94A3B8;
    font-size: 11px;
  }

  .tp-highlight-time {
    color: #10B981;
    font-weight: 700;
    font-family: monospace;
  }

  .tp-chat-msg {
    background: #1C1E2B;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    margin-top: 4px;
  }
  .tp-chat-msg.self {
    background: #252A40;
    border-left: 3px solid #6366F1;
  }

  .tp-msg-header {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #64748B;
    margin-bottom: 2px;
  }
  .tp-msg-sender { font-weight: 700; color: #CBD5E1; }
  .tp-msg-body { color: #F1F5F9; line-height: 1.35; }

  /* Emoji Reactions Bar (Teleparty exact) */
  .tp-reactions-bar {
    padding: 6px 12px;
    display: flex;
    justify-content: space-around;
    background: #161824;
    border-top: 1px solid #232738;
  }

  .tp-emoji-btn {
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    transition: transform 0.15s;
  }
  .tp-emoji-btn:hover { transform: scale(1.3); }

  /* Chat Input Bar */
  .tp-input-row {
    padding: 10px 12px;
    background: #191B26;
    border-top: 1px solid #232738;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tp-input-field {
    flex: 1;
    background: #0F1017;
    border: 1px solid #2A2E44;
    border-radius: 8px;
    padding: 8px 10px;
    color: #fff;
    font-size: 12px;
    outline: none;
  }
  .tp-input-field:focus { border-color: #6366F1; }

  .tp-btn-send {
    background: #E50914;
    border: none;
    border-radius: 8px;
    color: #fff;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  /* Floating Reaction Emojis */
  .tp-floating-reaction {
    position: fixed;
    bottom: 60px;
    font-size: 28px;
    animation: floatUp 2.4s ease-out forwards;
    pointer-events: none;
    z-index: 2147483647;
  }

  @keyframes floatUp {
    0% { transform: translateY(0) scale(0.6); opacity: 1; }
    100% { transform: translateY(-300px) scale(1.4); opacity: 0; }
  }`;
